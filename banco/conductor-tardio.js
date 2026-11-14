// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Importa boi con el documento YA analizado y observa si el escaneo inicial
// llegó a ocurrir — y si el rastro del DOM dice la verdad sobre ello.

// La ruta lleva un nonce que pone el servidor: un informe forjado desde otra
// pestaña del navegador no puede falsear el veredicto de la prueba.
const rutaDelInforme = () =>
  document.querySelector('meta[name="boi-informe"]').getAttribute("content");

const observaciones = { fallos: [] };

addEventListener("error", (e) => observaciones.fallos.push(String(e.message || e.error)));

addEventListener("load", async () => {
  try {
    observaciones.documentoYaAnalizado = document.readyState !== "loading";
    await import("/boi.js");
    await import("/comportamientos/contar.js");
    // Un respiro por si el escaneo se aplazara a una microtarea.
    await new Promise((res) => setTimeout(res, 100));

    observaciones.marcaDeBoi = document.documentElement.getAttribute("data-boi");
    observaciones.inicialContado = document.getElementById("inicial").dataset.contado === "sí";
    observaciones.trasCargar = globalThis.__inicializaciones || 0;
  } catch (err) {
    observaciones.fallos.push("conductor tardío: " + String(err));
  }
  navigator.sendBeacon(rutaDelInforme(), JSON.stringify(observaciones));
});
