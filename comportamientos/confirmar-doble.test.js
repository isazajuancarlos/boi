// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `confirmar-doble`, con `node --test` y un doble de DOM mínimo — sin
// npm, sin navegador.
//
// **La prueba que da valor a este archivo es `htmx_no_dispara_en_la_primera`**:
// es el defecto REAL que traían las dos copias de las que salió este
// comportamiento, y la única forma de verlo es registrar un oyente en el propio
// elemento —como hace htmx— y comprobar que NO se llama. Con la versión vieja
// (`stopPropagation` en el elemento) esa prueba se pone roja.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { comportamientos, escanear } from "../boi.js";
import {
  BLOQUEO_TRAS_CONFIRMAR,
  ESPERA_MAXIMA,
  ESPERA_MINIMA_UTIL,
  MINIMO_ARMADO,
  _engancharDocumento,
  _eventosDeTrigger,
  _MARCA_ENGANCHADO,
} from "./confirmar-doble.js";

// La segunda pulsación no cuenta antes del mínimo, así que toda prueba que
// confirme de verdad tiene que esperarlo. Se lee de la librería y no se copia:
// un número escrito aquí a mano envejecería sin dar error.
const pasadoElMinimo = () => new Promise((r) => setTimeout(r, MINIMO_ARMADO + 50));

// ── Un doble de DOM con eventos ──────────────────────────────────────────────
//
// Lo justo para lo que este comportamiento toca: atributos, clases, texto, y un
// despacho de clic que respeta las DOS cosas que aquí importan —que los oyentes
// de captura del documento corren ANTES que los del destino, y que
// `stopImmediatePropagation` corta también a los del mismo nodo—.
function crearDoc() {
  const capturaDoc = [];
  const capturaTeclas = [];
  const doc = {
    addEventListener(tipo, fn, captura) {
      if (tipo === "click" && captura) capturaDoc.push(fn);
      if (tipo === "keydown" && captura) capturaTeclas.push(fn);
    },
    // Cuántos oyentes de captura lleva encima este documento. Es la magnitud de
    // la fuga: uno por botón crecía sin techo.
    oyentesDeCaptura: () => capturaDoc.length,
    // La repetición del teclado, como la emite el navegador: un `keydown` con
    // `repeat: true` y, si nadie lo corta, el `click` de confianza que produce.
    // Modela lo medido en Chromium: mismo `isTrusted`, indistinguible del bueno.
    manteniendoPulsada(el, tecla = "Enter") {
      let cortado = false;
      const evento = {
        target: el,
        key: tecla,
        repeat: true,
        defecto: false,
        preventDefault() {
          this.defecto = true;
        },
        stopImmediatePropagation() {
          cortado = true;
        },
      };
      for (const fn of capturaTeclas) {
        fn(evento);
        if (cortado) break;
      }
      // El navegador solo sintetiza el clic si nadie impidió el defecto.
      if (!evento.defecto) this.click(el);
      return evento;
    },
    // Despacha un clic sobre `el`, como haría el navegador.
    click(el) {
      let cortado = false;
      const evento = {
        target: el,
        defecto: false,
        preventDefault() {
          this.defecto = true;
        },
        stopImmediatePropagation() {
          cortado = true;
        },
        stopPropagation() {
          /* NO corta a los oyentes del mismo nodo — es el defecto que se caza */
        },
      };
      for (const fn of capturaDoc) {
        fn(evento);
        if (cortado) return evento; // nadie más, ni en el destino
      }
      for (const fn of el._oyentes) fn(evento);
      return evento;
    },
  };
  return doc;
}

function boton(doc, texto = "Borrar", atributos = {}) {
  const attrs = new Map(Object.entries(atributos));
  const clases = new Set();
  const el = {
    ownerDocument: doc,
    textContent: texto,
    _oyentes: [],
    selectorPropio: "[data-confirmar]",
    hijos: [],
    hasAttribute: (a) => attrs.has(a),
    getAttribute: (a) => (attrs.has(a) ? attrs.get(a) : null),
    setAttribute: (a, v) => attrs.set(a, v ?? ""),
    removeAttribute: (a) => attrs.delete(a),
    matches: (sel) => sel === "[data-confirmar]",
    querySelectorAll: () => [],
    closest: (sel) => (sel === "[data-confirmar]" ? el : null),
    classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), has: (c) => clases.has(c) },
    // Lo que hace htmx: su propio oyente, en el propio elemento.
    addEventListener: (tipo, fn) => tipo === "click" && el._oyentes.push(fn),
  };
  attrs.set("data-confirmar", atributos["data-confirmar"] ?? "¿Seguro? Pulse otra vez");
  return el;
}

