// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Arranca un Chromium headless contra una URL y lo mata al terminar. `std` y
// nada más: un cliente de CDP o un `fantoccini` traerían un árbol de crates que
// este arnés existe para no tener. Chromium es un proceso EXTERNO aislado, igual
// que `yt-dlp` en mirador o `nuclei` en nexus.
//
// Si no hay navegador instalado, esto FALLA con su nombre; no se salta la prueba.
// Una prueba que se salta sola es indistinguible de una que pasó (directiva 30).

use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

const CANDIDATOS: &[&str] = &["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

/// Busca el binario recorriendo el PATH a mano —no se le pregunta a un shell:
/// `command -v` pediría `shell: true` y ahí los argumentos se concatenan sin
/// escapar—. Un DIRECTORIO con permiso de ejecución no cuenta: `spawn` de un
/// directorio revienta con un error sin capturar en vez del mensaje de aquí.
pub fn buscar_navegador() -> Result<PathBuf, String> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    for carpeta in std::env::split_paths(&path) {
        for nombre in CANDIDATOS {
            let ruta = carpeta.join(nombre);
            if ruta.is_file() {
                // Ejecutable de verdad: en Unix, algún bit x puesto.
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&ruta) {
                    if meta.permissions().mode() & 0o111 != 0 {
                        return Ok(ruta);
                    }
                }
            }
        }
    }
    Err(format!(
        "banco de boi: no hay navegador. Se buscó {}. La prueba NO se salta: sin navegador no hay medición.",
        CANDIDATOS.join(", ")
    ))
}

/// Un Chromium abierto contra una URL, con su perfil de usar y tirar y su propio
/// grupo de procesos.
pub struct Navegador {
    hijo: Child,
    perfil: PathBuf,
    pgid: i32,
}

impl Navegador {
    /// Lanza Chromium headless contra `url`. Devuelve error solo si el binario no
    /// está o no arranca; que la página mida algo o no es cosa del informe.
    pub fn abrir(url: &str) -> Result<Navegador, String> {
        Navegador::abrir_con_env(url, &[])
    }

    /// Como `abrir`, pero con variables de entorno extra para el proceso de
    /// Chromium. Se usa para `TZ`: V8 respeta la zona horaria del entorno, y una
    /// prueba de fechas (calendario-multiple) solo discrimina fuera de UTC.
    pub fn abrir_con_env(url: &str, env: &[(&str, &str)]) -> Result<Navegador, String> {
        let binario = buscar_navegador()?;

        // Perfil de usar y tirar: sin él, dos corridas seguidas pelean por el
        // mismo directorio y la segunda arranca contra una sesión ya viva.
        let perfil = std::env::temp_dir().join(format!("boi-banco-{}", super::nonce_hex()));
        std::fs::create_dir_all(&perfil).map_err(|e| format!("banco: no pude crear el perfil: {e}"))?;

        let mut orden = Command::new(&binario);
        orden
            .args([
                "--headless",
                "--disable-gpu",
                "--no-first-run",
                "--disable-extensions",
                &format!("--user-data-dir={}", perfil.display()),
                url,
            ]);
        for (k, v) in env {
            orden.env(k, v);
        }
        let hijo = orden
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            // Su propio GRUPO de procesos: Chromium se despliega en varios
            // procesos, y matar solo al líder deja hijos vivos el instante justo
            // de RECREAR el árbol del perfil después de borrarlo (medido en el
            // banco node: 76 perfiles acumulados). Con el grupo se mata el árbol.
            .process_group(0)
            .spawn()
            .map_err(|e| format!("banco: el navegador no arrancó: {e}"))?;

        // Con `process_group(0)` el pgid del hijo es su propio pid.
        let pgid = hijo.id() as i32;

        Ok(Navegador { hijo, perfil, pgid })
    }
}

impl Drop for Navegador {
    fn drop(&mut self) {
        // Se mata el GRUPO entero, no solo al líder. `std` no expone `killpg`, así
        // que se invoca `kill(1)` —proceso externo, cero crates—: `kill -KILL
        // -<pgid>` con el pgid en negativo manda la señal a todo el grupo. Es lo
        // que impide los perfiles acumulados que el banco node documentó.
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", self.pgid)])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        // Y el líder por su cuenta, por si el grupo ya no existía.
        let _ = self.hijo.kill();
        let _ = self.hijo.wait();
        // Se borra el perfil DESPUÉS de matar: si no, los hijos lo rehacen justo
        // tras el borrado y la limpieza queda decorativa.
        let _ = std::fs::remove_dir_all(&self.perfil);
    }
}
