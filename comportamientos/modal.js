// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// modal — un <dialog> que htmx trae al DOM se abre como modal, y se retira solo
// al cerrarse.
//
//     <dialog data-modal>
//       <form hx-post="/monstruos" hx-target="this" hx-swap="innerHTML">
//         …campos…
//         <button>Guardar</button>
//       </form>
//     </dialog>
//
// El botón que lo invoca es htmx puro —boi no hace peticiones (README, «Lo que
// NO es»)—:
//
//     <button hx-get="/monstruos/nuevo" hx-target="body" hx-swap="beforeend">
//       Añadir monstruo
//     </button>
//
// htmx inserta el <dialog> al final del body; boi lo escanea al llegar
// (`htmx:load`) y este comportamiento lo abre. Al cerrarse —ESC, el botón de
// cerrar, o el evento de éxito del servidor— el <dialog> se BORRA del DOM, así
// que la próxima vez se pide de nuevo al servidor y nunca se muestra HTML rancio.
//
// ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
//
// De la receta de dominio público de spookylukey/django-htmx-patterns
// (Unlicense), destilada a nuestro stack: el «action-at-a-distance» que la receta
// centra en unas pocas líneas de JS vanilla —abrir el <dialog> tras el swap y
// limpiarlo al cerrar— es EXACTAMENTE lo que boi existe para alojar. No se copió
// código (aquello es Django/Python); se portó la técnica. Adoptado vía mindalá
// (candidato 532074755) el 2026-09-28.
//
// ── ESTE NO ES MEJORA PROGRESIVA, Y HAY QUE DECIRLO ──────────────────────────
//
// Es la excepción al principio de boi «si el JS no carga, la pantalla funciona
// igual» (README, «Lo que NO es»). Un <dialog> SIN el atributo `open` está
// `display:none` por especificación, así que sin `boi.js` el contenido del modal
// NO se ve — no degrada a «peor», degrada a «invisible».
//
// La consecuencia no se tapa, se acota: este patrón SOLO se usa donde el mismo
// endpoint tiene una caída sin-JS. En la receta original eso es el decorador
// `@for_htmx`: la MISMA URL devuelve la página entera cuando la petición no es de
// htmx, y el fragmento-<dialog> cuando sí. Con esa caída, un navegador sin JS
// sigue el enlace y ve la página completa; con JS, ve el modal. Sin esa caída,
// no se use este comportamiento — se use una página aparte.
//
// Por eso el modal NO se auto-abre cuando vuelve de la caché de historial de htmx
// (botón Atrás): boi salta el `init` de lo que llega ya marcado, y aquí eso es lo
// correcto —un modal que reaparece solo al navegar hacia atrás es un fallo, no una
// función—. Es el único comportamiento donde ese salto es la conducta deseada.

import { registrar } from "../boi.js";

// El evento con que el SERVIDOR pide cerrar el modal tras un éxito. La receta usa
// la cabecera de respuesta `HX-Trigger`, que htmx convierte en un evento del DOM
// disparado sobre el elemento que hizo la petición:
//
//     return HttpResponse(headers={"HX-Trigger": "boi:cerrar-modal"})
//
// Como el formulario que envía vive DENTRO del <dialog>, el evento burbujea hasta
// él y este comportamiento lo oye. Va con nuestro prefijo `boi:` a propósito: un
// nombre desnudo como `closeModal` colisiona con cualquier otro evento que el
// proyecto ya dispare, y el modal se cerraría sin que nadie sepa por qué.
//
// Es la mitad que hace ÚTIL al modal: sin ella, un modal con formulario no puede
// cerrarse al guardar con éxito —el único desenlace que importa—, porque el swap
// que trae la confirmación ocurre DENTRO del <dialog> y no lo cierra.
export const EVENTO_CERRAR = "boi:cerrar-modal";

