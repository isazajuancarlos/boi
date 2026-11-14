// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// conmutar — un campo maestro cuyo valor MUESTRA/OCULTA (y habilita/deshabilita)
// otros campos del formulario, sin tocar el servidor.
//
//     <select data-conmutar="#caja-otro">
//       <option value="tarjeta">Tarjeta</option>
//       <option value="otro">Otro medio</option>
//     </select>
//
//     <div id="caja-otro" data-conmutar-si="otro">
//       <input name="otro_medio" required>   <!-- solo exigido cuando se ve -->
//     </div>
//
// El maestro apunta por SELECTOR a sus dependientes; cada dependiente declara,
// con `data-conmutar-si` o `data-conmutar-no`, para qué valores del maestro se
// muestra. Al mostrarse se re-habilitan sus controles; al ocultarse se
// deshabilitan, para que un campo que no se ve **no se envíe ni se exija**
// —el clásico «campo Otro» que solo es obligatorio cuando aparece—.
//
// ── DE DÓNDE SALE ────────────────────────────────────────────────────────────
//
// De la técnica `[up-switch]` de Unpoly (MIT). No se copió código —Unpoly es un
// framework de navegación entero, con su propio ciclo de peticiones—; se portó la
// UNA técnica de cliente que htmx no cubre: reaccionar al valor de un campo
// mostrando/ocultando otros, sin ir al servidor. Cazada vía mindalá (característica
// 1, candidato 52203829) el 2026-09-28.
//
// ── ES MEJORA PROGRESIVA ─────────────────────────────────────────────────────
//
// Sin `boi.js`, todos los dependientes se ven y se envían: el servidor recibe
// todo y valida como siempre (README: la barrera vive en el servidor, nunca
// aquí). boi solo AÑADE la comodidad de ocultar lo que no aplica. Por eso el
// estado por defecto del HTML es «todo visible», y boi lo ajusta al cargar.

import { registrar } from "../boi.js";

// El atributo que un dependiente usa para decir «me veo cuando el maestro vale
// uno de estos». Lista separada por espacios. Además de valores literales admite
// pseudo-valores, porque un checkbox o un campo vacío no tienen un «valor» de
// texto con el que casar:
//   :marcado / :desmarcado  — para un checkbox (según esté o no marcado)
//   :lleno / :vacio         — para cualquier campo (según tenga o no contenido)
const SI = "data-conmutar-si";
const NO = "data-conmutar-no";

// La marca con que recordamos que fuimos NOSOTROS quienes deshabilitamos un
// control. Sin esto, al volver a mostrar un dependiente re-habilitaríamos
// controles que el proyecto había deshabilitado por su cuenta —y ese es el
// defecto que no se ve hasta el tercer formulario— (directiva 20: no adivinar).
const LO_DESACTIVE = "data-conmutar-desactivado";

// Los tokens que el valor ACTUAL del maestro satisface. Un dependiente se muestra
// si su lista `si` corta con este conjunto (o si su lista `no` NO lo corta).
//
// Se calcula en cada evaluación —no se cachea— porque el valor cambia, que es
// justo lo que este comportamiento observa.
function tokensDelMaestro(maestro) {
  const tipo = (maestro.type || "").toLowerCase();
  let crudo;
  if (tipo === "checkbox") {
    crudo = maestro.checked ? maestro.value || "on" : "";
  } else if (tipo === "radio") {
    // Un radio suelto solo conoce SU valor, no el del grupo. El valor del grupo
    // es el del radio marcado con el mismo `name` dentro del formulario; si
    // ninguno está marcado, es vacío. Sin esto, `data-conmutar` en el primer
    // radio ignoraría la selección de los demás.
    const grupo = maestro.form && maestro.name
      ? maestro.form.querySelector(
          'input[type="radio"][name="' + cssEscape(maestro.name) + '"]:checked',
        )
      : maestro.checked
        ? maestro
        : null;
    crudo = grupo ? grupo.value : "";
  } else {
    crudo = maestro.value == null ? "" : String(maestro.value);
  }

  const tokens = new Set([crudo]);
  tokens.add(crudo === "" ? ":vacio" : ":lleno");
  if (tipo === "checkbox") tokens.add(maestro.checked ? ":marcado" : ":desmarcado");
  return tokens;
}

