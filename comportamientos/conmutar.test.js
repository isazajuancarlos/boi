// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `conmutar`, con `node --test` (bajo el arnés Rust, en un Worker de
// Chromium sin `document`) y dobles de DOM mínimos.
//
// ── QUÉ MIDE ESTA CAPA (directiva 28) ────────────────────────────────────────
//
// La LÓGICA de conmutación: qué tokens satisface el valor del maestro, qué
// dependiente se ve según su regla `si`/`no`, y que ocultar deshabilita sus
// controles (y mostrar los re-habilita, solo los que nosotros tocamos). Que la
// pantalla REACCIONE viva a un swap de htmx es la promesa del NÚCLEO y la cubre el
// banco de navegador; aquí se mide el códec de la decisión.
//
// Cada verde con su pareja roja (directiva 33): el mutante se aplica sobre la vía
// real (`_debeVerse`, `_aplicarEstado`, `_tokensDelMaestro`), no sobre una copia.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos } from "../boi.js";
import {
  _tokensDelMaestro,
  _debeVerse,
  _aplicarEstado,
  ATRIBUTO_DESACTIVADO,
} from "./conmutar.js";

// Un doble de campo maestro: lo mínimo que `_tokensDelMaestro` toca.
function campo({ tipo = "text", value = "", checked = false, name = "", form = null } = {}) {
  return { type: tipo, value, checked, name, form };
}

// Un doble de dependiente con controles dentro, para `_aplicarEstado`.
function dependiente({ si, no } = {}) {
  const attrs = {};
  if (si !== undefined) attrs[ "data-conmutar-si" ] = si;
  if (no !== undefined) attrs[ "data-conmutar-no" ] = no;
  const controles = [];
  const dep = {
    tagName: "DIV",
    hidden: false,
    _attrs: attrs,
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n); },
    getAttribute(n) { return this.hasAttribute(n) ? this._attrs[n] : null; },
    setAttribute(n, v) { this._attrs[n] = String(v); },
    removeAttribute(n) { delete this._attrs[n]; },
    querySelectorAll() { return controles; },
    _controles: controles,
  };
  return dep;
}
function control({ disabled = false } = {}) {
  const attrs = {};
  return {
    tagName: "INPUT",
    disabled,
    _attrs: attrs,
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n); },
    setAttribute(n) { this._attrs[n] = ""; },
    removeAttribute(n) { delete this._attrs[n]; },
  };
}

// ── tokensDelMaestro ─────────────────────────────────────────────────────────

test("texto: el valor crudo y :lleno/:vacio", () => {
  assert.ok(_tokensDelMaestro(campo({ value: "otro" })).has("otro"));
  assert.ok(_tokensDelMaestro(campo({ value: "otro" })).has(":lleno"));
  assert.ok(_tokensDelMaestro(campo({ value: "" })).has(":vacio"));
});

test("checkbox: :marcado/:desmarcado según checked", () => {
  assert.ok(_tokensDelMaestro(campo({ tipo: "checkbox", checked: true, value: "x" })).has(":marcado"));
  assert.ok(_tokensDelMaestro(campo({ tipo: "checkbox", checked: false })).has(":desmarcado"));
});

test("MUTANTE: un checkbox desmarcado NO satisface :marcado", () => {
  // Si tokensDelMaestro añadiera siempre :marcado, la conmutación por checkbox
  // sería ciega. El control: desmarcado no lo trae.
  assert.equal(_tokensDelMaestro(campo({ tipo: "checkbox", checked: false })).has(":marcado"), false);
});

// ── debeVerse: la regla si/no ────────────────────────────────────────────────

test("si: se ve cuando el token del maestro está en la lista", () => {
  const tokens = new Set(["otro", ":lleno"]);
  assert.equal(_debeVerse(dependiente({ si: "otro credito" }), tokens), true);
  assert.equal(_debeVerse(dependiente({ si: "tarjeta" }), tokens), false);
});

test("no: se OCULTA cuando el token está en la lista (inverso de si)", () => {
  const tokens = new Set(["tarjeta", ":lleno"]);
  assert.equal(_debeVerse(dependiente({ no: "tarjeta" }), tokens), false);
  assert.equal(_debeVerse(dependiente({ no: "otro" }), tokens), true);
});

test("sin regla: devuelve null (marcado ambiguo, se avisa y se deja visible)", () => {
  assert.equal(_debeVerse(dependiente({}), new Set(["x"])), null);
});

test("MUTANTE: `no` tratado como `si` invertiría la visibilidad", () => {
  // El control demuestra que `no` NO es `si`: con el mismo token, `si` mostraría
  // y `no` oculta. Si el código confundiera ambos, este par colapsaría.
  const tokens = new Set(["tarjeta"]);
  assert.equal(_debeVerse(dependiente({ si: "tarjeta" }), tokens), true);
  assert.equal(_debeVerse(dependiente({ no: "tarjeta" }), tokens), false);
});

// ── aplicarEstado: hidden + disabled, y solo re-habilita lo nuestro ──────────

test("ocultar deshabilita los controles y los marca; mostrar los revierte", () => {
  const dep = dependiente({ si: "otro" });
  const c = control();
  dep._controles.push(c);

  _aplicarEstado(dep, false);
  assert.equal(dep.hidden, true);
  assert.equal(c.disabled, true, "un control oculto no debe enviarse");
  assert.ok(c.hasAttribute(ATRIBUTO_DESACTIVADO), "marcado como deshabilitado por nosotros");

  _aplicarEstado(dep, true);
  assert.equal(dep.hidden, false);
  assert.equal(c.disabled, false, "al mostrar se re-habilita");
  assert.equal(c.hasAttribute(ATRIBUTO_DESACTIVADO), false, "y se quita la marca");
});

test("MUTANTE: no re-habilitar lo que el PROYECTO deshabilitó", () => {
  // Un control ya `disabled` por el proyecto (sin nuestra marca) NO debe
  // re-habilitarse al mostrar el dependiente. Es el falso arreglo que se cuela
  // (directiva 20): tocar lo que no pusimos.
  const dep = dependiente({ si: "otro" });
  const c = control({ disabled: true }); // el proyecto lo deshabilitó
  dep._controles.push(c);

  _aplicarEstado(dep, false); // ocultar: no lo marca porque ya estaba disabled
  assert.equal(c.hasAttribute(ATRIBUTO_DESACTIVADO), false, "no lo marcamos: no era nuestro");
  _aplicarEstado(dep, true); // mostrar
  assert.equal(c.disabled, true, "sigue deshabilitado: no lo pusimos nosotros");
});

// ── registro ─────────────────────────────────────────────────────────────────

test("el comportamiento se registró como `conmutar` sobre [data-conmutar]", () => {
  const c = comportamientos.find((x) => x.nombre === "conmutar");
  assert.ok(c, "tiene que estar en el catálogo");
  assert.equal(c.selector, "[data-conmutar]");
});
