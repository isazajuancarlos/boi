// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El `node:assert/strict` que las pruebas de lógica esperan, reimplementado para
// correr en el NAVEGADOR — parte de la migración del arnés de node a Rust (ver
// banco/MIGRACION.md). Las pruebas se importan SIN TOCARLAS: un import-map en
// `logica.html` hace que `import { strict as assert } from "node:assert"` y
// `import assert from "node:assert/strict"` resuelvan aquí.
//
// Solo se implementa lo que las 65 pruebas usan de verdad —`equal`, `deepEqual`,
// `ok`, `throws`, `rejects`, `match`, `doesNotThrow`—, con la MISMA semántica de
// node en lo que importa: `equal` es `Object.is` (el `strictEqual` de node desde
// v10), y `deepEqual` es estructural con hojas por `Object.is`. Un método que
// falte lanza en vez de mentir «pasó» (directiva 20).

function fallar(mensaje, extra) {
  const e = new Error(extra ? mensaje + " — " + extra : mensaje);
  e.name = "AssertionError";
  throw e;
}

function iguales(a, b) {
  return Object.is(a, b);
}

function profundamenteIguales(a, b) {
  if (iguales(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const aEsArr = Array.isArray(a);
  const bEsArr = Array.isArray(b);
  if (aEsArr !== bEsArr) return false;
  const clavesA = Object.keys(a);
  const clavesB = Object.keys(b);
  if (clavesA.length !== clavesB.length) return false;
  for (const k of clavesA) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!profundamenteIguales(a[k], b[k])) return false;
  }
  return true;
}

function mostrar(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Comprueba que `err` casa con lo esperado: un RegExp contra el mensaje, o una
// función-predicado que devuelve algo verdadero. Es lo que node acepta como
// segundo argumento de `throws`/`rejects`.
function casa(err, esperado) {
  if (esperado === undefined) return true;
  if (esperado instanceof RegExp) return esperado.test(String(err && err.message));
  if (typeof esperado === "function") {
    // Puede ser un constructor de error o un predicado. Se prueban ambos.
    try {
      if (err instanceof esperado) return true;
    } catch {
      /* no era constructor */
    }
    return Boolean(esperado(err));
  }
  return true;
}

const assert = {
  equal(actual, esperado, mensaje) {
    if (!iguales(actual, esperado)) {
      fallar(mensaje || `equal: ${mostrar(actual)} !== ${mostrar(esperado)}`);
    }
  },
  strictEqual(actual, esperado, mensaje) {
    assert.equal(actual, esperado, mensaje);
  },
  deepEqual(actual, esperado, mensaje) {
    if (!profundamenteIguales(actual, esperado)) {
      fallar(mensaje || `deepEqual: ${mostrar(actual)} !== ${mostrar(esperado)}`);
    }
  },
  deepStrictEqual(actual, esperado, mensaje) {
    assert.deepEqual(actual, esperado, mensaje);
  },
  ok(valor, mensaje) {
    if (!valor) fallar(mensaje || `ok: el valor es ${mostrar(valor)}`);
  },
  match(cadena, expresion, mensaje) {
    if (!(expresion instanceof RegExp)) fallar("match: el segundo argumento no es un RegExp");
    if (!expresion.test(cadena)) {
      fallar(mensaje || `match: ${mostrar(cadena)} no casa con ${expresion}`);
    }
  },
  throws(fn, esperado, mensaje) {
    let lanzo = false;
    let capturado;
    try {
      fn();
    } catch (err) {
      lanzo = true;
      capturado = err;
    }
    if (!lanzo) fallar(mensaje || "throws: no lanzó nada");
    if (!casa(capturado, esperado)) {
      fallar(mensaje || `throws: el error ${mostrar(String(capturado))} no casa con lo esperado`);
    }
  },
  doesNotThrow(fn, mensaje) {
    try {
      fn();
    } catch (err) {
      fallar(mensaje || `doesNotThrow: lanzó ${mostrar(String(err))}`);
    }
  },
  async rejects(fn, esperado, mensaje) {
    let rechazo = false;
    let capturado;
    try {
      // `fn` puede ser una función que devuelve promesa, o una promesa.
      await (typeof fn === "function" ? fn() : fn);
    } catch (err) {
      rechazo = true;
      capturado = err;
    }
    if (!rechazo) fallar(mensaje || "rejects: la promesa no se rechazó");
    if (!casa(capturado, esperado)) {
      fallar(mensaje || `rejects: el error ${mostrar(String(capturado))} no casa con lo esperado`);
    }
  },
};

// Se exporta como named `strict` y como default, que son las dos formas con que
// las pruebas lo importan (`{ strict as assert }` y `import assert from
// "node:assert/strict"`).
export const strict = assert;
export default assert;
