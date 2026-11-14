// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// expandir — hace clicable un CONTENEDOR entero (una fila, una tarjeta)
// disparando el enlace o botón que lleva dentro, sin duplicar el `href` ni
// escribir JS por fila.
//
//     <tr data-expandir>
//       <td><a href="/monstruos/42">Balam</a></td>
//       <td>nivel 7</td>
//       <td><button hx-delete="/monstruos/42">borrar</button></td>
//     </tr>
//
// Un clic en cualquier parte de la fila que NO sea un control propio dispara el
// PRIMER enlace/botón de dentro (aquí, ir a /monstruos/42). El botón «borrar»
// sigue siendo suyo: un clic ahí borra, no navega.
//
// ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
//
// De la técnica `[up-expand]` de Unpoly (MIT). Se portó la técnica, no el código:
// htmx no tiene equivalente —es interacción pura de cliente, sin petición— y es de
// las que se reescriben mal a mano en cada tabla. Cazada vía mindalá (característica
// 2, candidato 52203829) el 2026-09-28.
//
// ── ES MEJORA PROGRESIVA ─────────────────────────────────────────────────────
//
// Sin `boi.js`, el enlace interno funciona como cualquier enlace y el teclado
// llega a él por tabulación: boi solo AÑADE que el clic valga en toda la fila. No
// se toca el foco ni se hace la fila «focusable», porque el destino real —el
// enlace— ya lo es; duplicar el foco daría dos paradas de tabulación para una
// sola acción.
//
// ── DECISIONES MEDIDAS CONTRA EL USUARIO LEGÍTIMO (directiva 21) ─────────────
//
//   · Ctrl/Cmd/Shift-clic y el clic que no es del botón primario NO se secuestran:
//     abrir en pestaña nueva o en ventana es del usuario, y forzar `.click()`
//     lo rompería llevándolo a la misma pestaña.
//   · Si el usuario está SELECCIONANDO texto (arrastró y soltó sobre la fila), no
//     se dispara: leer y copiar una celda no puede navegar sin querer.
//   · Un clic sobre un control interactivo propio (otro enlace, un botón, un
//     campo, una etiqueta, un <summary>, algo con `tabindex`) se deja en paz.

import { registrar } from "../boi.js";

// Lo que cuenta como «control propio» dentro del contenedor: si el clic cae en
// uno de estos (o dentro de uno), es SUYO y no se secuestra. `label` entra porque
// activa a su control asociado; `[contenteditable]` porque es un campo de texto.
const INTERACTIVOS =
  'a[href], button, input, select, textarea, label, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';

// ¿El usuario dejó texto seleccionado? Un clic que termina un arrastre de
// selección no debe navegar. Se comprueba en el momento del clic.
function haySeleccion() {
  if (typeof getSelection !== "function") return false;
  const sel = getSelection();
  return !!sel && !sel.isCollapsed && String(sel).length > 0;
}

// El destino del contenedor: el PRIMER <a href> o <button> descendiente. El <a>
// se prefiere; si no hay, el primer botón. Es lo que se dispara.
function destino(contenedor) {
  return (
    contenedor.querySelector("a[href]") ||
    contenedor.querySelector("button")
  );
}

// ¿Debe este clic disparar el destino? Separado para probarlo sin un navegador:
// recibe los hechos del evento y el contenedor, y decide. Devuelve el elemento a
// disparar, o `null` si el clic se deja en paz.
export function objetivoDelClic(contenedor, ev) {
  // Solo el botón primario del ratón, y sin modificadores (abrir-en-pestaña).
  if (ev.button && ev.button !== 0) return null;
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return null;
  if (haySeleccion()) return null;

  const t = ev.target;
  if (t && typeof t.closest === "function") {
    // Si el clic cae en un control propio, es suyo. `closest` acotado al
    // contenedor: un interactivo que estuviera FUERA no cuenta (no debería pasar,
    // pero el clic siempre nace dentro del contenedor por ser su oyente).
    const propio = t.closest(INTERACTIVOS);
    if (propio && contenedor.contains(propio)) {
      // Excepción: si ESE control es justamente el destino, no hacemos nada y
      // dejamos que funcione solo —dispararlo otra vez lo activaría dos veces—.
      return null;
    }
  }

  const d = destino(contenedor);
  return d || null;
}

registrar("expandir", "[data-expandir]", (contenedor) => {
  // Un contenedor sin ningún enlace ni botón no tiene qué disparar: se avisa una
  // vez (directiva 20) en vez de tragarse los clics en silencio.
  if (!destino(contenedor)) {
    avisar("[data-expandir] sin <a href> ni <button> dentro; no hace nada", contenedor);
    return;
  }

  contenedor.addEventListener("click", (ev) => {
    const d = objetivoDelClic(contenedor, ev);
    if (!d) return;
    // Disparar el destino. Para un <a>, `.click()` sigue el `href` o dispara htmx
    // si lleva `hx-*` (htmx oye sobre el propio enlace): boi reenvía el clic, no
    // hace la petición (README: «no reemplaza a htmx»).
    if (typeof d.click === "function") d.click();
  });
});

function avisar(mensaje, ...resto) {
  if (typeof console !== "undefined") console.warn("boi/expandir: " + mensaje, ...resto);
}

// Se exportan para las pruebas.
export const _destino = destino;
