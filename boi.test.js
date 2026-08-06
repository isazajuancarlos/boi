// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza Arenas
//
// Prueba del NÚCLEO de boi, con el runner nativo `node --test` — sin npm, sin
// node_modules (Node ≥ 18 lo trae de fábrica). La lógica del escáner (idempotencia, la raíz que encaja, el
// aislamiento de un `init` roto) se prueba con un doble de DOM mínimo; no hace
// falta un navegador. El comportamiento REAL en el navegador (que un fragmento
// de htmx llegue vivo) se prueba E2E con Chromium headless desde el primer
// proyecto que use boi (directiva 28) — eso no cabe aquí.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos, enganchar, escanear, marca, registrar } from "./boi.js";

// ── Un doble de DOM mínimo ────────────────────────────────────────────────────
// Un "elemento" con lo justo que el escáner toca: atributos, matches, y un árbol
// para querySelectorAll. Cero dependencias.
function elem(selectorPropio, hijos = []) {
  const atributos = new Set();
  return {
    selectorPropio, // qué selector "encaja" con este nodo (simplificación)
    hijos,
    hasAttribute: (a) => atributos.has(a),
    setAttribute: (a) => atributos.add(a),
    matches: (sel) => sel === selectorPropio,
    querySelectorAll(sel) {
      const out = [];
      const visitar = (n) => {
        for (const h of n.hijos) {
          if (h.matches(sel)) out.push(h);
          visitar(h);
        }
      };
      visitar(this);
      return out;
    },
  };
}

// Cada test empieza con el registro vacío: el estado es de módulo y se comparte.
function limpiar() {
  comportamientos.length = 0;
}

test("un nombre repetido se rechaza, no se ignora en silencio", () => {
  limpiar();
  registrar("x", "[data-x]", () => {});
  assert.throws(() => registrar("x", "[data-otro]", () => {}), /ya está registrado/);
});

test("init se llama UNA vez por elemento que encaja, incluida la raíz", () => {
  limpiar();
  const vistos = [];
  registrar("m", "[data-m]", (el) => vistos.push(el.selectorPropio));

  const raiz = elem("[data-m]", [
    elem("[data-m]", []),
    elem("[data-otro]", [elem("[data-m]", [])]),
  ]);
  escanear(raiz);
  // La raíz encaja + dos descendientes con [data-m] = 3.
  assert.equal(vistos.length, 3);
});

test("re-escanear NO re-inicializa lo ya hecho (idempotencia — principio 3)", () => {
  limpiar();
  let veces = 0;
  registrar("m", "[data-m]", () => veces++);

  const hijo = elem("[data-m]");
  const raiz = elem("[data-raiz]", [hijo]);
  escanear(raiz);
  escanear(raiz); // el swap de htmx re-escanea el mismo subárbol
  escanear(raiz);
  assert.equal(veces, 1, "el init corrió más de una vez pese a la marca");
  assert.equal(hijo.hasAttribute(marca("m")), true);
});

test("un elemento nuevo dentro de un subárbol ya escaneado SÍ se inicializa", () => {
  limpiar();
  const vistos = [];
  registrar("m", "[data-m]", (el) => vistos.push(el));

  const viejo = elem("[data-m]");
  const raiz = elem("[data-raiz]", [viejo]);
  escanear(raiz);
  assert.equal(vistos.length, 1);

  // Llega un fragmento nuevo (como un swap de htmx) con otro [data-m].
  const nuevo = elem("[data-m]");
  raiz.hijos.push(nuevo);
  escanear(raiz);
  assert.equal(vistos.length, 2, "el elemento nuevo no se inicializó");
  assert.equal(vistos.includes(nuevo), true);
});

test("un init que lanza NO tumba el escaneo del resto (principio 4)", () => {
  limpiar();
  const ok = [];
  registrar("roto", "[data-roto]", () => {
    throw new Error("a propósito");
  });
  registrar("sano", "[data-sano]", (el) => ok.push(el));

  const raiz = elem("[data-raiz]", [elem("[data-roto]"), elem("[data-sano]")]);
  // No debe propagar la excepción.
  escanear(raiz);
  assert.equal(ok.length, 1, "el comportamiento sano no corrió tras el roto");
});

test("escanear tolera una raíz que no es un elemento (sin DOM, sin crash)", () => {
  limpiar();
  registrar("m", "[data-m]", () => {
    throw new Error("no debería llamarse");
  });
  escanear(null);
  escanear(undefined);
  escanear({}); // sin querySelectorAll
  // Si llegamos aquí sin lanzar, pasa.
  assert.equal(true, true);
});

// ── El rastro que hace observable a boi desde un E2E ──────────────────────────

test("enganchar marca el documento: es lo único que un E2E puede mirar", () => {
  limpiar();
  const oyentes = [];
  const raiz = elem("html");
  const doc = {
    documentElement: raiz,
    body: elem("body"),
    addEventListener: (ev) => oyentes.push(ev),
  };

  enganchar(doc);

  assert.equal(
    raiz.hasAttribute("data-boi"),
    true,
    "sin la marca, «el módulo cargó» y «el navegador no lo ejecutó» se ven igual",
  );
  // Y sigue haciendo lo suyo: la marca no sustituye al enganche.
  assert.deepEqual(oyentes, ["DOMContentLoaded", "htmx:load"]);
});

// La pareja (directiva 33): el caso que TIENE que no marcar. Si `enganchar`
// marcara pase lo que pase, el E2E daría verde con boi muerto — que es
// exactamente el fallo que la marca existe para detectar.
test("un documento inservible NO se marca: la marca miente si es incondicional", () => {
  limpiar();
  const raiz = elem("html");
  // Sin `addEventListener` no hay enganche posible, así que tampoco hay nada
  // que anunciar. `enganchar` sale antes de tocar el documento.
  enganchar({ documentElement: raiz, body: elem("body") });

  assert.equal(
    raiz.hasAttribute("data-boi"),
    false,
    "se marcó un documento al que boi no llegó a engancharse",
  );
});
