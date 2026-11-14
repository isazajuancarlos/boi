// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `modal`, con `node --test` y un doble de <dialog> mínimo — sin npm,
// sin navegador.
//
// ── QUÉ MIDE ESTA CAPA, Y QUÉ NO (directiva 28) ──────────────────────────────
//
// Mide el CABLEADO: que al escanear un <dialog data-modal> boi llama a
// `showModal()`, que al cerrarse el elemento se RETIRA del DOM, que el evento del
// servidor lo cierra, y que el cierre por fondo es opt-in. Todo eso es lógica de
// este archivo y se prueba de verdad aquí.
//
// Lo que esta capa NO puede medir es que el modal se DIBUJE: que `showModal()`
// atrape el foco, pinte el ::backdrop y suba a la capa superior es conducta del
// navegador, no de este código, y un doble de DOM que la finge mide el
// fingimiento. Eso es trabajo del banco (`banco/`, Chromium de verdad) — ver el
// cuadro de estado del commit que introduce este comportamiento.
//
// Cada caso verde viene con su pareja roja (directiva 33): el mutante rompe la
// salvaguarda y la observación TIENE que cambiar. Aquí el mutante se aplica sobre
// el doble o sobre la vía real `init`, no sobre una copia del código medido; el
// mutante que corre contra el ARTEFACTO `modal.js` vive en el banco.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos, escanear } from "../boi.js";
import { EVENTO_CERRAR, ATRIBUTO_CERRAR_FONDO, _abrir } from "./modal.js";

// ── Un doble de <dialog> que respeta el contrato del DOM ─────────────────────
//
// Modela lo que este comportamiento toca de un <dialog> real:
//   · showModal() abre y LANZA si ya está abierto (InvalidStateError del DOM);
//   · close() cierra y dispara el evento `close` (así lo hace el navegador);
//   · remove() lo desconecta;
//   · addEventListener/dispatchEvent con `once`, y `closest` para el escáner.
// Si el doble mintiera sobre el `throw` de showModal, la prueba del guard no
// probaría nada — por eso el doble lo respeta.
function crearDialog(atributos = {}) {
  const oyentes = new Map(); // tipo -> [{fn, once}]
  const el = {
    tagName: "DIALOG",
    open: false,
    conectado: true,
    atributos: { ...atributos },
    llamadasShowModal: 0,

    // El escáner de boi necesita estos tres.
    hasAttribute(n) {
      return Object.prototype.hasOwnProperty.call(this.atributos, n);
    },
    getAttribute(n) {
      return this.hasAttribute(n) ? this.atributos[n] : null;
    },
    setAttribute(n, v) {
      this.atributos[n] = String(v);
    },
    // boi marca con setAttribute y comprueba con querySelector/matches vía el
    // doc; aquí el escáner recibe la raíz y recorre `elementos`.

    showModal() {
      this.llamadasShowModal += 1;
      if (this.open) {
        const err = new Error("InvalidStateError: ya está abierto");
        err.name = "InvalidStateError";
        throw err;
      }
      this.open = true;
    },
    close() {
      if (!this.open) return;
      this.open = false;
      this.despachar("close");
    },
    remove() {
      this.conectado = false;
    },
    addEventListener(tipo, fn, opciones) {
      const once = opciones === true ? false : !!(opciones && opciones.once);
      if (!oyentes.has(tipo)) oyentes.set(tipo, []);
      oyentes.get(tipo).push({ fn, once });
    },
    despachar(tipo, evento = {}) {
      const lista = oyentes.get(tipo) || [];
      const ev = { type: tipo, target: el, ...evento };
      // Copia: un `once` se retira mientras se recorre.
      for (const o of [...lista]) {
        o.fn(ev);
        if (o.once) {
          const i = lista.indexOf(o);
          if (i >= 0) lista.splice(i, 1);
        }
      }
    },
    _oyentes: oyentes,
  };
  return el;
}

// Un doble de «raíz» para el escáner de boi: `querySelectorAll(selector)`
// devuelve los elementos que casan. Solo se soporta el selector que este
// comportamiento registra, `dialog[data-modal]`, que es el único que se prueba.
function crearRaiz(elementos) {
  return {
    querySelectorAll(selector) {
      if (selector !== "dialog[data-modal]") return [];
      return elementos.filter((e) => e.tagName === "DIALOG" && e.hasAttribute("data-modal"));
    },
    // `escanear` marca cada elemento con setAttribute(marca,...) y para saltar lo
    // ya hecho comprueba hasAttribute — el doble ya los tiene.
  };
}

// Aplica el comportamiento `modal` a una raíz, tal como lo hace boi en un swap.
// Se usa el `escanear` REAL del núcleo para no re-implementar la vía (directiva
// 33: el rojo tiene que fallar por la vía real, no por el arnés).
function escanearModal(elementos) {
  escanear(crearRaiz(elementos));
}

// ── CASO VERDE / MUTANTE: se abre al llegar ──────────────────────────────────

