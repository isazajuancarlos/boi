// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El servidor del banco: `std::net` y nada más — el equivalente fiel del
// `node:http` que reemplaza. Sirve la página, `boi.js` (con la mutación del
// artefacto), htmx, el comportamiento de prueba y el FRAGMENTO que htmx trae por
// un intercambio de verdad, y recoge por POST el informe que la página manda
// desde dentro del navegador.
//
// El informe llega por la RED y no por el DOM volcado: `--dump-dom` vuelca cuando
// el navegador cree haber terminado, y un intercambio de htmx es asíncrono. Un
// volcado tomado un instante antes se ve idéntico a un comportamiento que no se
// enganchó (directiva 30).
//
// `mutacion` recibe el texto de `boi.js` y devuelve el que se sirve. Con ella el
// banco rompe la salvaguarda EN EL CÓDIGO MEDIDO —no en el arnés— y exige que la
// prueba se ponga roja (directiva 33).

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// El fragmento que htmx inserta. Trae un elemento marcado: si boi no reescanea lo
// que llega, este elemento se queda sin su comportamiento y el informe lo dice.
const FRAGMENTO: &str = r#"<p id="traido" data-contar>llegado por htmx</p>"#;

/// La raíz del repo (el padre de `banco/`), calculada desde este archivo.
fn raiz_repo() -> PathBuf {
    // CARGO_MANIFEST_DIR es `banco/`; el repo es su padre.
    let banco = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    banco.parent().map(PathBuf::from).unwrap_or(banco)
}

fn banco_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn tipo_por_extension(ruta: &str) -> &'static str {
    if ruta.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if ruta.ends_with(".js") {
        "text/javascript; charset=utf-8"
    } else {
        "application/octet-stream"
    }
}

use crate::nonce_hex;

/// Lo que `arrancar` devuelve: la URL contra la que abrir Chromium, el receptor
/// del informe, el contador de acciones irreversibles, y el apagado.
pub struct Banco {
    pub url: String,
    informe: Receiver<String>,
    acciones: Arc<AtomicUsize>,
    parar: Arc<AtomicBool>,
    hilo: Option<thread::JoinHandle<()>>,
    puerto: u16,
}

impl Banco {
    /// Espera el informe de la página, hasta `plazo`. Devuelve `None` si no llega
    /// —que NO es «la prueba falló», es «la medición no ocurrió» (directiva 30);
    /// quien llama lo distingue mirando cómo murió el navegador.
    pub fn esperar_informe(&self, plazo: Duration) -> Option<String> {
        self.informe.recv_timeout(plazo).ok()
    }

    /// Cuántas veces se pidió la acción irreversible.
    pub fn acciones(&self) -> usize {
        self.acciones.load(Ordering::SeqCst)
    }

    /// Apaga el servidor. Se pone el flag y se abre una conexión títere al propio
    /// puerto para desbloquear el `accept()` en curso, en vez de sondear con
    /// `sleep` — así el cierre es inmediato y no cuelga.
    pub fn parar(&mut self) {
        self.parar.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", self.puerto));
        if let Some(h) = self.hilo.take() {
            let _ = h.join();
        }
    }
}

impl Drop for Banco {
    fn drop(&mut self) {
        self.parar();
    }
}

