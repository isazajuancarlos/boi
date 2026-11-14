// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Conductor del banco de `expandir`: corre DENTRO de Chromium. Mide lo que el
// doble de DOM no puede (directiva 28): que un clic REAL en la zona muerta de la
// fila reenvía al enlace y htmx trae el fragmento; que un clic en el botón propio
// NO dispara el enlace; y que con TEXTO SELECCIONADO tampoco —esa rama usa
// `getSelection`, que no existe en el Worker de las pruebas de lógica (directiva
// 30: el negativo solo vale si el camino corre)—.

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

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const onceSettle = () =>
  new Promise((res) => document.body.addEventListener("htmx:afterSettle", res, { once: true }));
const enlaceDisparo = () => !!document.querySelector("#salida #traido");

function seleccionarTexto(el) {
  const sel = getSelection();
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(el);
  sel.addRange(r);
}
function limpiarSeleccion() {
  const sel = getSelection();
  if (sel) sel.removeAllRanges();
}

addEventListener("load", async () => {
  try {
    obs.marcaDeBoi = document.documentElement.getAttribute("data-boi");
    obs.hayNucleo = typeof globalThis.boi === "object";

    // 1. CLIC EN ZONA MUERTA → reenvía al enlace → htmx trae el fragmento.
    const s1 = onceSettle();
    document.getElementById("zona").click();
    await Promise.race([s1, espera(3000)]);
    obs.zonaDispara = enlaceDisparo();
    document.getElementById("salida").innerHTML = "";

    // 2. CON TEXTO SELECCIONADO, el mismo clic NO debe navegar.
    seleccionarTexto(document.getElementById("zona"));
    document.getElementById("zona").click();
    await espera(300);
    obs.conSeleccionDispara = enlaceDisparo();
    limpiarSeleccion();
    document.getElementById("salida").innerHTML = "";

    // 3. CLIC EN EL BOTÓN PROPIO: hace SU acción (el servidor la cuenta), pero NO
    //    dispara el enlace. El conteo del servidor lo verifica el lado de Rust.
    document.getElementById("propio").click();
    await espera(400);
    obs.propioDisparaEnlace = enlaceDisparo();

    mandar();
  } catch (err) {
    obs.fallos.push("conductor: " + String(err));
    mandar();
  }
});