/// El escáner de boi aplica el comportamiento a un elemento suelto.
function enganchar(el) {
  escanear({
    matches: () => false,
    querySelectorAll: (sel) => (sel === "[data-confirmar]" ? [el] : []),
    hijos: [],
  });
}

test("registra un solo comportamiento y con su nombre", () => {
  assert.equal(comportamientos.filter((c) => c.nombre === "confirmar-doble").length, 1);
});

test("la primera pulsación NO ejecuta la acción y cambia el texto", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const e = doc.click(b);
  assert.equal(e.defecto, true, "no se impidió la acción por defecto");
  assert.equal(b.textContent, "¿Seguro? Pulse otra vez");
  assert.equal(b.classList.has("armado"), true);
  assert.equal(b.getAttribute("aria-live"), "assertive", "sin aviso para el lector de pantalla");
});

test("la segunda pulsación SÍ deja pasar la acción y restaura el texto", async () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  doc.click(b);
  await pasadoElMinimo();
  const e = doc.click(b);
  assert.equal(e.defecto, false, "la segunda pulsación se bloqueó: la acción nunca ocurriría");
  assert.equal(b.textContent, "Borrar");
  assert.equal(b.classList.has("armado"), false);
  assert.equal(b.getAttribute("aria-live"), null);
});

// ── LA PRUEBA DEL DEFECTO ────────────────────────────────────────────────────
//
// htmx registra su oyente en el PROPIO elemento. Con `stopPropagation()` —lo que
// hacían las dos copias— ese oyente se ejecuta igual, y la petición sale a la
// primera pulsación: la confirmación no confirma nada, sin un solo error.
test("htmx NO dispara en la primera pulsación", async () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  let disparos = 0;
  b.addEventListener("click", () => disparos++); // ← el oyente de htmx

  doc.click(b);
  assert.equal(disparos, 0, "htmx envió la petición en la PRIMERA pulsación");

  await pasadoElMinimo();
  doc.click(b);
  assert.equal(disparos, 1, "htmx no envió la petición en la segunda: la acción no ocurre nunca");
});

test("pasada la espera vuelve solo a su estado inicial", async () => {
  const doc = crearDoc();
  const b = boton(doc, "Borrar", { "data-confirmar-espera": String(ESPERA_MINIMA_UTIL) });
  enganchar(b);

  doc.click(b);
  assert.equal(b.classList.has("armado"), true);
  await new Promise((r) => setTimeout(r, ESPERA_MINIMA_UTIL + 60));
  assert.equal(b.classList.has("armado"), false, "se quedó armado para siempre");
  assert.equal(b.textContent, "Borrar");

  // Y tras desarmarse, la siguiente pulsación vuelve a ser la PRIMERA: si no,
  // un botón que el usuario dejó armado y olvidó se dispararía con un clic
  // suelto media hora después.
  const e = doc.click(b);
  assert.equal(e.defecto, true, "tras la espera, un clic ejecutó la acción directamente");
});

test("un clic en OTRO elemento no arma este botón", () => {
  const doc = crearDoc();
  const b = boton(doc);
  const otro = boton(doc, "Guardar");
  otro.closest = () => otro; // el otro botón se resuelve a sí mismo
  enganchar(b);

  doc.click(otro);
  assert.equal(b.classList.has("armado"), false, "un clic ajeno armó este botón");
});

test("es idempotente: re-escanear no duplica el oyente", () => {
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  enganchar(b); // htmx trae el fragmento otra vez

  // Con el oyente duplicado, la primera pulsación armaría y desarmaría en la
  // misma pasada, y la acción no ocurriría jamás.
  doc.click(b);
  assert.equal(b.classList.has("armado"), true, "el oyente se duplicó al re-escanear");
});


