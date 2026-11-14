// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// esqueleto — un cargador «structure-aware»: mientras htmx tiene un fragmento en
// vuelo, dibuja un shimmer con la FORMA del contenido actual, midiéndolo, en vez
// de obligar a mantener a mano una segunda versión del componente.
//
//     <div id="lista" data-esqueleto>
//       <!-- filas reales; una de ellas trae el disparador de htmx -->
//       <input name="q" hx-get="/buscar" hx-target="#lista" hx-swap="innerHTML"
//              placeholder="buscar…">
//       <ul> … resultados … </ul>
//     </div>
//
// Cuando sale una petición de htmx DESDE dentro del contenedor, boi mide cada
// elemento-hoja que hay ahora, superpone bloques shimmer en esas coordenadas y
// oculta el contenido real; al terminar la petición, lo quita. El esqueleto nunca
// se desincroniza del componente porque SE MIDE del componente, no se escribe.
//
// ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
//
// De la técnica de phantom-ui (MIT): medir el DOM real con `getBoundingClientRect`
// y superponer shimmer en las coordenadas de cada hoja. phantom-ui lo empaqueta
// como Web Component construido con **Lit** (una dependencia); boi reimplementa la
// TÉCNICA en vanilla, sin Lit y sin custom element —una dependencia de pantalla es
// justo lo que boi existe para no tener—. Cazada vía mindalá (característica 3,
// candidato 1196315863) el 2026-09-28.
//
// ── QUÉ CUBRE, Y QUÉ NO (el alcance honesto) ─────────────────────────────────
//
// Reacciona a peticiones de htmx que NACEN dentro del contenedor (un buscador, un
// botón «cargar más», una paginación puestos dentro del panel que se recarga):
// `htmx:beforeRequest` burbujea desde el disparador hasta el contenedor. NO
// intenta adivinar una petición lanzada desde FUERA que apunte aquí con
// `hx-target` —para eso no hay evento temprano fiable sobre el destino, y adivinar
// sería la directiva 20 al revés—. Es el caso común y se declara.
//
// ── ES MEJORA PROGRESIVA ─────────────────────────────────────────────────────
//
// Sin `boi.js` no hay esqueleto: htmx recarga igual, solo que sin el shimmer de
// espera. No oculta ni bloquea nada del contenido real de forma permanente —el
// enmascarado dura lo que dura la petición y se revierte siempre, también si la
// petición falla (`htmx:afterRequest` se dispara pase lo que pase)—.

import { registrar } from "../boi.js";

const CLASE_ACTIVO = "boi-esqueleto-activo";
const CLASE_CAPA = "boi-esqueleto-capa";
const CLASE_BLOQUE = "boi-esqueleto-bloque";
const ID_ESTILOS = "boi-esqueleto-estilos";

// Tope de bloques: un contenedor con miles de hojas no debe congelar el hilo
// midiéndolas todas. 200 basta para transmitir la forma; de más es ruido caro.
const MAX_BLOQUES = 200;

// Inyecta el CSS del shimmer una sola vez por documento. Respeta
// `prefers-reduced-motion`: quien pide menos movimiento ve bloques quietos, no
// una animación (accesibilidad, y directiva 21: contra el usuario real).
function asegurarEstilos(doc) {
  if (doc.getElementById(ID_ESTILOS)) return;
  const estilo = doc.createElement("style");
  estilo.id = ID_ESTILOS;
  estilo.textContent =
    "." + CLASE_ACTIVO + "{position:relative;}" +
    "." + CLASE_ACTIVO + ">*:not(." + CLASE_CAPA + "){visibility:hidden;}" +
    "." + CLASE_CAPA + "{position:absolute;inset:0;pointer-events:none;}" +
    // Usa los tokens del sistema de diseño (boi.css) para respetar el tema —claro
    // y OSCURO—, con fallback a un gris translúcido para cuando el comportamiento
    // se usa sin boi.css cargado (los comportamientos no dependen de él).
    "." + CLASE_BLOQUE + "{position:absolute;border-radius:var(--boi-r-sm,4px);" +
      "background:linear-gradient(90deg," +
        "var(--boi-panel-2,rgba(128,128,128,.10)) 25%," +
        "var(--boi-borde,rgba(128,128,128,.20)) 37%," +
        "var(--boi-panel-2,rgba(128,128,128,.10)) 63%);" +
      "background-size:400% 100%;animation:boi-esqueleto-brillo 1.4s ease infinite;}" +
    "@keyframes boi-esqueleto-brillo{0%{background-position:100% 0}100%{background-position:0 0}}" +
    "@media (prefers-reduced-motion: reduce){." + CLASE_BLOQUE + "{animation:none;}}";
  (doc.head || doc.documentElement).appendChild(estilo);
}