// Escapa un valor para meterlo en un selector de atributo. `CSS.escape` existe en
// todo navegador con `<dialog>` (nuestra línea base); si faltara, un fallback que
// al menos no rompa el selector con comillas.
function cssEscape(v) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return String(v).replace(/["\\\]]/g, "\\$&");
}

// ¿Deben verse estos tokens según la regla del dependiente? Devuelve `true`,
// `false`, o `null` si el dependiente no trae REGLA (ni `si` ni `no`): eso es un
// error de marcado y se avisa una vez (directiva 20), dejándolo visible.
function debeVerse(dep, tokens) {
  const tieneSi = dep.hasAttribute(SI);
  const tieneNo = dep.hasAttribute(NO);
  if (tieneSi && tieneNo) {
    // Ambas es contradictorio: gana `si`, y se dice. No se inventa un tercer
    // significado en silencio.
    avisar("un dependiente trae " + SI + " y " + NO + " a la vez; se usa " + SI, dep);
  }
  if (tieneSi) return corta(dep.getAttribute(SI), tokens);
  if (tieneNo) return !corta(dep.getAttribute(NO), tokens);
  return null;
}

function corta(lista, tokens) {
  return String(lista)
    .split(/\s+/)
    .filter(Boolean)
    .some((v) => tokens.has(v));
}

// Aplica el estado a un dependiente: el atributo `hidden` para la vista, y
// `disabled` sobre sus controles para que lo oculto no viaje en el envío. Solo se
// re-habilita lo que ESTE comportamiento deshabilitó (marca `LO_DESACTIVE`).
function aplicarEstado(dep, visible) {
  dep.hidden = !visible;
  const controles = [];
  if (esControl(dep)) controles.push(dep);
  if (typeof dep.querySelectorAll === "function") {
    dep.querySelectorAll("input, select, textarea, button").forEach((c) => controles.push(c));
  }
  for (const c of controles) {
    if (visible) {
      if (c.hasAttribute(LO_DESACTIVE)) {
        c.disabled = false;
        c.removeAttribute(LO_DESACTIVE);
      }
    } else if (!c.disabled) {
      // No tocar lo ya deshabilitado por el proyecto: no marcarlo, para no
      // re-habilitarlo luego.
      c.disabled = true;
      c.setAttribute(LO_DESACTIVE, "");
    }
  }
}

function esControl(el) {
  return /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName || "");
}

registrar("conmutar", "[data-conmutar]", (maestro) => {
  const selector = (maestro.getAttribute("data-conmutar") || "").trim();
  if (!selector) {
    // Sin selector no hay a quién conmutar. Se dice (directiva 20) en vez de
    // quedarse mudo haciendo nada.
    avisar("[data-conmutar] sin selector de dependientes; no hace nada", maestro);
    return;
  }

  // El ámbito de búsqueda es el formulario del maestro si lo tiene —así dos
  // formularios con el mismo `#id` de plantilla no se pisan—, o el documento.
  const ambito = maestro.form || maestro.ownerDocument || document;

  let avisoSinRegla = false; // una vez por maestro, no una por evaluación (directiva 23)

  function evaluar() {
    let dependientes;
    try {
      dependientes = ambito.querySelectorAll(selector);
    } catch {
      avisar("el selector «" + selector + "» de [data-conmutar] no es válido", maestro);
      return;
    }
    const tokens = tokensDelMaestro(maestro);
    for (const dep of dependientes) {
      const v = debeVerse(dep, tokens);
      if (v === null) {
        if (!avisoSinRegla) {
          avisoSinRegla = true;
          avisar("un dependiente de [data-conmutar] no trae " + SI + " ni " + NO +
            "; se deja visible", dep);
        }
        aplicarEstado(dep, true);
        continue;
      }
      aplicarEstado(dep, v);
    }
  }

  // `change` cubre select/checkbox/radio; `input` cubre texto mientras se teclea.
  maestro.addEventListener("change", evaluar);
  maestro.addEventListener("input", evaluar);
  // Para un grupo de radios, el `change` lo dispara el radio que SE MARCA, que no
  // es necesariamente el que lleva `data-conmutar`. Se oye también en el
  // formulario (el evento burbujea) y se re-evalúa si el que cambió comparte
  // `name` con el maestro. Es idempotente, así que evaluar de más no molesta.
  if ((maestro.type || "").toLowerCase() === "radio" && maestro.form && maestro.name) {
    maestro.form.addEventListener("change", (e) => {
      if (e.target && e.target.name === maestro.name) evaluar();
    });
  }

  // El estado inicial: sin esto la pantalla nace mostrando todo (el HTML por
  // defecto) hasta que alguien toque el campo, y un formulario que aparece con el
  // «campo Otro» visible sin haber elegido «Otro» se ve roto.
  evaluar();
});

function avisar(mensaje, ...resto) {
  if (typeof console !== "undefined") console.warn("boi/conmutar: " + mensaje, ...resto);
}

// Se exportan para las pruebas.
export const _tokensDelMaestro = tokensDelMaestro;
export const _debeVerse = debeVerse;
export const _aplicarEstado = aplicarEstado;
export const ATRIBUTO_DESACTIVADO = LO_DESACTIVE;