test("UN oyente por documento, no uno por botón", () => {
  // La fuga que encontró la revisión del 2026-08-12: el oyente se registraba
  // dentro del `init`, cerrando sobre el elemento, y no se retiraba nunca. Cada
  // botón que traía un swap de htmx dejaba un oyente permanente que RETENÍA el
  // nodo desconectado —justo lo que el `WeakMap` del módulo quiere evitar— y
  // que además corría en cada clic de la página.
  const doc = crearDoc();
  const a = boton(doc, "Borrar A");
  const b = boton(doc, "Borrar B");
  const c = boton(doc, "Borrar C");
  enganchar(a);
  enganchar(b);
  enganchar(c);

  assert.equal(doc.oyentesDeCaptura(), 1, "tres botones dejaron más de un oyente");

  // Y el positivo de control: con UN solo oyente los tres siguen funcionando.
  // Sin esto, un comportamiento que no engancha nada pasaría esta prueba.
  for (const [nombre, el] of [["A", a], ["B", b], ["C", c]]) {
    doc.click(el);
    assert.equal(el.classList.has("armado"), true, "el botón " + nombre + " no se armó");
  }
});


test("un clic donde NO hay botón de confirmación no arma nada", () => {
  // La pareja de «un clic en OTRO elemento no arma este botón», que desde el
  // cambio de alcance pasaba trivialmente: el «otro» de allí TAMBIÉN es un
  // confirmable, así que sí se arma —solo que no el de la aserción—. Aquí el
  // destino no casa el selector y no debe armarse nada en absoluto.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const cualquiera = { closest: () => null, _oyentes: [] };
  doc.click(cualquiera);

  assert.equal(b.classList.has("armado"), false, "se armó un botón que nadie pulsó");
});

test("el contenedor marcado se arma desde un hijo — el contrato de la hoja", () => {
  // No es un defecto: es el contrato, y por eso se prueba. `closest` sube, así
  // que marcar un CONTENEDOR con `data-confirmar` hace que cualquier clic
  // dentro lo arme, y al armarse `textContent` le borra el subárbol. La prueba
  // existe para que el día que alguien lo ponga en un `<div>`, esto explique por
  // qué la pantalla se vació.
  const doc = crearDoc();
  const contenedor = boton(doc, "Zona peligrosa");
  const hijo = { closest: (sel) => (sel === "[data-confirmar]" ? contenedor : null), _oyentes: [] };
  enganchar(contenedor);

  doc.click(hijo);

  assert.equal(contenedor.classList.has("armado"), true);
  assert.equal(
    contenedor.textContent,
    "¿Seguro? Pulse otra vez",
    "al armarse, el texto de confirmación sustituye a TODO el contenido",
  );
});


// ── EL DOBLE CLIC, QUE ATRAVESABA LA BARRERA ENTERA ──────────────────────────

test("un doble clic NO confirma: el segundo golpe llega demasiado pronto", () => {
  // Medido en Chromium el 2026-08-12: dos pulsaciones a 8 ms una de otra
  // ejecutaban la acción irreversible, con el texto de confirmación apareciendo
  // y desapareciendo sin que nadie pueda leerlo. Es la forma más común de fallar
  // de este patrón, y afectaba a los 27 usos vivos de medico, informes y
  // chasqui — no a un caso latente.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++); // ← el oyente de htmx

  doc.click(b);
  const segundo = doc.click(b); // el mismo gesto, sin esperar nada

  assert.equal(disparos, 0, "el doble clic ejecutó la acción irreversible");
  assert.equal(segundo.defecto, true, "el segundo golpe no se cortó");
  assert.equal(b.classList.has("armado"), true, "y el botón tiene que SEGUIR armado");
});

test("y la pulsación deliberada de después SÍ confirma", async () => {
  // La pareja obligatoria: sin ella, un comportamiento que no confirmara NUNCA
  // pasaría la prueba de arriba con nota.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  doc.click(b);
  doc.click(b); // el doble clic, ignorado
  await pasadoElMinimo();
  doc.click(b);

  assert.equal(disparos, 1, "tras el mínimo, la confirmación deliberada no pasó");
  assert.equal(b.classList.has("armado"), false);
});

