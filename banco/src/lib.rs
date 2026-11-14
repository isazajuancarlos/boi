// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El arnés del banco de boi, en Rust. Reemplaza al orquestador que estaba en node
// (`servidor.js`, `navegador.js`, `navegador.test.js`) sin cambiar lo que corre
// EN el navegador: las páginas, `conductor.js`, `contar.js`, `boi.js` y los
// comportamientos siguen siendo JavaScript ejecutado por Chromium — el único
// motor JS que el stack acepta.
//
// - `servidor`  — el HTTP de loopback que sirve el banco y recoge el informe.
// - `navegador` — lanza y mata Chromium.
// - `json`      — lee el informe sin `serde`.
//
// La orquestación (`correr`) y la mutación del artículo con validación de aguja
// (directiva 33) viven aquí.

use std::io::Read;
use std::time::Duration;

pub mod json;
pub mod navegador;
pub mod servidor;

use json::Valor;

/// El plazo de una corrida completa: arrancar, abrir Chromium, y esperar su
/// informe. El techo, no la duración esperada (una corrida verde tarda ~5 s).
const PLAZO: Duration = Duration::from_secs(30);

/// Nonce hex de 16 bytes de `/dev/urandom` — sin crate de aleatoriedad. Lo usan
/// la ruta del informe (contra un POST forjado desde otra pestaña) y el nombre
/// del perfil de Chromium (contra dos corridas que peleen por el mismo).
pub(crate) fn nonce_hex() -> String {
    let mut f = std::fs::File::open("/dev/urandom").expect("banco: no hay /dev/urandom");
    let mut bytes = [0u8; 16];
    f.read_exact(&mut bytes).expect("banco: /dev/urandom corto");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// El resultado de una corrida: el informe ya parseado, más lo que el SERVIDOR
/// vio (las acciones irreversibles). El DOM puede engañar sobre si una acción
/// salió; el servidor no.
pub struct Corrida {
    pub informe: Valor,
    pub acciones_en_el_servidor: usize,
}

impl Corrida {
    pub fn bool(&self, clave: &str) -> Option<bool> {
        self.informe.get(clave).and_then(|v| v.bool())
    }
    pub fn num(&self, clave: &str) -> Option<f64> {
        self.informe.get(clave).and_then(|v| v.num())
    }
    pub fn txt(&self, clave: &str) -> Option<String> {
        self.informe.get(clave).and_then(|v| v.txt().map(String::from))
    }
    /// `marcaDeBoi` es la única clave que puede llegar como `null` legítimo (boi
    /// no cargó), así que se distingue de «ausente».
    pub fn es_nulo(&self, clave: &str) -> bool {
        self.informe.get(clave).map(|v| v.es_nulo()).unwrap_or(false)
    }
    pub fn fallos(&self) -> Vec<String> {
        self.informe
            .get("fallos")
            .and_then(|v| v.lista())
            .map(|l| l.iter().filter_map(|v| v.txt().map(String::from)).collect())
            .unwrap_or_default()
    }
}

/// La identidad: no muta nada. Para el caso verde.
pub fn sin_mutar(t: String) -> String {
    t
}

/// Devuelve una mutación que sustituye `aguja` por `reemplazo` en el texto,
/// comprobando ANTES que la aguja aparece EXACTAMENTE una vez (directiva 33: si
/// no está, el mutante no es el que se cree y el rojo no probaría nada). El
/// chequeo se hace al construir la mutación, no al servir, para que el test falle
/// con un mensaje claro en vez de servir el artículo intacto en silencio.
pub fn mutar(aguja: &'static str, reemplazo: &'static str) -> impl Fn(String) -> String {
    move |texto: String| {
        let veces = texto.matches(aguja).count();
        assert_eq!(
            veces, 1,
            "la mutación «{aguja}» aparece {veces} veces: el mutante no es el que se cree, \
             así que el rojo no probaría nada"
        );
        texto.replacen(aguja, reemplazo, 1)
    }
}

/// Corre el banco: sirve `pagina`, abre Chromium contra ella, espera el informe y
/// lo parsea. `mutacion`/`mutacion_comportamiento` transforman `boi.js` y
/// `confirmar-doble.js` servidos.
///
/// Si el informe no llega dentro del plazo, se DICE por qué —el navegador ni
/// arrancó, o siguió vivo y callado—, para no confundir «la afirmación falló» con
/// «la medición no ocurrió» (directiva 30).
pub fn correr(
    mutacion: impl Fn(String) -> String,
    mutacion_comportamiento: impl Fn(String) -> String,
    pagina: &str,
) -> Corrida {
    // El comportamiento mutable por defecto es `confirmar-doble` —el que tenía
    // salvaguardas fuera del núcleo cuando se escribió el banco—. Otros
    // comportamientos con salvaguarda propia (p. ej. `esqueleto`, que mide el DOM)
    // usan `correr_con` nombrando su archivo.
    correr_con(mutacion, mutacion_comportamiento, "comportamientos/confirmar-doble.js", pagina)
}

/// Como `correr`, pero eligiendo QUÉ comportamiento se sirve mutado
/// (`comportamiento_rel`, relativo a la raíz del repo). Es la generalización de
/// la 2ª mutación: el banco debe poder romper la salvaguarda de cualquier
/// comportamiento en el ARTEFACTO, no solo la de `confirmar-doble` (directiva 9).
pub fn correr_con(
    mutacion: impl Fn(String) -> String,
    mutacion_comportamiento: impl Fn(String) -> String,
    comportamiento_rel: &str,
    pagina: &str,
) -> Corrida {
    let mut banco = servidor::arrancar(mutacion, mutacion_comportamiento, comportamiento_rel, pagina);
    // El navegador se abre DESPUÉS de que el servidor escucha; si no hay Chromium,
    // `abrir` falla aquí con su nombre y el servidor ya montado se cierra al salir.
    let navegador = navegador::Navegador::abrir(&banco.url);
    let navegador = match navegador {
        Ok(n) => n,
        Err(e) => {
            banco.parar();
            panic!("{e}");
        }
    };

    let crudo = banco.esperar_informe(PLAZO);
    let acciones = banco.acciones();
    // El navegador se deja caer (Drop lo mata) y el servidor se para.
    drop(navegador);
    banco.parar();

    let crudo = crudo.unwrap_or_else(|| {
        panic!(
            "el navegador no mandó informe en {} s. NO es un fallo de la afirmación: es que la \
             medición no llegó a ocurrir.",
            PLAZO.as_secs()
        )
    });

    let informe = json::parsear(&crudo)
        .unwrap_or_else(|e| panic!("informe ilegible ({e}); crudo = {crudo}"));

    Corrida {
        informe,
        acciones_en_el_servidor: acciones,
    }
}

/// Una prueba de lógica corrida en el navegador.
pub struct Prueba {
    pub nombre: String,
    pub ok: bool,
    pub error: Option<String>,
}

/// El resultado de correr un archivo de pruebas de lógica en Chromium.
pub struct Logica {
    pub pruebas: Vec<Prueba>,
    /// Errores globales de la página (módulo que no cargó, promesa sin capturar).
    pub fallos: Vec<String>,
}

impl Logica {
    pub fn fallidas(&self) -> Vec<&Prueba> {
        self.pruebas.iter().filter(|p| !p.ok).collect()
    }
}

/// Corre UN archivo de pruebas de lógica (p. ej. `/boi.test.js`) dentro de
/// Chromium, vía `logica.html`, y devuelve el veredicto de cada `test(...)`.
/// `env` pasa variables al proceso de Chromium — `TZ` para las pruebas de fecha.
///
/// El archivo se importa SIN TOCARLO: el import-map de `logica.html` resuelve
/// `node:test`/`node:assert` a los shims del arnés.
pub fn correr_logica(archivo: &str, env: &[(&str, &str)]) -> Logica {
    let mut banco =
        servidor::arrancar(sin_mutar, sin_mutar, "comportamientos/confirmar-doble.js", "logica.html");
    let url = format!("{}?archivo={archivo}", banco.url);
    let navegador = match navegador::Navegador::abrir_con_env(&url, env) {
        Ok(n) => n,
        Err(e) => {
            banco.parar();
            panic!("{e}");
        }
    };

    let crudo = banco.esperar_informe(PLAZO);
    drop(navegador);
    banco.parar();

    let crudo = crudo.unwrap_or_else(|| {
        panic!(
            "el navegador no mandó el informe de «{archivo}» en {} s: la medición no ocurrió.",
            PLAZO.as_secs()
        )
    });
    let informe = json::parsear(&crudo)
        .unwrap_or_else(|e| panic!("informe de «{archivo}» ilegible ({e}); crudo = {crudo}"));

    let pruebas = informe
        .get("pruebas")
        .and_then(|v| v.lista())
        .map(|l| {
            l.iter()
                .map(|p| Prueba {
                    nombre: p.get("nombre").and_then(|v| v.txt()).unwrap_or("¿?").to_string(),
                    ok: p.get("ok").and_then(|v| v.bool()).unwrap_or(false),
                    error: p.get("error").and_then(|v| v.txt().map(String::from)),
                })
                .collect()
        })
        .unwrap_or_default();
    let fallos = informe
        .get("fallos")
        .and_then(|v| v.lista())
        .map(|l| l.iter().filter_map(|v| v.txt().map(String::from)).collect())
        .unwrap_or_default();

    Logica { pruebas, fallos }
}
