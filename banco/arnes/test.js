// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El `node:test` que las pruebas de lógica esperan, para correr en el NAVEGADOR.
// `test(nombre, fn)` no ejecuta: ENCOLA. El controlador de `logica.html` corre la
// cola en orden —una a una, esperando las asíncronas— y recoge el veredicto. Es
// el `node --test` reemplazado por un corredor mínimo, sin cambiar una línea de
// las pruebas (parte de la migración del arnés; ver banco/MIGRACION.md).

export const cola = [];

// node acepta `test(nombre, fn)` y `test(nombre, opciones, fn)`. Las pruebas de
// boi solo usan la primera forma; la segunda se soporta por si acaso y para no
// tragarse un argumento en silencio.
export function test(nombre, a, b) {
  const fn = typeof a === "function" ? a : b;
  if (typeof fn !== "function") {
    throw new Error(`test("${nombre}", …): no se pasó una función`);
  }
  cola.push({ nombre, fn });
}

export default test;

// Corre la cola en orden. Devuelve una lista de `{ nombre, ok, error }`. No se
// detiene en el primer fallo: se corren todas, como `node --test`, para que un
// informe traiga TODO lo que falló y no solo lo primero.
export async function correrTodo() {
  const resultados = [];
  for (const { nombre, fn } of cola) {
    try {
      await fn();
      resultados.push({ nombre, ok: true });
    } catch (err) {
      resultados.push({ nombre, ok: false, error: String((err && err.message) || err) });
    }
  }
  return resultados;
}