test("una espera que no sirve se DICE, y no se cambia en silencio", () => {
  const doc = crearDoc();
  const errores = [];
  const consolaOriginal = console.error;

  // `-1` y `0.5` son los peligrosos: desarman antes de que nadie pueda pulsar
  // otra vez, o sea que vuelven la acción INALCANZABLE en silencio. `abc` y `0`
  // solo mandaban al defecto sin decirlo, que se nota cuando alguien se pregunta
  // por qué su ajuste no hace nada.
  for (const malo of ["abc", "", "0", "-1", "0.5", "401", "450", "1399"]) {
    const b = boton(doc, "Borrar", { "data-confirmar-espera": malo });
    enganchar(b);
    console.error = (...a) => errores.push(a);
    try {
      doc.click(b);
    } finally {
      console.error = consolaOriginal;
    }
    assert.equal(b.classList.has("armado"), true, "con «" + malo + "» ni siquiera se armó");
  }
  assert.equal(errores.length, 8, "alguno de los ocho valores malos pasó callado");

  // La pareja: un valor BUENO no se queja. Sin esto, un validador que gritara
  // ante todo pasaría igual.
  const bueno = boton(doc, "Borrar", { "data-confirmar-espera": String(ESPERA_MINIMA_UTIL) });
  enganchar(bueno);
  const mas = [];
  console.error = (...a) => mas.push(a);
  try {
    doc.click(bueno);
  } finally {
    console.error = consolaOriginal;
  }
  assert.deepEqual(mas, [], "un valor válido produjo un aviso");
});


// El caso del botón que llega YA MARCADO —H1— NO se puede medir aquí: el
// enganche nuevo ocurre al cargar el módulo contra el `document` real, y en
// Node no hay ninguno. Vive en `banco/`, con htmx de verdad y su mutante
// (directiva 28: una pantalla hay que dibujarla).


// ── LA REPETICIÓN DEL TECLADO ────────────────────────────────────────────────

test("mantener Enter pulsado NO ejecuta la acción", async () => {
  // Medido en Chromium en las cinco configuraciones de repetición habituales
  // —X11, GNOME, macOS, Windows y la de accesibilidad—: la acción salía en las
  // cinco sin que el usuario soltara la tecla ni una vez. Toca justo a quien
  // depende del teclado, que es la población para la que existe el `aria-live`
  // de este mismo archivo.
  //
  // LAS REPETICIONES TIENEN QUE CRUZAR EL MÍNIMO EN TIEMPO REAL, o la prueba no
  // mide nada: el mínimo de armado no evita la repetición, solo RETRASA la
  // ejecución hasta el primer golpe que caiga pasados los 400 ms. Una ráfaga
  // instantánea la cortaría el mínimo y el caso rojo saldría verde con la
  // guarda retirada — comprobado, y por eso está escrito aquí.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  // El PRIMER golpe de una tecla no es repetición (`repeat: false`): el
  // navegador lo entrega como un clic normal y arma el botón. Empezar por una
  // repetición sería modelar algo que no ocurre.
  doc.click(b);
  assert.equal(b.classList.has("armado"), true, "el control: el primer Enter arma");

  await new Promise((r) => setTimeout(r, MINIMO_ARMADO + 50));
  doc.manteniendoPulsada(b); // la repetición, ya cruzado el mínimo
  doc.manteniendoPulsada(b);

  assert.equal(disparos, 0, "la repetición del teclado ejecutó la acción irreversible");
  assert.equal(b.classList.has("armado"), true, "y el botón sigue esperando su confirmación");
});

test("y los dos Enter deliberados SÍ confirman", async () => {
  // La pareja: sin ella, cortar TODO el teclado pasaría la prueba de arriba y
  // dejaría el botón inservible para quien no usa ratón.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  doc.click(b); // primer Enter: el navegador lo entrega como clic, sin `repeat`
  await pasadoElMinimo();
  doc.click(b);

  assert.equal(disparos, 1, "dos pulsaciones deliberadas de teclado no confirmaron");
});

test("Enter repetido dentro de un textarea se deja en paz", () => {
  // Directiva 21: la regla se prueba contra el usuario legítimo. Quien redacta
  // una nota dentro de un formulario que más abajo tiene un botón de confirmar
  // usa Enter para escribir, y cortarle la repetición le rompe la escritura.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const area = {
    closest: (sel) => (sel.includes("textarea") ? area : null),
    _oyentes: [],
  };
  const e = doc.manteniendoPulsada(area);

  assert.equal(e.defecto, false, "se cortó la escritura en un campo de texto largo");
});

