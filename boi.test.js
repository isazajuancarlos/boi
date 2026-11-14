// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba del NÚCLEO de boi, con el runner nativo `node --test` — sin npm, sin
// node_modules (Node ≥ 18 lo trae de fábrica). La lógica del escáner
// —idempotencia, la raíz que encaja, el aislamiento de un `init` roto— con un
// doble de DOM mínimo, que es rápido y no necesita navegador.
//
// El comportamiento REAL en el navegador vive en `banco/`, desde el 2026-08-12:
// Chromium headless, htmx de verdad y un intercambio parcial de verdad. Aquí
// decía que «eso no cabe aquí» y que lo probaba cada proyecto; era falso en las
// dos mitades (directiva 28).

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos, enganchar, escanear, marca, registrar } from "./boi.js";

// ── Un doble de DOM mínimo ────────────────────────────────────────────────────
// Un "elemento" con lo justo que el escáner toca: atributos, matches, y un árbol
// para querySelectorAll. Cero dependencias.
function elem(selectorPropio, hijos = []) {
  const atributos = new Set();
  return {
    selectorPropio, // qué selector "encaja" con este nodo (simplificación)
    hijos,
    hasAttribute: (a) => atributos.has(a),
    setAttribute: (a) => atributos.add(a),
    matches: (sel) => sel === selectorPropio,
    querySelectorAll(sel) {
      const out = [];
      const visitar = (n) => {
        for (const h of n.hijos) {
          if (h.matches(sel)) out.push(h);
          visitar(h);
        }
      };
      visitar(this);
      return out;
    },
  };
}

// Cada test empieza con el registro vacío: el estado es de módulo y se comparte.
//
// Y con un documento neutro RECIÉN enganchado, porque `documentoEnganchado`
// también es estado de módulo: sin esto, a partir del primer caso que engancha
// algo, todos los siguientes heredaban ese documento y el archivo pasaba a
// depender del orden en que se leen los tests.
function limpiar() {
  comportamientos.length = 0;
  enganchar(docNeutro());
}

function docNeutro() {
  return {
    addEventListener() {},
    readyState: "loading", // así `registrar` no escanea nada
    body: null,
    querySelector: () => null,
    createElement: () => ({ setAttribute() {} }),
  };
}

test("un nombre repetido se rechaza, no se ignora en silencio", () => {
  limpiar();
  registrar("x", "[data-x]", () => {});
  assert.throws(() => registrar("x", "[data-otro]", () => {}), /ya está registrado/);
});

test("init se llama UNA vez por elemento que encaja, incluida la raíz", () => {
  limpiar();
  const vistos = [];
  registrar("m", "[data-m]", (el) => vistos.push(el.selectorPropio));

  const raiz = elem("[data-m]", [
    elem("[data-m]", []),
    elem("[data-otro]", [elem("[data-m]", [])]),
  ]);
  escanear(raiz);
  // La raíz encaja + dos descendientes con [data-m] = 3.
  assert.equal(vistos.length, 3);
});

test("re-escanear NO re-inicializa lo ya hecho (idempotencia — principio 3)", () => {
  limpiar();
  let veces = 0;
  registrar("m", "[data-m]", () => veces++);

  const hijo = elem("[data-m]");
  const raiz = elem("[data-raiz]", [hijo]);
  escanear(raiz);
  escanear(raiz); // el swap de htmx re-escanea el mismo subárbol
  escanear(raiz);
  assert.equal(veces, 1, "el init corrió más de una vez pese a la marca");
  assert.equal(hijo.hasAttribute(marca("m")), true);
});

test("un elemento nuevo dentro de un subárbol ya escaneado SÍ se inicializa", () => {
  limpiar();
  const vistos = [];
  registrar("m", "[data-m]", (el) => vistos.push(el));

  const viejo = elem("[data-m]");
  const raiz = elem("[data-raiz]", [viejo]);
  escanear(raiz);
  assert.equal(vistos.length, 1);

  // Llega un fragmento nuevo (como un swap de htmx) con otro [data-m].
  const nuevo = elem("[data-m]");
  raiz.hijos.push(nuevo);
  escanear(raiz);
  assert.equal(vistos.length, 2, "el elemento nuevo no se inicializó");
  assert.equal(vistos.includes(nuevo), true);
});

test("un init que lanza NO tumba el escaneo del resto (principio 4)", () => {
  limpiar();
  const ok = [];
  registrar("roto", "[data-roto]", () => {
    throw new Error("a propósito");
  });
  registrar("sano", "[data-sano]", (el) => ok.push(el));

  const raiz = elem("[data-raiz]", [elem("[data-roto]"), elem("[data-sano]")]);
  // No debe propagar la excepción.
  escanear(raiz);
  assert.equal(ok.length, 1, "el comportamiento sano no corrió tras el roto");
});

