// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza Arenas
//
// Prueba de `confirmar-doble`, con `node --test` y un doble de DOM mínimo — sin
// npm, sin navegador.
//
// **La prueba que da valor a este archivo es `htmx_no_dispara_en_la_primera`**:
// es el defecto REAL que traían las dos copias de las que salió este
// comportamiento, y la única forma de verlo es registrar un oyente en el propio
// elemento —como hace htmx— y comprobar que NO se llama. Con la versión vieja
// (`stopPropagation` en el elemento) esa prueba se pone roja.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos, escanear } from "../boi.js";
import "./confirmar-doble.js";

// ── Un doble de DOM con eventos ──────────────────────────────────────────────
//
// Lo justo para lo que este comportamiento toca: atributos, clases, texto, y un
// despacho de clic que respeta las DOS cosas que aquí importan —que los oyentes
// de captura del documento corren ANTES que los del destino, y que
// `stopImmediatePropagation` corta también a los del mismo nodo—.
function crearDoc() {
  const capturaDoc = [];
  const doc = {
    addEventListener(tipo, fn, captura) {
      if (tipo === "click" && captura) capturaDoc.push(fn);
    },
    // Despacha un clic sobre `el`, como haría el navegador.
    click(el) {
      let cortado = false;
      const evento = {
        target: el,
        defecto: false,
        preventDefault() {
          this.defecto = true;
        },
        stopImmediatePropagation() {
          cortado = true;
        },
        stopPropagation() {
          /* NO corta a los oyentes del mismo nodo — es el defecto que se caza */
        },
      };
      for (const fn of capturaDoc) {
        fn(evento);
        if (cortado) return evento; // nadie más, ni en el destino
      }
      for (const fn of el._oyentes) fn(evento);
      return evento;
    },
  };
  return doc;
}

function boton(doc, texto = "Borrar", atributos = {}) {
  const attrs = new Map(Object.entries(atributos));
  const clases = new Set();
  const el = {
    ownerDocument: doc,
    textContent: texto,
    _oyentes: [],
    selectorPropio: "[data-confirmar]",
    hijos: [],
    hasAttribute: (a) => attrs.has(a),
    getAttribute: (a) => (attrs.has(a) ? attrs.get(a) : null),
    setAttribute: (a, v) => attrs.set(a, v ?? ""),
    removeAttribute: (a) => attrs.delete(a),
    matches: (sel) => sel === "[data-confirmar]",
    querySelectorAll: () => [],
    closest: (sel) => (sel === "[data-confirmar]" ? el : null),
    classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), has: (c) => clases.has(c) },
    // Lo que hace htmx: su propio oyente, en el propio elemento.
    addEventListener: (tipo, fn) => tipo === "click" && el._oyentes.push(fn),
  };
  attrs.set("data-confirmar", atributos["data-confirmar"] ?? "¿Seguro? Pulse otra vez");
  return el;
}

/// El escáner de boi aplica el comportamiento a un elemento suelto.
function enganchar(el) {
  escanear({
    matches: () => false,
    querySelectorAll: (sel) => (sel === "[data-confirmar]" ? [el] : []),
    hijos: [],
  });
}

test("registra un solo comportamiento y con su nombre", () => {
  assert.equal(comportamientos.filter((c) => c.nombre === "confirmar-doble").length, 1);
});

test("la primera pulsación NO ejecuta la acción y cambia el texto", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const e = doc.click(b);
  assert.equal(e.defecto, true, "no se impidió la acción por defecto");
  assert.equal(b.textContent, "¿Seguro? Pulse otra vez");
  assert.equal(b.classList.has("armado"), true);
  assert.equal(b.getAttribute("aria-live"), "assertive", "sin aviso para el lector de pantalla");
});

test("la segunda pulsación SÍ deja pasar la acción y restaura el texto", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  doc.click(b);
  const e = doc.click(b);
  assert.equal(e.defecto, false, "la segunda pulsación se bloqueó: la acción nunca ocurriría");
  assert.equal(b.textContent, "Borrar");
  assert.equal(b.classList.has("armado"), false);
  assert.equal(b.getAttribute("aria-live"), null);
});

// ── LA PRUEBA DEL DEFECTO ────────────────────────────────────────────────────
//
// htmx registra su oyente en el PROPIO elemento. Con `stopPropagation()` —lo que
// hacían las dos copias— ese oyente se ejecuta igual, y la petición sale a la
// primera pulsación: la confirmación no confirma nada, sin un solo error.
test("htmx NO dispara en la primera pulsación", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  let disparos = 0;
  b.addEventListener("click", () => disparos++); // ← el oyente de htmx

  doc.click(b);
  assert.equal(disparos, 0, "htmx envió la petición en la PRIMERA pulsación");

  doc.click(b);
  assert.equal(disparos, 1, "htmx no envió la petición en la segunda: la acción no ocurre nunca");
});

test("pasada la espera vuelve solo a su estado inicial", async () => {
  const doc = crearDoc();
  const b = boton(doc, "Borrar", { "data-confirmar-espera": "10" });
  enganchar(b);

  doc.click(b);
  assert.equal(b.classList.has("armado"), true);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(b.classList.has("armado"), false, "se quedó armado para siempre");
  assert.equal(b.textContent, "Borrar");

  // Y tras desarmarse, la siguiente pulsación vuelve a ser la PRIMERA: si no,
  // un botón que el usuario dejó armado y olvidó se dispararía con un clic
  // suelto media hora después.
  const e = doc.click(b);
  assert.equal(e.defecto, true, "tras la espera, un clic ejecutó la acción directamente");
});

test("un clic en OTRO elemento no arma este botón", () => {
  const doc = crearDoc();
  const b = boton(doc);
  const otro = boton(doc, "Guardar");
  otro.closest = () => otro; // el otro botón se resuelve a sí mismo
  enganchar(b);

  doc.click(otro);
  assert.equal(b.classList.has("armado"), false, "un clic ajeno armó este botón");
});

test("es idempotente: re-escanear no duplica el oyente", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  enganchar(b); // htmx trae el fragmento otra vez

  // Con el oyente duplicado, la primera pulsación armaría y desarmaría en la
  // misma pasada, y la acción no ocurriría jamás.
  doc.click(b);
  assert.equal(b.classList.has("armado"), true, "el oyente se duplicó al re-escanear");
});