// ── LA VENTANA QUE SE VOLVÍA INALCANZABLE ────────────────────────────────────

test("una espera que dejaría la acción inalcanzable se sujeta HACIA ARRIBA", async () => {
  // La ventana útil no es `espera`, es `espera - MINIMO_ARMADO`. Con `450` eso
  // son 50 ms: la confirmación se vuelve imposible y el botón parece averiado.
  // Alargar de más molesta; acortar de menos deja un botón que no hace nada y
  // nadie sabe por qué — entre las dos formas de equivocarse, solo una es
  // recuperable.
  const doc = crearDoc();
  const b = boton(doc, "Borrar", { "data-confirmar-espera": "450" });
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  const consolaOriginal = console.error;
  console.error = () => {};
  try {
    doc.click(b);
  } finally {
    console.error = consolaOriginal;
  }

  // A los 450 ms el botón habría muerto ya con el umbral viejo.
  await new Promise((r) => setTimeout(r, MINIMO_ARMADO + 100));
  assert.equal(b.classList.has("armado"), true, "el botón se desarmó antes de poder confirmar");
  doc.click(b);
  assert.equal(disparos, 1, "LA ACCIÓN LEGÍTIMA ERA INALCANZABLE");
});


// ── EL TECHO, que es el lado que mi banco no miraba ──────────────────────────

test("una espera por ENCIMA del techo también se sujeta, y se dice", async () => {
  // `setTimeout` trunca el retardo a 32 bits: a partir de 2³¹ dispara de
  // inmediato, así que `data-confirmar-espera="999999999999"` —la forma natural
  // de escribir «que no caduque»— desarmaba el botón antes de que nadie pudiera
  // confirmar y la acción quedaba inalcanzable PARA SIEMPRE, sin un aviso.
  const doc = crearDoc();
  const b = boton(doc, "Borrar", { "data-confirmar-espera": "999999999999" });
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  const errores = [];
  const consolaOriginal = console.error;
  console.error = (...a) => errores.push(a);
  try {
    doc.click(b);
  } finally {
    console.error = consolaOriginal;
  }

  assert.equal(errores.length, 1, "el valor enorme pasó CALLADO");
  await pasadoElMinimo();
  assert.equal(b.classList.has("armado"), true, "se desarmó solo: la acción es inalcanzable");
  doc.click(b);
  assert.equal(disparos, 1, "LA ACCIÓN LEGÍTIMA NO SE PODÍA COMPLETAR");
});

test("y el techo EXACTO se acepta sin quejarse", async () => {
  // La pareja del lado alto. Sin ella, una regla que rechazara todo lo grande
  // pasaría la de arriba con nota.
  const doc = crearDoc();
  const b = boton(doc, "Borrar", { "data-confirmar-espera": String(ESPERA_MAXIMA) });
  enganchar(b);

  const errores = [];
  const consolaOriginal = console.error;
  console.error = (...a) => errores.push(a);
  try {
    doc.click(b);
  } finally {
    console.error = consolaOriginal;
  }

  assert.deepEqual(errores, [], "el valor máximo válido produjo un aviso");
  assert.equal(b.classList.has("armado"), true);

  // Y se DESARMA antes de salir. No es limpieza cosmética: el valor máximo son
  // 24,8 días, así que el `setTimeout` que deja armado mantiene vivo el bucle de
  // eventos y `node --test` no termina nunca — el archivo entero sale rojo por
  // tiempo agotado con las 23 pruebas en verde. Costó encontrarlo.
  await pasadoElMinimo();
  doc.click(b);
  assert.equal(b.classList.has("armado"), false);
});

// ── LA BARRA ESPACIADORA, que se cortaba sin ganar nada ──────────────────────