// Marca opcional para cerrar al tocar el fondo (el ::backdrop). Va OPT-IN, y esa
// decisión está medida contra el usuario legítimo (directiva 21): un modal con
// formulario que se cierra por un clic accidental en el fondo PIERDE lo que la
// persona llevaba escrito, sin confirmación y sin vuelta atrás. El defecto es no
// cerrar; quien tenga un modal de solo-lectura lo pide con el atributo.
export const ATRIBUTO_CERRAR_FONDO = "data-modal-cerrar-al-tocar-fuera";

// Abre `el` como modal, con red. `showModal()` LANZA en dos casos reales
// (especificación del DOM): si el <dialog> ya está abierto (`InvalidStateError`)
// y si no está conectado al documento. Ninguno debe tumbar el escaneo del resto
// de la pantalla (README: un comportamiento roto no deja muerta la página), así
// que se aísla y se avisa.
function abrir(el) {
  // Un navegador sin soporte de <dialog> —o un elemento que no es <dialog>
  // aunque case el atributo— no tiene `showModal`. Se DICE (directiva 20): sin
  // esto, `el.showModal is not a function` sale como un error crudo desde dentro
  // del escáner, sin nombre ni sitio.
  if (typeof el.showModal !== "function") {
    if (typeof console !== "undefined") {
      console.warn(
        "boi/modal: el elemento [data-modal] no soporta showModal() — " +
          "¿es de verdad un <dialog>, o el navegador no lo implementa? El modal no se abre.",
        el,
      );
    }
    return false;
  }
  // Ya abierto: no se re-abre (lanzaría), y no es un error que haya que gritar
  // —puede pasar si el mismo <dialog> se escanea dos veces por una carrera—.
  if (el.open) return true;
  try {
    el.showModal();
    return true;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn("boi/modal: showModal() lanzó (" + err + "); el modal no se abrió.", el);
    }
    return false;
  }
}

registrar("modal", "dialog[data-modal]", (el) => {
  // El cierre limpia: al cerrarse el <dialog> por CUALQUIER vía —ESC, un botón
  // con `formmethod="dialog"`, `el.close()`, o el evento del servidor de abajo—
  // se retira del DOM. `remove()` sobre un nodo ya desconectado es un no-op, así
  // que dispararlo dos veces no rompe nada.
  //
  // `once: true` para no dejar un oyente colgando del elemento tras retirarlo:
  // aunque el nodo se vaya, el oyente lo retendría hasta el GC, y boi cuida de no
  // retener nada (ver el WeakMap de confirmar-doble).
  el.addEventListener(
    "close",
    () => {
      if (typeof el.remove === "function") el.remove();
    },
    { once: true },
  );

  // El cierre por éxito del servidor. Burbujea desde el formulario interior; se
  // oye en el <dialog>. `el.close()` dispara el `close` de arriba, que lo retira:
  // un solo camino de limpieza, no dos.
  el.addEventListener(EVENTO_CERRAR, () => {
    if (el.open && typeof el.close === "function") el.close();
  });

  // Cerrar al tocar el fondo, solo si se pidió. El clic en el ::backdrop tiene
  // como `target` al PROPIO <dialog> (el backdrop no es un nodo aparte), mientras
  // que un clic en el contenido tiene como target a un descendiente. Comparar con
  // `el` es lo que distingue «tocó fuera» de «tocó dentro» — sin cálculo de
  // coordenadas, que se rompe con el padding del <dialog>.
  if (el.hasAttribute(ATRIBUTO_CERRAR_FONDO)) {
    el.addEventListener("click", (e) => {
      if (e.target === el && el.open && typeof el.close === "function") el.close();
    });
  }

  // Y por fin: abrir. Va AL FINAL, después de cablear los oyentes, para que un
  // cierre inmediato —improbable pero posible con el evento del servidor en
  // vuelo— encuentre ya montada su limpieza.
  abrir(el);
});

// Se exportan para las pruebas.
export const _abrir = abrir;
