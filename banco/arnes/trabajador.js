// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El Worker que corre UN archivo de pruebas de lógica dentro de Chromium. Se
// elige un Worker y no la página porque su ámbito global NO tiene `document`
// —igual que node—, así que `typeof document === "undefined"` cuadra (boi no
// auto-engancha) y las pruebas que reasignan `globalThis.document` funcionan
// (no es un accessor de solo-lectura como en la página). Parte de la migración
// del arnés de node a Rust (banco/MIGRACION.md, F2).
//
// El archivo se importa SIN TOCARLO: el servidor reescribe sus specifiers
// `node:test`/`node:assert` a los shims del arnés antes de servirlo (los
// import-map no aplican a los Workers).

// `process` para el `process.env.TZ` que calendario-multiple.test.js fija en su
// top-level; la zona horaria de verdad la pone la env TZ del proceso de Chromium.
globalThis.process = globalThis.process || { env: {} };

const params = new URLSearchParams(self.location.search);
const archivo = params.get("archivo");
const informe = { archivo, pruebas: [], fallos: [] };

self.addEventListener("error", (e) => informe.fallos.push(String(e.message || e.error)));
self.addEventListener("unhandledrejection", (e) =>
  informe.fallos.push("promesa: " + String(e.reason)),
);

try {
  // Importar el archivo ENCOLA sus `test(...)` vía el shim de node:test.
  await import(archivo);
  // Misma URL resuelta que la que usó el archivo → misma instancia del shim, así
  // que `correrTodo` ve la cola que el archivo llenó.
  const { correrTodo } = await import("/arnes/test.js");
  informe.pruebas = await correrTodo();
} catch (err) {
  informe.fallos.push("cargar/correr «" + archivo + "»: " + String((err && err.stack) || err));
}

self.postMessage(informe);
