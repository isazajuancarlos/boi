// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El comportamiento de prueba del banco. Cuenta cuántas veces lo han
// INICIALIZADO, que es la magnitud que distingue las tres cosas que hay que
// medir: que se aplicó al cargar, que se aplicó a lo que trajo htmx, y que
// re-escanear no lo vuelve a aplicar.
//
// Importa `../boi.js` —no `/boi.js`— porque es exactamente lo que hacen los
// comportamientos de verdad al vendorizarse sin tocar una línea.

import { registrar } from "../boi.js";

registrar("contar", "[data-contar]", (el) => {
  globalThis.__inicializaciones = (globalThis.__inicializaciones || 0) + 1;
  el.dataset.contado = "sí";
});
