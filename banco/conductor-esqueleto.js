// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Conductor del banco de `esqueleto`: corre DENTRO de Chromium, observa y manda
// el informe. No afirma —las afirmaciones viven del lado de `cargo test`—.
//
// Mide lo que NINGÚN doble de DOM puede medir (directiva 28): que mientras htmx
// tiene una petición en vuelo aparece una capa de shimmer con bloques cuyas
// coordenadas COINCIDEN con las de las hojas reales del panel —medidas con
// `getBoundingClientRect`, o sea maquetación de verdad— y que al terminar la
// petición la capa se retira. El «coinciden» es la clave: un esqueleto que no
// mide, o que mide mal, dibujaría bloques que no casan con la forma real.

const rutaDelInforme = () =>
  document.querySelector('meta[name="boi-informe"]').getAttribute("content");

const obs = { fallos: [] };
let mandado = false;
function mandar() {
  if (mandado) return;
  mandado = true;
  navigator.sendBeacon(rutaDelInforme(), JSON.stringify(obs));
}
addEventListener("error", (e) => obs.fallos.push(String(e.message || e.error)));
addEventListener("unhandledrejection", (e) => obs.fallos.push("promesa: " + String(e.reason)));
setTimeout(() => {
  obs.plazoAgotado = true;
  mandar();
}, 8000);

// El MISMO criterio de hoja que usa esqueleto.js, calculado por el conductor de
// forma independiente: así comparamos lo que boi dibujó contra la verdad medida
// aquí, no contra sí mismo.
function medirHojas(panel) {
  const rc = panel.getBoundingClientRect();
  const out = [];
  panel.querySelectorAll("*").forEach((el) => {
    if (el.classList && el.classList.contains("boi-esqueleto-capa")) return;
    if (el.childElementCount > 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({ x: r.left - rc.left, y: r.top - rc.top, w: r.width, h: r.height });
  });
  return out;
}

// ¿Cada bloque dibujado cae sobre ALGUNA hoja real (±1px)? Con tolerancia de 1px
// por el redondeo de subpíxel. Cero bloques no coincide con nada.
function casan(bloques, hojas) {
  if (bloques.length === 0) return false;
  const px = (v) => parseFloat(v) || 0;
  return [...bloques].every((b) => {
    const bx = px(b.style.left), by = px(b.style.top), bw = px(b.style.width), bh = px(b.style.height);
    return hojas.some(
      (h) => Math.abs(h.x - bx) <= 1 && Math.abs(h.y - by) <= 1 &&
             Math.abs(h.w - bw) <= 1 && Math.abs(h.h - bh) <= 1,
    );
  });
}

addEventListener("load", () => {
  try {
    obs.marcaDeBoi = document.documentElement.getAttribute("data-boi");
    obs.hayNucleo = typeof globalThis.boi === "object";

    const panel = document.getElementById("panel");
    // Las hojas ANTES de la petición: es la forma que el esqueleto debe copiar.
    const esperadas = medirHojas(panel);
    obs.hojasEsperadas = esperadas.length;

    // En vuelo: el listener de esqueleto (registrado en su init, ANTES que este)
    // ya dibujó la capa en este mismo dispatch, así que aquí ya está.
    panel.addEventListener(
      "htmx:beforeRequest",
      () => {
        obs.capaEnVuelo = !!panel.querySelector(".boi-esqueleto-capa");
        obs.activoEnVuelo = panel.classList.contains("boi-esqueleto-activo");
        const bloques = panel.querySelectorAll(".boi-esqueleto-bloque");
        obs.numBloques = bloques.length;
        obs.bloquesCoinciden = casan(bloques, esperadas);
      },
      { once: true },
    );

    // Al terminar: el listener de esqueleto (antes que este) ya retiró la capa.
    panel.addEventListener(
      "htmx:afterRequest",
      () => {
        obs.capaTrasTerminar = !!panel.querySelector(".boi-esqueleto-capa");
        obs.activoTrasTerminar = panel.classList.contains("boi-esqueleto-activo");
        obs.fragmentoLlego = !!document.querySelector("#resultados #traido");
        mandar();
      },
      { once: true },
    );

    document.getElementById("recargar").click();
  } catch (err) {
    obs.fallos.push("conductor: " + String(err));
    mandar();
  }
});