test("escanear tolera una raíz que no es un elemento (sin DOM, sin crash)", () => {
  limpiar();
  registrar("m", "[data-m]", () => {
    throw new Error("no debería llamarse");
  });
  escanear(null);
  escanear(undefined);
  escanear({}); // sin querySelectorAll
  // Si llegamos aquí sin lanzar, pasa.
  assert.equal(true, true);
});

// ── El rastro que hace observable a boi desde un E2E ──────────────────────────

test("enganchar marca el documento: es lo único que un E2E puede mirar", () => {
  limpiar();
  const oyentes = [];
  const raiz = elem("html");
  const doc = {
    documentElement: raiz,
    body: elem("body"),
    addEventListener: (ev) => oyentes.push(ev),
  };

  enganchar(doc);

  assert.equal(
    raiz.hasAttribute("data-boi"),
    true,
    "sin la marca, «el módulo cargó» y «el navegador no lo ejecutó» se ven igual",
  );
  // Y sigue haciendo lo suyo: la marca no sustituye al enganche.
  assert.deepEqual(oyentes, ["DOMContentLoaded", "htmx:load"]);
});

// La pareja (directiva 33): el caso que TIENE que no marcar. Si `enganchar`
// marcara pase lo que pase, el E2E daría verde con boi muerto — que es
// exactamente el fallo que la marca existe para detectar.
test("un documento inservible NO se marca: la marca miente si es incondicional", () => {
  limpiar();
  const raiz = elem("html");
  // Sin `addEventListener` no hay enganche posible, así que tampoco hay nada
  // que anunciar. `enganchar` sale antes de tocar el documento.
  enganchar({ documentElement: raiz, body: elem("body") });

  assert.equal(
    raiz.hasAttribute("data-boi"),
    false,
    "se marcó un documento al que boi no llegó a engancharse",
  );
});


// ── Lo que el catálogo NO debe dejar entrar ───────────────────────────────────
//
// Estas tres nacen de la revisión de seguridad del 2026-08-12: al escanear
// dentro de `registrar`, un comportamiento mal formado dejó de ser un error de
// quien lo escribe y pasó a ser un catálogo envenenado — cada escaneo posterior
// vuelve a tropezar con él, y el escaneo es lo que corre en CADA swap de htmx.

test("dos nombres que solo se diferencian en la caja chocan, y se dice", () => {
  limpiar();
  registrar("mix", "[data-a]", () => {});
  // HTML minusculiza los nombres de atributo: los dos producirían la MISMA
  // marca `boi-mix-listo` y el segundo se saltaría sin decir una palabra.
  assert.throws(() => registrar("Mix", "[data-b]", () => {}), /choca/);
});

test("un selector inválido se rechaza al REGISTRAR, no dentro del escaneo", () => {
  limpiar();
  // Un documento enganchado con el motor de selectores de verdad… fingido: lo
  // que importa es que `querySelector` lance con lo que no es un selector.
  enganchar({
    addEventListener: () => {},
    readyState: "complete",
    body: null,
    querySelector: (sel) => {
      if (sel === "[[[") throw new Error("selector inválido");
      return null;
    },
  });

  assert.throws(() => registrar("malo", "[[[", () => {}), /no es válido/);
  assert.equal(
    comportamientos.length,
    0,
    "y NO se queda en el catálogo: si entrara, cada escaneo posterior lanzaría",
  );
});

// AVISO SOBRE ESTA PRUEBA (directiva 33): su caso rojo se fabrica en el arnés,
// no por la vía real. Desde que `registrar` valida el selector Y el nombre, un
// comportamiento roto ya NO puede entrar al catálogo por ninguna de las dos
// puertas conocidas, así que hay que mutar `comportamientos[1]` a mano. El
// `try/catch` que mide sigue valiendo —`comportamientos` se exporta mutable y
// va en `globalThis.boi`, o sea que la validación es convención y no
// invariante—, pero la prueba mide una barandilla, no un camino vivo. Se deja
// escrito en vez de fingir que discrimina.
test("un comportamiento que revienta no impide que los demás se apliquen", () => {
  limpiar();
  const corridos = [];
  // El de en medio falla por el SELECTOR —fuera del `init`—, que es justo lo
  // que el `try` de antes no cubría.
  registrar("antes", "[data-x]", () => corridos.push("antes"));
  registrar("roto", "[data-x]", () => corridos.push("roto"));
  registrar("despues", "[data-x]", () => corridos.push("despues"));
  comportamientos[1].selector = "[[[";

  const raiz = elem("body", [elem("[data-x]", [])]);
  // `querySelectorAll` del doble no lanza con un selector raro, así que se le
  // hace lanzar como lo haría el navegador.
  const original = raiz.querySelectorAll.bind(raiz);
  raiz.querySelectorAll = (sel) => {
    if (sel === "[[[") throw new Error("selector inválido");
    return original(sel);
  };

  const errores = [];
  const consolaOriginal = console.error;
  console.error = (...a) => errores.push(a);
  try {
    escanear(raiz);
  } finally {
    console.error = consolaOriginal;
  }

  assert.deepEqual(corridos, ["antes", "despues"], "el roto no puede llevarse al de después");
  assert.equal(errores.length, 1, "y el fallo se DICE, no se traga (directiva 20)");
});