// Las HOJAS que vale la pena dibujar: elementos sin hijos-elemento (el texto, los
// controles, las imágenes viven ahí) que tengan tamaño visible. Se excluye la
// propia capa. Devuelve rects RELATIVOS al contenedor.
function hojas(contenedor) {
  const rectC = contenedor.getBoundingClientRect();
  const salida = [];
  const todos = contenedor.querySelectorAll("*");
  for (const el of todos) {
    if (salida.length >= MAX_BLOQUES) break;
    if (el.classList && el.classList.contains(CLASE_CAPA)) continue;
    if (el.childElementCount > 0) continue; // no es hoja
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue; // invisible o de un pelo
    salida.push({
      x: r.left - rectC.left,
      y: r.top - rectC.top,
      w: r.width,
      h: r.height,
    });
  }
  return salida;
}

// Dibuja la capa de shimmer sobre `contenedor` a partir de los rects medidos.
function mostrar(contenedor) {
  if (contenedor.querySelector("." + CLASE_CAPA)) return; // ya activo: no re-medir
  const doc = contenedor.ownerDocument || document;
  asegurarEstilos(doc);

  const medidas = hojas(contenedor);
  const capa = doc.createElement("div");
  capa.className = CLASE_CAPA;
  capa.setAttribute("aria-hidden", "true"); // es decoración de carga, no contenido
  for (const m of medidas) {
    const bloque = doc.createElement("div");
    bloque.className = CLASE_BLOQUE;
    bloque.style.left = m.x + "px";
    bloque.style.top = m.y + "px";
    bloque.style.width = m.w + "px";
    bloque.style.height = m.h + "px";
    capa.appendChild(bloque);
  }
  // Reservar la altura del contenido que vamos a ocultar, para que la capa
  // absoluta no colapse el contenedor (el `visibility:hidden` conserva la caja,
  // pero lo hacemos explícito por si el proyecto tiene su propio CSS).
  const alto = contenedor.getBoundingClientRect().height;
  if (alto > 0) capa.style.minHeight = alto + "px";

  contenedor.classList.add(CLASE_ACTIVO);
  contenedor.appendChild(capa);
}

// Quita la capa y revierte. Idempotente: si no hay capa, no hace nada.
function ocultar(contenedor) {
  const capa = contenedor.querySelector("." + CLASE_CAPA);
  if (capa) capa.remove();
  contenedor.classList.remove(CLASE_ACTIVO);
}

registrar("esqueleto", "[data-esqueleto]", (contenedor) => {
  // `htmx:beforeRequest` burbujea desde el disparador de dentro hasta aquí. Es la
  // señal más temprana de que hay una petición en vuelo desde este contenedor.
  contenedor.addEventListener("htmx:beforeRequest", () => mostrar(contenedor));

  // `htmx:afterRequest` se dispara al TERMINAR la petición, con éxito o error, y
  // también burbujea. Es el cierre fiable: quitar el esqueleto pase lo que pase.
  // Si htmx reemplazó el innerHTML del contenedor, la capa (un hijo) ya se fue con
  // él; `ocultar` es idempotente, así que da igual quién llegue primero.
  contenedor.addEventListener("htmx:afterRequest", () => ocultar(contenedor));
});

// Se exportan para las pruebas del banco (navegador de verdad).
export const _mostrar = mostrar;
export const _ocultar = ocultar;
export const _hojas = hojas;
export const CLASES = { CLASE_ACTIVO, CLASE_CAPA, CLASE_BLOQUE, ID_ESTILOS };
