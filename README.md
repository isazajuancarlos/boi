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
<link rel="stylesheet" href="/boi.css">          <!-- la mitad estética (opcional) -->
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
idempotente y el enganche a htmx. Los comportamientos concretos viven en archivos
aparte y se van añadiendo desde el uso.

## Estética — `boi.css` (la otra mitad)

Junto al comportamiento, boi trae la **mitad CSS del sistema de diseño** (el
estándar del stack: *CSS propio, con variables, sin framework*). Es **opcional**
—los comportamientos no dependen de ella— pero es lo que da a los proyectos del
stack una cara común sin que cada uno reinvente la paleta.

- **Tokens** en `:root` (variables `--boi-*`): paleta neutra *slate*, un acento
  «oro muisca», colores semánticos (ok/aviso/mal/info), radios, sombras, easing y
  las tres familias tipográficas.
- **Modo claro y OSCURO**: `@media (prefers-color-scheme: dark)`, con opt-out
  `[data-theme="light"]` y forzado `[data-theme="dark"]`.
- **IBM Plex (Sans/Serif/Mono) empotrada como `data:` URI** — autocontenida, sin
  CDN, por la misma razón de cadena de suministro que `boi.js`: un producto que
  corre offline en casa del cliente no puede depender de que alguien le sirva un
  archivo (ni una fuente).
- **Clases de componente** que consumen los tokens: `.boi-h1`/`.boi-h2`/`.boi-h3`,
  `.boi-etq`, `.boi-mono`, `.boi-btn` (+ `--primario`…), etc.

Un comportamiento que necesite pintar (p. ej. `esqueleto`) usa los tokens con
*fallback*: `var(--boi-panel-2, …)`, así respeta el tema cuando `boi.css` está
cargado y degrada a un neutro cuando no.

Se **vendoriza dentro del binario igual que `boi.js`** y se sirve bajo `/boi.css`
(ver «Titularidad» y las reglas del repo: el `md5sum` de la copia de cada
consumidor coincide con el de aquí).

| comportamiento | qué hace |
|---|---|
| `confirmar-doble` | una acción irreversible exige dos pulsaciones separadas —un doble clic no cuenta—, y se desarma sola |
| `calendario-multiple` | elegir varias fechas sueltas en una rejilla mensual |
| `modal` | un `<dialog>` que trae htmx se abre modal y se retira solo al cerrarse |
| `conmutar` | un campo cuyo valor muestra/oculta (y habilita/deshabilita) otros; el «campo Otro» que solo aparece —y solo se exige— cuando aplica |
| `expandir` | hace clicable un contenedor entero (fila, tarjeta) disparando el enlace o botón que lleva dentro |
| `esqueleto` | mientras htmx carga, dibuja un shimmer con la FORMA del contenido midiéndolo, sin mantener a mano una segunda versión |

## Pruebas

El arnés es **Rust** (`banco/`, `std` puro, sin crates), y corre TODO —la lógica
y el navegador— dentro de Chromium. Se migró de node el 2026-09-28 porque node no
es del stack y dejó de estar en la máquina (ver `banco/MIGRACION.md`).

```bash
cargo test --manifest-path banco/Cargo.toml    # todo (~26 s)
cargo test --manifest-path banco/Cargo.toml --test banco    # solo el navegador (E2E)
cargo test --manifest-path banco/Cargo.toml --test logica   # solo la lógica
```

Dos capas, y las dos corren en un navegador de verdad:

- **La lógica** (`tests/logica.rs`): las pruebas `*.test.js` se importan SIN
  TOCARLAS dentro de un **Web Worker** de Chromium —un ámbito sin `document`,
  como node—, con `node:test`/`node:assert` resueltos a shims del arnés. El Worker
  es el motor JS que reemplaza a node.
- **El navegador** (`tests/banco.rs`): **la librería DIBUJADA** con Chromium
  headless, htmx de verdad y un intercambio parcial de verdad, para comprobar lo
  único que esta librería promete —que un fragmento traído por htmx llega con sus
  comportamientos vivos—.

  **Cinco de las ocho pruebas del banco son mutantes**: rompen a propósito una
  salvaguarda dentro de `boi.js` y exigen que la observación cambie. Un banco que
  solo sabe decir que sí saldría verde igual con una librería rota.

  Necesita `chromium` en el PATH, y **si no está, falla**: no se salta. Una prueba
  que se salta sola es indistinguible de una que pasó.

**El producto `boi` no usa node ni build de ninguna clase.** El arnés en Rust no
viaja a ningún binario: prueba a boi, no lo acompaña. El htmx que usa el banco
está vendorizado en `banco/vendor/`, solo para las pruebas.

## Titularidad

Isaza Arenas, MIT (ver `LICENSE` y `NOTICE`).