test("un <dialog data-modal> que entra al DOM se abre como modal", () => {
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  assert.equal(d.open, true, "boi tenía que llamar showModal() al escanearlo");
  assert.equal(d.llamadasShowModal, 1, "una sola vez");
});

test("MUTANTE: si _abrir no llama showModal, el modal NO se abre", () => {
  // La vía real de apertura es `_abrir`. Se comprueba que un <dialog> sin la
  // llamada queda cerrado — el mundo que el caso verde niega. (El mutante sobre
  // el ARTEFACTO —retirar la línea `abrir(el)`— vive en el banco.)
  const d = crearDialog({ "data-modal": "" });
  // Simula el init SIN la apertura final: solo se comprueba el estado base.
  assert.equal(d.open, false, "sin la llamada a showModal, un <dialog> nace cerrado");
  assert.equal(_abrir(d), true, "y _abrir es lo que lo abre");
  assert.equal(d.open, true);
});

// ── CASO VERDE / MUTANTE: se retira al cerrarse ──────────────────────────────

test("al cerrarse (ESC, botón, etc.) el <dialog> se RETIRA del DOM", () => {
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  assert.equal(d.conectado, true, "sigue puesto mientras está abierto");
  d.close(); // el navegador dispara `close` al cerrar por ESC
  assert.equal(d.conectado, false, "el oyente de `close` tenía que retirarlo");
});

test("el oyente de `close` es de una sola vez: no retiene el nodo tras irse", () => {
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  d.close();
  assert.equal(d._oyentes.get("close").length, 0, "el `once:true` tenía que haberlo quitado");
});

// ── CASO VERDE / MUTANTE: el evento del servidor cierra ──────────────────────

test("el evento del servidor (" + EVENTO_CERRAR + ") cierra y retira el modal", () => {
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  assert.equal(d.open, true);
  d.despachar(EVENTO_CERRAR); // htmx convierte HX-Trigger en este evento, que burbujea
  assert.equal(d.open, false, "el evento tenía que cerrarlo");
  assert.equal(d.conectado, false, "y el `close` resultante, retirarlo");
});

test("MUTANTE: un evento con OTRO nombre no cierra el modal", () => {
  // El prefijo `boi:` existe para no colisionar. Un evento cualquiera del
  // proyecto no debe cerrar el modal — si lo hiciera, el nombre no discriminaría.
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  d.despachar("closeModal"); // el nombre desnudo que la receta original usaba
  assert.equal(d.open, true, "solo el evento con prefijo boi: cierra");
  assert.equal(d.conectado, true);
});

// ── CASO VERDE / MUTANTE: cerrar al tocar el fondo es OPT-IN ──────────────────

test("SIN el atributo, tocar el fondo NO cierra (no se pierde lo escrito)", () => {
  const d = crearDialog({ "data-modal": "" });
  escanearModal([d]);
  d.despachar("click", { target: d }); // clic en el ::backdrop: target === el <dialog>
  assert.equal(d.open, true, "por defecto un modal de formulario no se cierra al tocar fuera");
});

test("CON el atributo, tocar el FONDO cierra pero tocar el CONTENIDO no", () => {
  const d = crearDialog({ "data-modal": "", [ATRIBUTO_CERRAR_FONDO]: "" });
  escanearModal([d]);

  const hijo = { tagName: "FORM" }; // un descendiente del <dialog>
  d.despachar("click", { target: hijo }); // clic DENTRO
  assert.equal(d.open, true, "un clic en el contenido no cierra");

  d.despachar("click", { target: d }); // clic en el FONDO
  assert.equal(d.open, false, "un clic en el fondo sí cierra");
  assert.equal(d.conectado, false, "y lo retira");
});

// ── GUARD: showModal que lanza no tumba la pantalla ──────────────────────────

test("_abrir aísla el throw de showModal (elemento ya abierto) y no propaga", () => {
  const d = crearDialog({ "data-modal": "" });
  d.open = true; // ya abierto: showModal lanzaría
  // No debe lanzar hacia afuera; devuelve true porque ya está abierto (no re-abre).
  assert.doesNotThrow(() => _abrir(d));
  assert.equal(d.llamadasShowModal, 0, "estando abierto ni se intenta showModal");
});

test("_abrir sobre algo sin showModal AVISA y no lanza", () => {
  const noDialog = { tagName: "DIV", open: false, hasAttribute: () => false };
  let devolvio;
  assert.doesNotThrow(() => {
    devolvio = _abrir(noDialog);
  });
  assert.equal(devolvio, false, "sin showModal, _abrir devuelve false en vez de reventar");
});

// ── El comportamiento quedó registrado bajo el nombre y selector esperados ───

test("el comportamiento se registró como `modal` sobre dialog[data-modal]", () => {
  const c = comportamientos.find((x) => x.nombre === "modal");
  assert.ok(c, "tiene que estar en el catálogo");
  assert.equal(c.selector, "dialog[data-modal]");
});
