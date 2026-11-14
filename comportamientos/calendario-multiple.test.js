// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Prueba de `calendario-multiple`, con `node --test` y sin navegador.
//
// ── QUÉ SE PRUEBA AQUÍ Y QUÉ NO, Y POR QUÉ ESE REPARTO ───────────────────────
//
// Aquí, la ARITMÉTICA: qué fechas hay en un texto, cómo se escriben de vuelta, y
// qué días caen en cada casilla de la rejilla. Son funciones puras y es donde
// viven los errores que no se ven mirando la pantalla —un mes que empieza en
// domingo, un bisiesto, un `2026-02-30`, el día que se corre por la zona
// horaria—.
//
// El DIBUJO no se prueba aquí. Un doble de DOM capaz de sostener una tabla con
// `createElement`, `append` y `aria-*` acabaría midiendo el doble y no el
// comportamiento (directiva 28: eso es medir el códec). Lo dibuja de verdad el
// banco de navegador de `informes`, que arranca el binario y lo mira con
// Chromium — incluida la comprobación de que ningún control queda sin nombre
// accesible.

// LA ZONA HORARIA SE FIJA AQUÍ, Y ES LO QUE HACE ÚTIL A LA ÚLTIMA PRUEBA.
//
// Se pone ANTES de crear cualquier `Date`. El defecto que se caza —construir en
// hora local y formatear en UTC— **solo se manifiesta al ESTE de Greenwich**:
// allí la medianoche local es el día ANTERIOR en UTC. Al oeste (UTC-5, que es
// Colombia) la medianoche local cae a las 05:00 UTC del MISMO día y no se
// corre nada.
//
// Medido con el mutante puesto: `America/Bogota` 10/10 en verde, `UTC` 10/10 en
// verde, `Europe/Madrid` 3 rojas, `Asia/Tokyo` 3 rojas. O sea que sin esta línea
// la prueba era decorativa exactamente en los dos sitios donde corre —la máquina
// de desarrollo y el CI, que va en UTC—. Y el comentario que tenía debajo decía
// lo contrario de lo que pasa: que el fallo se vería en Colombia. No se ve.
process.env.TZ = "Asia/Tokyo";

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { fechasDe, textoDe, rejilla, mesInicial } from "./calendario-multiple.js";

test("lee las fechas con los mismos separadores que acepta el servidor", () => {
  const f = fechasDe("2026-01-15\n2026-02-15, 2026-03-15; 2026-04-15");
  assert.deepEqual([...f].sort(), ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
});

test("no repite, y el orden de entrada no importa", () => {
  assert.equal(fechasDe("2026-01-15\n2026-01-15").size, 1);
  assert.equal(textoDe(fechasDe("2026-03-01\n2026-01-01\n2026-02-01")),
    "2026-01-01\n2026-02-01\n2026-03-01");
});

test("lo que no es una fecha ISO se ignora al DIBUJAR, y solo aquí", () => {
  // El rechazo ruidoso de lo ilegible es del dominio, en el servidor. Esto pinta
  // una rejilla: si reventara con lo que alguien está tecleando a medias, el
  // campo dejaría de poder escribirse.
  const f = fechasDe("2026-01-15\n15/01/2026\nmañana\n\n   \n2026-1-5");
  assert.deepEqual([...f], ["2026-01-15"]);
});

test("una fecha con forma válida y que NO existe se descarta", () => {
  // `2026-02-30` pasa el patrón y no es un día. Sin esta comprobación acabaría
  // pintada en la casilla del 2 de marzo, que es peor que no pintarla.
  assert.equal(fechasDe("2026-02-30").size, 0);
  assert.equal(fechasDe("2026-13-01").size, 0);
  assert.equal(fechasDe("2025-02-29").size, 0, "2025 no es bisiesto");
  assert.equal(fechasDe("2024-02-29").size, 1, "2024 sí lo es");
});

test("la rejilla son seis semanas de siete días, siempre", () => {
  // Fijo y no variable: con un número variable de semanas la rejilla cambia de
  // alto al pasar de mes y los días bailan bajo el cursor.
  for (const mes of [0, 1, 5, 11]) {
    const r = rejilla(2026, mes);
    assert.equal(r.length, 6);
    for (const semana of r) assert.equal(semana.length, 7);
  }
});

test("la semana empieza en LUNES", () => {
  // 2026-03-01 es domingo: tiene que caer en la ÚLTIMA columna de la primera
  // semana, no en la primera. Es el caso que se equivoca solo si alguien copia
  // una rejilla en domingo.
  const r = rejilla(2026, 2);
  assert.equal(r[0][6], "2026-03-01");
  assert.deepEqual(r[0].slice(0, 6), [null, null, null, null, null, null]);
});

test("los días del mes están todos y en orden, y los de fuera son null", () => {
  const plano = rejilla(2026, 1).flat(); // febrero de 2026, 28 días
  const dias = plano.filter(Boolean);
  assert.equal(dias.length, 28);
  assert.equal(dias[0], "2026-02-01");
  assert.equal(dias[27], "2026-02-28");
  assert.deepEqual(dias, [...dias].sort(), "la rejilla se recorre en orden");
});

test("febrero de un bisiesto trae 29", () => {
  assert.equal(rejilla(2024, 1).flat().filter(Boolean).length, 29);
});

test("la fecha NO se corre por la zona horaria", () => {
  // El defecto clásico: construir con `new Date(a, m, d)` —hora LOCAL— y
  // formatear en UTC. Al este de Greenwich la medianoche local es el día
  // anterior en UTC, así que el 1 de enero sale como 31 de diciembre y la
  // rejilla entera se desplaza un día. Todo el módulo es UTC de punta a punta;
  // esta prueba lo sujeta, y solo puede sujetarlo porque la cabecera del archivo
  // fija `TZ=Asia/Tokyo` (ver allí por qué).
  assert.equal(rejilla(2026, 0).flat().filter(Boolean)[0], "2026-01-01");
  assert.equal(rejilla(2026, 11).flat().filter(Boolean).at(-1), "2026-12-31");
});

test("se abre en el mes de la PRIMERA fecha marcada, no en el de hoy", () => {
  // Abrir siempre en el mes actual obligaría a navegar hacia atrás para ver lo
  // que uno mismo acaba de escribir.
  const hoy = new Date(Date.UTC(2026, 7, 10));
  assert.deepEqual(mesInicial(fechasDe("2026-03-15\n2026-01-15"), hoy), { anio: 2026, mes: 0 });
  assert.deepEqual(mesInicial(fechasDe(""), hoy), { anio: 2026, mes: 7 });
});