test("mantener la barra espaciadora en un campo NO rompe la escritura", () => {
  // Estaba en la guarda «porque el coste es cero», y el coste era teclear un
  // solo espacio en los campos de CONTRASEÑA de informes y medico, donde el
  // usuario no ve lo que escribió. Y la protección que compraba, medida con el
  // mutante: cero acciones con guarda y cero sin ella (Chromique activa el
  // botón en `keyup`).
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const campo = {
    closest: (sel) => (sel === "form" ? { querySelector: () => b } : null),
    isContentEditable: false,
    _oyentes: [],
  };
  const e = doc.manteniendoPulsada(campo, " ");

  assert.equal(e.defecto, false, "se cortó el tecleo de espacios en un campo del formulario");
});

test("pero Enter repetido en ese MISMO campo sigue cortado", () => {
  // La pareja: si al quitar el espacio se hubiera quitado también el Enter, la
  // prueba de arriba pasaría y la protección habría desaparecido.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);

  const campo = {
    closest: (sel) => (sel === "form" ? { querySelector: () => b } : null),
    isContentEditable: false,
    _oyentes: [],
  };
  const e = doc.manteniendoPulsada(campo, "Enter");

  assert.equal(e.defecto, true, "la repetición de Enter dejó de cortarse");
});

// ── EL MACHAQUEO DE RATÓN ────────────────────────────────────────────────────

test("machacar el botón NO ejecuta la acción una y otra vez", async () => {
  // Medido antes de este arreglo: un clic cada 80 ms durante 2 s daba CUATRO
  // borrados, porque el patrón se re-armaba en el acto tras confirmar. En las
  // tablas de medico htmx cambia el DOM bajo el cursor entre disparo y disparo,
  // así que los sobrantes ni caen sobre la fila que el operador miraba.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  const hasta = Date.now() + 2000;
  while (Date.now() < hasta) {
    doc.click(b);
    await new Promise((r) => setTimeout(r, 80));
  }

  assert.equal(disparos, 1, "el machaqueo ejecutó la acción irreversible " + disparos + " veces");
});

test("y dos confirmaciones deliberadas SÍ ejecutan dos veces", async () => {
  // La pareja obligatoria: un bloqueo demasiado ancho dejaría el botón usable
  // una sola vez por sesión, y la prueba de arriba pasaría igual.
  const doc = crearDoc();
  const b = boton(doc);
  enganchar(b);
  let disparos = 0;
  b.addEventListener("click", () => disparos++);

  doc.click(b);
  await pasadoElMinimo();
  doc.click(b); // primera confirmación

  await new Promise((r) => setTimeout(r, BLOQUEO_TRAS_CONFIRMAR + 50));
  doc.click(b);
  await pasadoElMinimo();
  doc.click(b); // segunda, deliberada

  assert.equal(disparos, 2, "el bloqueo dejó el botón inservible tras la primera vez");
});

// ── Dos instancias del módulo, que es como se rompe el producto ──────────────
//
// Sirviendo `confirmar-doble.js` y `confirmar-doble.js?v=2` —una cadena
// rompe-cachés basta— el navegador evalúa el módulo dos veces. En la revisión
// final eso dejaba DOS oyentes de captura, y con dos la confirmación se vuelve
// casi imposible: 6 clics a 700 ms daban 0 acciones. Las dos capas del arreglo
// se prueban por separado, porque cada una cubre un caso que la otra no.

test("una SEGUNDA instancia no llega a enganchar: `registrar` lanza primero", async () => {
  const doc = crearDoc();
  doc.documentElement = { atributos: new Set(),
    setAttribute(a) { this.atributos.add(a); },
    hasAttribute(a) { return this.atributos.has(a); } };

  // El módulo mira `document` global al final del archivo. Se lo damos.
  const previo = globalThis.document;
  globalThis.document = doc;
  try {
    // La segunda instancia tiene que MORIR en `registrar`, antes de enganchar.
    await assert.rejects(
      () => import("./confirmar-doble.js?instancia=2"),
      /ya está registrado/,
      "la segunda copia debía rechazarse por nombre repetido",
    );
    // Y lo que de verdad se mide: no dejó ningún oyente detrás.
    assert.equal(
      doc.oyentesDeCaptura(),
      0,
      "la segunda instancia enganchó el documento ANTES de tropezar con la guarda",
    );
  } finally {
    if (previo === undefined) delete globalThis.document;
    else globalThis.document = previo;
  }
});

