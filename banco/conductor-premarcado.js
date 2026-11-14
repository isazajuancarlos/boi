// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Pulsa UNA vez el botón premarcado y cuenta lo que se ve. Si la acción salió,
// lo sabe el servidor —que es la frontera de verdad—, no esta página.

const rutaDelInforme = () =>
  document.querySelector('meta[name="boi-informe"]').getAttribute("content");

const observaciones = { fallos: [] };
addEventListener("error", (e) => observaciones.fallos.push(String(e.message || e.error)));

addEventListener("load", async () => {
  try {
    const boton = document.getElementById("peligro");
    observaciones.marcaDeBoi = document.documentElement.getAttribute("data-boi");
    observaciones.llegaMarcado = boton.hasAttribute("boi-confirmar-doble-listo");
    observaciones.textoAntes = boton.textContent.trim();

    boton.click();
    // Tiempo de sobra para que htmx mande la petición si nadie la cortó.
    await new Promise((res) => setTimeout(res, 600));

    observaciones.textoDespues = boton.textContent.trim();
    observaciones.quedoArmado = boton.classList.contains("armado");
  } catch (err) {
    observaciones.fallos.push("conductor premarcado: " + String(err));
  }
  navigator.sendBeacon(rutaDelInforme(), JSON.stringify(observaciones));
});
