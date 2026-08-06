<!-- SPDX-License-Identifier: MIT -->
# boi

**Comportamiento de cliente declarativo, sobre [htmx](https://htmx.org), sin
dependencias.**

`boi` es el complemento de un frontend `maud` + htmx: el servidor teje el HTML
(maud), htmx hace los intercambios parciales, y `boi` cubre lo que queda —la
interacción que ocurre solo en el navegador: una máscara de entrada, una
validación antes de enviar, una confirmación—. Se marca el HTML con `data-*` y
`boi` actúa; el HTML sigue siendo la única fuente de verdad.

**Cero dependencias, cero build.** Un módulo de JavaScript que el navegador
entiende tal cual. Se sirve como está, se lee de una sentada, y no arrastra un
árbol de paquetes que un tercero pueda comprometer — que es exactamente por lo
que existe.

## Uso

```html
<!-- htmx y boi se sirven LOCALES (empotrados en el binario), nunca de un CDN:
     un `<script src>` a un CDN es justo el vector —CDN comprometido— que este
     stack existe para cerrar. Sin `integrity`/SRI porque no hay origen externo
     que verificar; el binario sirve sus propios bytes. -->
<script src="/htmx.min.js"></script>
<script type="module" src="/boi.js"></script>
<script type="module" src="/comportamientos/mascara.js"></script>
```

Un comportamiento se registra contra el núcleo y actúa por atributo:

```js
// comportamientos/mascara.js
import { registrar } from "../boi.js";

registrar("mascara", "[data-mascara]", (el) => {
  el.addEventListener("input", () => { /* formatea el valor */ });
});
```

```html
<input data-mascara="fecha">
```

`boi` escanea la página al cargar **y cada fragmento que htmx trae** (evento
`htmx:load`), aplicando cada comportamiento una sola vez por elemento. Un
fragmento nuevo llega vivo sin que nadie lo cablee.

## Lo que NO es

- No es un framework: sin virtual DOM, sin estado global, sin enrutado.
- No reemplaza a htmx: no hace peticiones. Lo que hable con el servidor es htmx.
- No es requisito: es **mejora progresiva**. Si el JS no carga, la página
  funciona igual. La seguridad vive en el servidor, **nunca aquí** — la
  validación de cliente es comodidad, no barrera.
- No crece por especulación: cada comportamiento entra cuando un proyecto real lo
  necesita, con su prueba.

## Núcleo

`boi.js` es solo el núcleo: el registro de comportamientos, el escáner
idempotente y el enganche a htmx. Los comportamientos concretos (máscaras,
validaciones…) viven en archivos aparte y se van añadiendo desde el uso.

## Pruebas

```bash
node --test          # el runner nativo de Node ≥ 18: sin npm, sin node_modules
```

La lógica del escáner se prueba con un doble de DOM mínimo. El comportamiento
real en un navegador (que un fragmento de htmx llegue con sus comportamientos
vivos) se prueba de extremo a extremo con Chromium headless desde cada proyecto
que usa `boi` — ahí es donde cruza la frontera del programa.

**No hay `package.json` ni `node_modules`, a propósito**: Node ejecuta el módulo
por detección de sintaxis. Un `npm install` aquí sería el error que este proyecto
existe para no cometer.

## Titularidad

Isaza Arenas, MIT (ver `LICENSE` y `NOTICE`).