test("un documento ya marcado por OTRA instancia no se vuelve a enganchar", () => {
  // La segunda capa, y la que cubre el caso que la primera no: alguien registra
  // el comportamiento con otro nombre, así que `registrar` no lanza. La marca
  // vive en el DOM, que es el único estado que dos copias del módulo comparten
  // —un `WeakSet` de módulo no cruza instancias, y ése era el defecto—.
  const doc = crearDoc();
  const marcado = { atributos: new Set([_MARCA_ENGANCHADO]),
    setAttribute(a) { this.atributos.add(a); },
    hasAttribute(a) { return this.atributos.has(a); } };
  doc.documentElement = marcado;

  _engancharDocumento(doc);
  assert.equal(doc.oyentesDeCaptura(), 0, "volvió a enganchar un documento ya marcado");

  // LA PAREJA: un documento SIN la marca sí se engancha, una sola vez. Sin
  // esto, una guarda que rechazara siempre pasaría igual.
  const limpio = crearDoc();
  limpio.documentElement = { atributos: new Set(),
    setAttribute(a) { this.atributos.add(a); },
    hasAttribute(a) { return this.atributos.has(a); } };
  _engancharDocumento(limpio);
  assert.equal(limpio.oyentesDeCaptura(), 1, "un documento limpio tiene que engancharse");
  assert.ok(limpio.documentElement.hasAttribute(_MARCA_ENGANCHADO), "y quedar marcado");
  _engancharDocumento(limpio);
  assert.equal(limpio.oyentesDeCaptura(), 1, "y no dos veces");
});

// ── El hx-trigger que salta la barrera entera ────────────────────────────────

test("el troceo de hx-trigger saca el EVENTO de cada cláusula", () => {
  assert.deepEqual(_eventosDeTrigger("click"), ["click"]);
  assert.deepEqual(_eventosDeTrigger("click once"), ["click"]);
  assert.deepEqual(_eventosDeTrigger("keyup changed delay:500ms, click"), ["keyup", "click"]);
  assert.deepEqual(_eventosDeTrigger("  MouseDown  "), ["mousedown"]);
  assert.deepEqual(_eventosDeTrigger("every 2s"), ["every"]);
});

test("avisa del hx-trigger que la barrera NO cubre, y calla con click y submit", () => {
  const doc = crearDoc();
  const avisos = [];
  const warnPrevio = console.warn;
  console.warn = (msg) => avisos.push(String(msg));
  try {
    // LA MITAD QUE TIENE QUE AVISAR: cinco disparadores que htmx lanzaría sin
    // pasar por el oyente de captura de `click`.
    for (const t of ["mousedown", "pointerdown", "mouseup", "dblclick", "keyup changed"]) {
      avisos.length = 0;
      enganchar(boton(doc, "Borrar", { "hx-trigger": t }));
      assert.equal(avisos.length, 1, `«${t}» debía avisar`);
      assert.match(avisos[0], /NO cubre/);
    }

    // LA MITAD QUE TIENE QUE CALLAR. Sin ella, un aviso que salte siempre pasa
    // esta prueba igual — que es exactamente cómo se escribe una alarma inútil.
    for (const t of ["click", "click once", "submit", null]) {
      avisos.length = 0;
      const attrs = t === null ? {} : { "hx-trigger": t };
      enganchar(boton(doc, "Borrar", attrs));
      assert.equal(avisos.length, 0, `«${t}» no debía avisar`);
    }
  } finally {
    console.warn = warnPrevio;
  }
});

test("avisa de un botón con hijos, que los perdería al armarse", () => {
  const doc = crearDoc();
  const avisos = [];
  const warnPrevio = console.warn;
  console.warn = (msg) => avisos.push(String(msg));
  try {
    const conIcono = boton(doc);
    conIcono.children = [{ tag: "svg" }, { tag: "span" }];
    enganchar(conIcono);
    assert.equal(avisos.length, 1, "un botón con hijos debía avisar");
    assert.match(avisos[0], /PIERDE para siempre/);

    // LA PAREJA: texto puro, que son los 27 usos vivos, no avisa.
    avisos.length = 0;
    enganchar(boton(doc));
    assert.equal(avisos.length, 0, "un botón de texto puro no debía avisar");
  } finally {
    console.warn = warnPrevio;
  }
});
