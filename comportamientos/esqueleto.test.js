// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `esqueleto` — LA CAPA DE LÓGICA, con la advertencia de la directiva
// 28 escrita encima: lo DISTINTIVO de este comportamiento —medir el DOM real con
// `getBoundingClientRect` y dibujar el shimmer sobre esas coordenadas— NO se
// puede medir sin maquetación, y un doble que la finja mide el fingimiento. Esa
// parte, con su mutante que descoloca los bloques, vive en el banco de navegador
// (`banco/pagina-esqueleto.html`, Chromium de verdad).
//
// Aquí solo se mide lo que es pura lógica de DOM y discrimina sin maquetación: el
// registro, y que `ocultar` retira la capa y es idempotente (no revienta sin
// capa). El par verde/mutante de la MEDICIÓN está en el banco.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos } from "../boi.js";
import { _ocultar, CLASES } from "./esqueleto.js";

// Un doble de contenedor con lo justo que `ocultar` toca: una capa opcional que
// `querySelector` devuelve y `remove` desconecta, y un `classList`.
function contenedor({ conCapa = false } = {}) {
  const capa = conCapa
    ? { removido: false, remove() { this.removido = true; } }
    : null;
  const clases = new Set();
  if (conCapa) clases.add(CLASES.CLASE_ACTIVO);
  return {
    _capa: capa,
    querySelector(sel) {
      return sel === "." + CLASES.CLASE_CAPA ? capa : null;
    },
    classList: {
      add: (c) => clases.add(c),
      remove: (c) => clases.delete(c),
      contains: (c) => clases.has(c),
    },
    _clases: clases,
  };
}

test("ocultar retira la capa y quita la clase de activo", () => {
  const c = contenedor({ conCapa: true });
  assert.equal(c._clases.has(CLASES.CLASE_ACTIVO), true, "arranca activo");
  _ocultar(c);
  assert.equal(c._capa.removido, true, "la capa se retiró");
  assert.equal(c._clases.has(CLASES.CLASE_ACTIVO), false, "y se quitó la clase");
});

test("ocultar es idempotente: sin capa no lanza y no hace nada raro", () => {
  const c = contenedor({ conCapa: false });
  assert.doesNotThrow(() => _ocultar(c));
  assert.equal(c._clases.has(CLASES.CLASE_ACTIVO), false);
});

test("el comportamiento se registró como `esqueleto` sobre [data-esqueleto]", () => {
  const c = comportamientos.find((x) => x.nombre === "esqueleto");
  assert.ok(c, "tiene que estar en el catálogo");
  assert.equal(c.selector, "[data-esqueleto]");
});