// ── El respaldo de DOMContentLoaded se registra SIEMPRE ───────────────────────

test("un documento ya analizado y sin body deja igualmente su respaldo", () => {
  limpiar();
  const oyentes = [];
  // El rincón que la revisión encontró: `readyState` ya pasó de «loading», así
  // que el escaneo inmediato sale por la guarda al no haber `body`… y antes
  // nadie registraba el respaldo, con `data-boi=listo` puesto igual.
  enganchar({
    documentElement: elem("html"),
    body: null,
    readyState: "complete",
    addEventListener: (ev) => oyentes.push(ev),
  });

  assert.deepEqual(oyentes, ["DOMContentLoaded", "htmx:load"]);
});


test("un nombre que no sirve como atributo se rechaza al REGISTRAR", () => {
  limpiar();
  // La otra puerta del mismo envenenamiento, y la que quedó abierta cuando se
  // cerró la del selector: `boi-mi comportamiento-listo` no es un nombre de
  // atributo legal, así que `setAttribute` lanzaría en CADA escaneo — o sea en
  // cada swap de htmx— sin que nadie pueda arreglarlo ya.
  enganchar({
    addEventListener: () => {},
    readyState: "complete",
    body: null,
    querySelector: () => null,
    createElement: () => ({
      // El doble imita al navegador MEDIDO, no a una idea de lo que debería
      // ser: Chromium acepta acentos, `.`, `:` y hasta comillas en un nombre de
      // atributo, y rechaza el espacio en blanco y la barra. Un doble más
      // estricto haría pasar una prueba que en el navegador no significa nada.
      setAttribute: (a) => {
        if (/[\s/]/.test(a)) throw new Error("InvalidCharacterError");
      },
    }),
  });

  assert.throws(() => registrar("mi comportamiento", "[data-x]", () => {}), /no es un atributo válido/);
  assert.equal(comportamientos.length, 0, "y no se queda en el catálogo");

  // La pareja: un nombre normal SÍ entra. Sin esto, un validador que rechazara
  // todo pasaría igual.
  registrar("normal", "[data-x]", () => {});
  assert.equal(comportamientos.length, 1);
});

test("un `init` que no es función se rechaza al REGISTRAR", () => {
  limpiar();
  // La quinta puerta del mismo envenenamiento. Sin ella, `registrar("x", sel,
  // null)` entra al catálogo, el escáner MARCA el elemento como inicializado y
  // solo entonces `c.init(el)` lanza: queda avisado pero contado como hecho, y
  // **nunca se reintenta**. La pantalla se queda muerta con la marca puesta.
  for (const malo of [null, undefined, 42, "init", {}, []]) {
    assert.throws(
      () => registrar("roto", "[data-x]", malo),
      /no es una función/,
      `un init de tipo ${typeof malo} debía rechazarse`,
    );
  }
  assert.equal(comportamientos.length, 0, "y ninguno se queda en el catálogo");

  // LA PAREJA: una función SÍ entra. Sin esto, un validador que rechazara todo
  // pasaría igual — que es como se escriben las comprobaciones ciegas.
  registrar("bueno", "[data-x]", () => {});
  assert.equal(comportamientos.length, 1);
});

test("enganchar dos veces el mismo documento no duplica oyentes", () => {
  limpiar();
  const oyentes = [];
  const doc = {
    documentElement: elem("html"),
    body: elem("body"),
    readyState: "loading",
    addEventListener: (ev) => oyentes.push(ev),
  };

  enganchar(doc);
  enganchar(doc);

  assert.deepEqual(oyentes, ["DOMContentLoaded", "htmx:load"], "se duplicaron los oyentes");
});


test("el aviso de un comportamiento roto NO se repite en cada escaneo", () => {
  limpiar();
  registrar("repetido", "[data-x]", () => {});
  comportamientos[0].selector = "[[[";

  const raiz = elem("body", [elem("[data-x]", [])]);
  raiz.querySelectorAll = (sel) => {
    if (sel === "[[[") throw new Error("selector inválido");
    return [];
  };

  const errores = [];
  const consolaOriginal = console.error;
  console.error = (...a) => errores.push(a);
  try {
    escanear(raiz);
    escanear(raiz);
    escanear(raiz); // como haría htmx en tres swaps seguidos
    assert.equal(errores.length, 1, "una alarma por escaneo es una que nadie mira");

    // La pareja: si cambia la CAUSA, sí se dice. Sin esto, «avisa una vez» y
    // «se quedó mudo para siempre» se ven igual — y en un panel que vive horas,
    // callar el segundo fallo es peor que repetir el primero.
    raiz.querySelectorAll = () => {
      throw new Error("otra causa distinta");
    };
    escanear(raiz);
    assert.equal(errores.length, 2, "un fallo por otra causa se quedó mudo");
  } finally {
    console.error = consolaOriginal;
  }
});