/// Arranca el servidor en un puerto efímero de loopback. `mutacion` transforma el
/// `boi.js` servido; `mutacion_comportamiento` hace lo mismo con el comportamiento
/// `confirmar-doble.js` (hay salvaguardas que no viven en el núcleo). `pagina` es
/// el nombre del HTML raíz a servir.
pub fn arrancar(
    mutacion: impl Fn(String) -> String,
    mutacion_comportamiento: impl Fn(String) -> String,
    comportamiento_rel: &str,
    pagina: &str,
) -> Banco {
    let raiz = raiz_repo();
    let banco = banco_dir();

    let boi_servido =
        mutacion(std::fs::read_to_string(raiz.join("boi.js")).expect("banco: falta boi.js"));
    // El comportamiento que se sirve MUTADO. `comportamiento_rel` es relativo a la
    // raíz del repo (p. ej. `comportamientos/esqueleto.js`); se sirve bajo su ruta
    // web `/<comportamiento_rel>`, y esa comprobación va ANTES del volcado plano de
    // `/comportamientos/` para que gane la versión mutada, no la del disco.
    let comportamiento_servido = mutacion_comportamiento(
        std::fs::read_to_string(raiz.join(comportamiento_rel))
            .unwrap_or_else(|_| panic!("banco: falta {comportamiento_rel}")),
    );
    let comportamiento_ruta = format!("/{comportamiento_rel}");

    let ruta_informe = format!("/informe/{}", nonce_hex());

    // La tabla CERRADA de archivos del disco: la ruta pedida se busca como clave
    // exacta, nunca se concatena con lo que llega por la red (directiva 20). Lo
    // que no está aquí no se sirve.
    let mut archivos: HashMap<String, PathBuf> = HashMap::new();
    archivos.insert("/".into(), banco.join(pagina));
    archivos.insert("/htmx.min.js".into(), banco.join("vendor").join("htmx.min.js"));
    archivos.insert("/conductor.js".into(), banco.join("conductor.js"));
    archivos.insert("/conductor-tardio.js".into(), banco.join("conductor-tardio.js"));
    archivos.insert(
        "/conductor-premarcado.js".into(),
        banco.join("conductor-premarcado.js"),
    );
    archivos.insert(
        "/conductor-esqueleto.js".into(),
        banco.join("conductor-esqueleto.js"),
    );
    archivos.insert(
        "/conductor-expandir.js".into(),
        banco.join("conductor-expandir.js"),
    );
    archivos.insert(
        "/comportamientos/contar.js".into(),
        banco.join("contar.js"),
    );
    // F2: el arnés de las pruebas de LÓGICA en el navegador (dentro de un Worker).
    archivos.insert("/logica.html".into(), banco.join("logica.html"));
    archivos.insert("/arnes/test.js".into(), banco.join("arnes").join("test.js"));
    archivos.insert("/arnes/assert.js".into(), banco.join("arnes").join("assert.js"));
    archivos.insert(
        "/arnes/trabajador.js".into(),
        banco.join("arnes").join("trabajador.js"),
    );

    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("banco: no pude escuchar en loopback");
    let puerto = listener.local_addr().unwrap().port();
    listener
        .set_nonblocking(true)
        .expect("banco: no pude poner el listener en no-bloqueante");

    let acciones = Arc::new(AtomicUsize::new(0));
    let parar = Arc::new(AtomicBool::new(false));
    let (tx, rx) = channel::<String>();
    // El informe se entrega UNA vez; el Sender va tras un Mutex<Option<...>> para
    // que la primera entrega lo consuma y las siguientes (informes forjados, o el
    // plazo del conductor) no rompan nada.
    let entrega: Arc<Mutex<Option<Sender<String>>>> = Arc::new(Mutex::new(Some(tx)));

    let ctx = Contexto {
        boi_servido: Arc::new(boi_servido),
        comportamiento_servido: Arc::new(comportamiento_servido),
        comportamiento_ruta: Arc::new(comportamiento_ruta),
        ruta_informe: Arc::new(ruta_informe),
        archivos: Arc::new(archivos),
        raiz: Arc::new(raiz),
        acciones: acciones.clone(),
        entrega,
    };

    let parar_hilo = parar.clone();
    let hilo = thread::spawn(move || {
        for flujo in listener.incoming() {
            if parar_hilo.load(Ordering::SeqCst) {
                break;
            }
            match flujo {
                Ok(flujo) => {
                    let ctx = ctx.clone();
                    // Un hilo por conexión: Chromium abre varias a la vez, y un
                    // servidor secuencial las bloquearía unas a otras.
                    thread::spawn(move || {
                        let _ = atender(flujo, &ctx);
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(5));
                }
                Err(_) => break,
            }
        }
    });

    Banco {
        url: format!("http://127.0.0.1:{puerto}/"),
        informe: rx,
        acciones,
        parar,
        hilo: Some(hilo),
        puerto,
    }
}

#[derive(Clone)]
struct Contexto {
    boi_servido: Arc<String>,
    comportamiento_servido: Arc<String>,
    comportamiento_ruta: Arc<String>,
    ruta_informe: Arc<String>,
    archivos: Arc<HashMap<String, PathBuf>>,
    raiz: Arc<PathBuf>,
    acciones: Arc<AtomicUsize>,
    entrega: Arc<Mutex<Option<Sender<String>>>>,
}

fn atender(mut flujo: TcpStream, ctx: &Contexto) -> std::io::Result<()> {
    // Se lee hasta el fin de las cabeceras (\r\n\r\n), y luego el cuerpo según
    // Content-Length. Suficiente para GET de archivos y POST del informe; no se
    // pretende un servidor HTTP completo, sino el mínimo que este banco necesita.
    let mut datos: Vec<u8> = Vec::new();
    let mut buf = [0u8; 4096];
    let fin_cabeceras;
    loop {
        let n = flujo.read(&mut buf)?;
        if n == 0 {
            return Ok(()); // conexión cerrada antes de una petición completa
        }
        datos.extend_from_slice(&buf[..n]);
        if let Some(pos) = encontrar(&datos, b"\r\n\r\n") {
            fin_cabeceras = pos + 4;
            break;
        }
        if datos.len() > 1 << 20 {
            return responder(&mut flujo, 431, "text/plain", b"cabeceras demasiado grandes");
        }
    }

    let cabeceras_txt = String::from_utf8_lossy(&datos[..fin_cabeceras]).to_string();
    let mut lineas = cabeceras_txt.lines();
    let linea_peticion = lineas.next().unwrap_or("");
    let mut partes = linea_peticion.split_whitespace();
    let metodo = partes.next().unwrap_or("").to_string();
    let ruta_completa = partes.next().unwrap_or("/").to_string();
    let ruta = ruta_completa.split('?').next().unwrap_or("/").to_string();

    // El cuerpo, si lo hay.
    let largo: usize = cabeceras_txt
        .lines()
        .find_map(|l| {
            let l = l.to_ascii_lowercase();
            l.strip_prefix("content-length:")
                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
        })
        .unwrap_or(0);
    let mut cuerpo = datos[fin_cabeceras..].to_vec();
    while cuerpo.len() < largo {
        let n = flujo.read(&mut buf)?;
        if n == 0 {
            break;
        }
        cuerpo.extend_from_slice(&buf[..n]);
    }

    // ── El informe de la página (POST con nonce en la ruta) ──────────────────
    if metodo == "POST" && ruta == *ctx.ruta_informe.as_str() {
        responder(&mut flujo, 204, "text/plain", b"")?;
        let texto = String::from_utf8_lossy(&cuerpo).to_string();
        if let Ok(mut guard) = ctx.entrega.lock() {
            if let Some(tx) = guard.take() {
                let _ = tx.send(texto);
            }
        }
        return Ok(());
    }

    // ── La acción irreversible del caso del botón premarcado ─────────────────
    // Que haya llegado AQUÍ es la única prueba de que la barrera no existió: el
    // DOM puede engañar, el servidor no.
    if metodo == "POST" && ruta == "/accion" {
        ctx.acciones.fetch_add(1, Ordering::SeqCst);
        return responder(&mut flujo, 200, "text/html; charset=utf-8", b"");
    }

    if ruta == "/fragmento" {
        return responder(&mut flujo, 200, "text/html; charset=utf-8", FRAGMENTO.as_bytes());
    }

    // boi.js va MUTADO: se sirve la versión que el test pidió, no la del disco.
    if ruta == "/boi.js" {
        return responder(
            &mut flujo,
            200,
            "text/javascript; charset=utf-8",
            ctx.boi_servido.as_bytes(),
        );
    }
    if ruta == *ctx.comportamiento_ruta.as_str() {
        return responder(
            &mut flujo,
            200,
            "text/javascript; charset=utf-8",
            ctx.comportamiento_servido.as_bytes(),
        );
    }

    // Las pruebas de LÓGICA se sirven con los DOS specifiers de node reescritos a
    // los shims del arnés —`node:test`/`node:assert` no resuelven en un Worker, y
    // el import-map no aplica ahí—. Es un transform mínimo y acotado: solo esas
    // tres cadenas literales, sobre archivos `*.test.js`. El archivo de prueba no
    // se toca en disco. `/strict` va antes que el desnudo para no dejarlo a medias.
    if ruta.ends_with(".test.js") {
        let rel = ruta.trim_start_matches('/');
        if !rel.contains("..") {
            let archivo = ctx.raiz.join(rel);
            if archivo.is_file() {
                let reescrito = std::fs::read_to_string(&archivo)?
                    .replace("\"node:assert/strict\"", "\"/arnes/assert.js\"")
                    .replace("\"node:assert\"", "\"/arnes/assert.js\"")
                    .replace("\"node:test\"", "\"/arnes/test.js\"");
                return responder(
                    &mut flujo,
                    200,
                    "text/javascript; charset=utf-8",
                    reescrito.as_bytes(),
                );
            }
        }
    }

    // Los comportamientos que no se mutan se sirven del disco directamente, bajo
    // `/comportamientos/<archivo>`, tal como los vendoriza un proyecto real.
    if let Some(nombre) = ruta.strip_prefix("/comportamientos/") {
        // Nombre plano, sin `/` ni `..`: la ruta no se concatena con basura de la
        // red (directiva 20).
        if !nombre.is_empty() && !nombre.contains('/') && !nombre.contains("..") {
            let archivo = ctx.raiz.join("comportamientos").join(nombre);
            if archivo.is_file() {
                let bytes = std::fs::read(&archivo)?;
                return responder(&mut flujo, 200, tipo_por_extension(nombre), &bytes);
            }
        }
    }

    // El resto sale de la tabla cerrada.
    if let Some(archivo) = ctx.archivos.get(&ruta) {
        let tipo = tipo_por_extension(archivo.to_string_lossy().as_ref());
        if tipo.starts_with("text/html") {
            let html = std::fs::read_to_string(archivo)?
                .replace("__RUTA_DEL_INFORME__", ctx.ruta_informe.as_str());
            return responder(&mut flujo, 200, tipo, html.as_bytes());
        }
        let bytes = std::fs::read(archivo)?;
        return responder(&mut flujo, 200, tipo, &bytes);
    }

    responder(&mut flujo, 404, "text/plain", b"no esta")
}

fn responder(
    flujo: &mut TcpStream,
    estado: u16,
    tipo: &str,
    cuerpo: &[u8],
) -> std::io::Result<()> {
    let motivo = match estado {
        200 => "OK",
        204 => "No Content",
        404 => "Not Found",
        431 => "Request Header Fields Too Large",
        _ => "OK",
    };
    let cabecera = format!(
        "HTTP/1.1 {estado} {motivo}\r\nContent-Type: {tipo}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        cuerpo.len()
    );
    flujo.write_all(cabecera.as_bytes())?;
    flujo.write_all(cuerpo)?;
    flujo.flush()
}

fn encontrar(heno: &[u8], aguja: &[u8]) -> Option<usize> {
    heno.windows(aguja.len()).position(|v| v == aguja)
}
