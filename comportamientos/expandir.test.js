// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `expandir`, con `node --test` (Worker de Chromium sin `document`) y
// dobles mínimos.
//
// ── QUÉ MIDE ESTA CAPA (directiva 28) ────────────────────────────────────────
//
// La DECISIÓN de `objetivoDelClic`: qué clic dispara el destino y cuál se deja en
// paz (modificadores, botón no primario, control propio, el propio destino), y
// cuál es el destino (primer <a href>, luego botón). Que un `.click()` real siga
// el enlace o dispare htmx es conducta del NAVEGADOR y va al banco; aquí se mide
// la lógica de la decisión.
//
// La rama de SELECCIÓN de texto (`haySeleccion`) usa `getSelection`, que no existe
// en el Worker: se comprueba en el banco de navegador, no aquí (directiva 30: no
// se finge un negativo por un camino que no corre).
//
// Cada verde con su pareja (directiva 33) sobre la vía real `objetivoDelClic`.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos } from "../boi.js";
import { objetivoDelClic, _destino } from "./expandir.js";

// Doble de contenedor: un enlace y un botón dentro; `querySelector` los devuelve
// por selector, `contains` dice que un nodo está dentro.
function contenedor({ conLink = true, conBoton = true } = {}) {
  const link = conLink ? { tag: "A", click() { this.clickeado = true; } } : null;
  const boton = conBoton ? { tag: "BUTTON", click() { this.clickeado = true; } } : null;
  return {
    _link: link,
    _boton: boton,
    querySelector(sel) {
      if (sel === "a[href]") return link;
      if (sel === "button") return boton;
      return null;
    },
    contains() { return true; },
  };
}

// Doble de evento de clic. `target.closest` devuelve el interactivo propio si se
// pasa uno (para la rama «el clic cayó en un control»).
function clic({ button = 0, ctrl = false, meta = false, shift = false, alt = false, propio = null } = {}) {
  return {
    button,
    ctrlKey: ctrl,
    metaKey: meta,
    shiftKey: shift,
    altKey: alt,
    target: {
      closest(_sel) { return propio; },
    },
  };
}

// ── destino: primer <a href>, si no, botón ──────────────────────────────────

test("destino: prefiere el <a href> sobre el botón", () => {
  const c = contenedor({ conLink: true, conBoton: true });
  assert.equal(_destino(c), c._link);
});

test("destino: si no hay enlace, es el primer botón", () => {
  const c = contenedor({ conLink: false, conBoton: true });
  assert.equal(_destino(c), c._boton);
});

// ── objetivoDelClic: el clic normal dispara ─────────────────────────────────

test("clic normal en zona muerta dispara el destino", () => {
  const c = contenedor();
  assert.equal(objetivoDelClic(c, clic()), c._link);
});

// ── el clic en un control propio se deja en paz ─────────────────────────────

test("clic sobre un control propio (p.ej. el botón borrar) NO se secuestra", () => {
  const c = contenedor();
  const boton = { tag: "BUTTON" };
  assert.equal(objetivoDelClic(c, clic({ propio: boton })), null);
});

test("MUTANTE: ignorar el control propio secuestraría su clic", () => {
  // El control demuestra que la comprobación del interactivo propio discrimina:
  // con `propio` el resultado es null; sin `propio`, el mismo clic dispara. Si el
  // código no mirara `closest`, ambos dispararían y el botón borrar navegaría.
  const c = contenedor();
  const boton = { tag: "BUTTON" };
  assert.equal(objetivoDelClic(c, clic({ propio: boton })), null, "con control propio: en paz");
  assert.equal(objetivoDelClic(c, clic({ propio: null })), c._link, "sin él: dispara");
});

// ── modificadores y botón: abrir-en-pestaña se respeta ──────────────────────

test("ctrl/meta/shift/alt-clic NO se secuestra (abrir en pestaña)", () => {
  const c = contenedor();
  assert.equal(objetivoDelClic(c, clic({ ctrl: true })), null);
  assert.equal(objetivoDelClic(c, clic({ meta: true })), null);
  assert.equal(objetivoDelClic(c, clic({ shift: true })), null);
  assert.equal(objetivoDelClic(c, clic({ alt: true })), null);
});

test("el clic con botón no primario (medio/derecho) NO se secuestra", () => {
  const c = contenedor();
  assert.equal(objetivoDelClic(c, clic({ button: 1 })), null);
  assert.equal(objetivoDelClic(c, clic({ button: 2 })), null);
});

test("MUTANTE: sin la guarda de modificadores, ctrl-clic forzaría misma pestaña", () => {
  const c = contenedor();
  // Con guarda (real): ctrl-clic no dispara. Sin guarda dispararía y rompería
  // abrir-en-pestaña. El par: normal dispara, ctrl no.
  assert.equal(objetivoDelClic(c, clic()), c._link, "clic normal dispara");
  assert.equal(objetivoDelClic(c, clic({ ctrl: true })), null, "ctrl-clic no");
});

// ── registro ─────────────────────────────────────────────────────────────────

test("el comportamiento se registró como `expandir` sobre [data-expandir]", () => {
  const c = comportamientos.find((x) => x.nombre === "expandir");
  assert.ok(c, "tiene que estar en el catálogo");
  assert.equal(c.selector, "[data-expandir]");
});
