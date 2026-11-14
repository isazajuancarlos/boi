// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Las pruebas de LÓGICA de boi, corridas en Chromium en vez de en node (F2 de la
// migración; ver banco/MIGRACION.md). Cada archivo `.test.js` se importa SIN
// TOCARLO —el import-map de `logica.html` resuelve `node:test`/`node:assert` a
// los shims del arnés— y se corre en un Chromium recién lanzado, uno por archivo,
// para aislar el estado de módulo igual que `node --test` aísla por proceso.
//
// Cada `#[test]` de aquí envuelve las N pruebas de un archivo: si alguna falla,
// se nombra con su error, y se exige además que haya corrido AL MENOS las que
// el archivo tiene (un archivo que no cargó devolvería 0 pruebas y pasaría en
// falso — directiva 30, el positivo de control).

use banco_boi::{correr_logica, Logica};

fn exigir(nombre_archivo: &str, esperadas_min: usize, o: Logica) {
    assert!(
        o.fallos.is_empty(),
        "{nombre_archivo}: la página soltó errores globales: {:?}",
        o.fallos
    );
    // Positivo de control: el archivo CARGÓ y encoló sus pruebas. Cero pruebas
    // sería un archivo que no cargó, no un archivo sin fallos.
    assert!(
        o.pruebas.len() >= esperadas_min,
        "{nombre_archivo}: corrieron {} pruebas, se esperaban al menos {esperadas_min} — \
         ¿cargó el archivo?",
        o.pruebas.len()
    );
    let fallidas = o.fallidas();
    assert!(
        fallidas.is_empty(),
        "{nombre_archivo}: {} prueba(s) fallaron:\n{}",
        fallidas.len(),
        fallidas
            .iter()
            .map(|p| format!("  · {} — {}", p.nombre, p.error.as_deref().unwrap_or("(sin mensaje)")))
            .collect::<Vec<_>>()
            .join("\n")
    );
}

#[test]
fn nucleo() {
    exigir("boi.test.js", 16, correr_logica("/boi.test.js", &[]));
}

#[test]
fn confirmar_doble() {
    exigir(
        "confirmar-doble.test.js",
        28,
        correr_logica("/comportamientos/confirmar-doble.test.js", &[]),
    );
}

#[test]
fn calendario_multiple() {
    // TZ fuera de UTC: la prueba de fechas solo discrimina así (lo dice el propio
    // archivo). V8 respeta la env del proceso de Chromium.
    exigir(
        "calendario-multiple.test.js",
        10,
        correr_logica(
            "/comportamientos/calendario-multiple.test.js",
            &[("TZ", "Asia/Tokyo")],
        ),
    );
}

#[test]
fn modal() {
    exigir(
        "modal.test.js",
        11,
        correr_logica("/comportamientos/modal.test.js", &[]),
    );
}

#[test]
fn conmutar() {
    exigir(
        "conmutar.test.js",
        10,
        correr_logica("/comportamientos/conmutar.test.js", &[]),
    );
}

#[test]
fn expandir() {
    exigir(
        "expandir.test.js",
        9,
        correr_logica("/comportamientos/expandir.test.js", &[]),
    );
}

#[test]
fn esqueleto() {
    exigir(
        "esqueleto.test.js",
        3,
        correr_logica("/comportamientos/esqueleto.test.js", &[]),
    );
}
