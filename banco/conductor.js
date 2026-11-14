// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// El conductor: corre DENTRO del navegador, observa y manda el informe. No
// afirma nada — las afirmaciones viven en `navegador.test.js`, del lado de
// `node --test`. Aquí solo se recogen hechos, para que un mismo informe sirva
// tanto al caso verde como a los mutantes.
//
// Manda el informe SIEMPRE, también si algo revienta: un banco que se queda
// callado cuando el código falla no distingue «no falló» de «murió antes de
// mirar» (directiva 30). Por eso hay oyente de `error`, de promesa rechazada, y
// un plazo máximo.

// La ruta lleva un nonce que pone el servidor: un informe forjado desde otra
// pestaña del navegador no puede falsear el veredicto de la prueba.
const rutaDelInforme = () =>
  document.querySelector('meta[name="boi-informe"]').getAttribute("content");

const observaciones = { fallos: [] };
let mandado = false;

function mandar() {
  if (mandado) return;
  mandado = true;
  navigator.sendBeacon(rutaDelInforme(), JSON.stringify(observaciones));
}

addEventListener("error", (e) => {
  observaciones.fallos.push(String(e.message || e.error));
});
addEventListener("unhandledrejection", (e) => {
  observaciones.fallos.push("promesa: " + String(e.reason));
});

// El plazo máximo es del conductor, no del arnés: así el informe llega con lo
// que se alcanzó a ver en vez de no llegar.
setTimeout(() => {
  observaciones.plazoAgotado = true;
  mandar();
}, 8000);

const inicializaciones = () => globalThis.__inicializaciones || 0;
const espera = (ms) => new Promise((res) => setTimeout(res, ms));

addEventListener("load", async () => {
  try {
    // 1. ¿Cargó boi y se enganchó? Es el rastro del núcleo, y la única señal que
    //    distingue «el módulo corrió» de «el navegador no lo ejecutó».
    observaciones.marcaDeBoi = document.documentElement.getAttribute("data-boi");
    observaciones.hayNucleo = typeof globalThis.boi === "object";

    // 2. El escaneo de la carga inicial.
    observaciones.inicialContado = document.getElementById("inicial").dataset.contado === "sí";
    observaciones.trasCargar = inicializaciones();

    // 3. EL INTERCAMBIO DE VERDAD. htmx pide `/fragmento` y lo inserta; el
    //    elemento que llega está marcado y nunca lo ha tocado nadie.
    const asentado = new Promise((res) =>
      document.body.addEventListener("htmx:afterSettle", res, { once: true }),
    );
    document.getElementById("traer").click();
    observaciones.intercambioAsentado = await Promise.race([
      asentado.then(() => true),
      espera(4000).then(() => false),
    ]);

    const traido = document.querySelector("#destino [data-contar]");
    observaciones.fragmentoLlego = Boolean(traido);
    observaciones.fragmentoContado = Boolean(traido) && traido.dataset.contado === "sí";
    observaciones.trasIntercambio = inicializaciones();

    // 4. Idempotencia en el navegador de verdad: volver a escanear el mismo
    //    subárbol no puede inicializar nada otra vez.
    globalThis.boi?.escanear(document.getElementById("destino"));
    observaciones.trasReescanear = inicializaciones();
  } catch (err) {
    observaciones.fallos.push("conductor: " + String(err));
  }
  mandar();
});
