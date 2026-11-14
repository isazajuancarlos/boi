# CLAUDE.md

Guía para trabajar en este repositorio.

> **Configuración general: `~/.claude/CLAUDE.md`** — directivas numeradas, reglas
> que no se rompen, máquinas montadas. Se carga en toda sesión y **no se copia
> aquí**.

## Qué es

`boi` — librería de comportamiento de cliente sobre htmx, **vanilla JS, cero
dependencias, cero build**. El complemento del estándar `axum + maud + htmx`
(directiva 26): maud teje el HTML, htmx hace los swaps, boi cubre la interacción
que ocurre solo en el navegador.

Nació el 2026-08-06 como la primera pieza del cambio de estándar de frontend
(Angular → maud+htmx). Su razón de ser es la cadena de suministro: cuando htmx no
alcanza, la alternativa npm (`alpine.js`, …) es un árbol que un tercero puede
comprometer. boi es código propio, auditado, congelado — así el frontend entero
queda sin una sola dependencia npm y el binario es reproducible.

Pública, MIT. Se comparte entre todos los proyectos, empotrada en cada binario
(`rust-embed`, como la interfaz).

## Comandos

```bash
cargo test --manifest-path banco/Cargo.toml                 # todo (~26 s)
cargo test --manifest-path banco/Cargo.toml --test logica   # solo la lógica
cargo test --manifest-path banco/Cargo.toml --test banco    # solo el navegador
```

**El arnés es RUST desde el 2026-09-28** (`banco/`, `std` puro, sin crates;
crónica en `banco/MIGRACION.md`). Antes era node (`node --test`), y se migró
porque node NO es del stack (D26/D38) y dejó de estar en la máquina tras un
reinstalar —el banco quedó muerto y `verde_local.py boi` no podía dar verde—. No
fue por decreto: fue el gatillo de la D38 (un banco que se rompe). La migración
de paso mejoró la fidelidad (D28): la lógica dejó el doble de DOM y pasó al DOM
real, dentro de un Worker de Chromium.

**El producto `boi` sigue sin usar node ni build**: el arnés Rust no viaja a
ningún binario, prueba a boi sin acompañarlo. Rust aquí es el ORQUESTADOR
(servidor HTTP de loopback + lanzar Chromium); el JavaScript de las pruebas corre
en el navegador, que es el motor JS que el stack acepta.

**El banco de navegador necesita `chromium` en el PATH y NO se salta si falta**:
falla con su nombre. Una prueba que se salta sola es indistinguible de una que
pasó (directiva 30).

**El verde es LOCAL y está DECLARADO en `.github/workflows/ci.yml`**, que no lo
corre GitHub —Actions está apagado en toda la cuenta desde el protocolo «solo
local»— sino `verde_local.py`:

```bash
python3 /mnt/data/conocimiento/cupo/verde_local.py boi
```

Ese guion abre el `ci.yml`, saca los `run:` en su orden y los ejecuta, para que
«el comando exacto» no sea una frase que se copia a mano y envejece.

**El 2026-08-12 borré ese archivo y aquí escribí que sobraba. Las dos cosas
estaban mal.** Razoné que un workflow que nadie ejecuta es una promesa vacía, y
era una conclusión sacada de una lectura superficial (directiva 2): el archivo
tenía un segundo oficio —ser la definición del verde— que no estaba escrito en
él. Al quitarlo, `verde_local.py boi` pasó a contestar «NO EXISTE», o sea que boi
se quedó **sin forma declarada de decir si está verde**, y sin que nada diera un
error. Restaurado el 2026-08-13, con el oficio escrito dentro.

**No hay `package.json` ni `node_modules`, a propósito** — ni node siquiera: el
arnés es Rust y el JavaScript corre en el navegador. Un `npm install` aquí sería
el error que la librería existe para no cometer.

## Arquitectura

- **`boi.js`** — el núcleo, y nada más: el registro de comportamientos
  (`registrar`), el escáner idempotente (`escanear`) y el enganche a htmx
  (`enganchar`, a `DOMContentLoaded` y `htmx:load`). ~90 líneas, legible de una
  sentada. Se auto-instala en `globalThis.boi` y auto-engancha SOLO si hay
  `document` (en las pruebas no, para poder inyectar un doble).
- **`boi.css`** — la MITAD ESTÉTICA (D26: *CSS propio, con variables, sin
  framework*). Tokens `--boi-*` en `:root`, modo claro/oscuro
  (`prefers-color-scheme` + `[data-theme]`), IBM Plex empotrada como `data:` URI
  (fuentes en `fuentes/*.woff2`, autocontenida sin CDN), y clases de componente
  (`.boi-btn`, `.boi-h1..h3`, `.boi-etq`, `.boi-mono`…). Es **opcional**: los
  comportamientos funcionan sin ella (usan los tokens con *fallback*). Se
  vendoriza y sirve como `boi.js` (ver la regla de propagación abajo).
- **`comportamientos/*.js`** — cada comportamiento concreto (máscara, validación,
  confirmación…) en su archivo, importando `registrar`, **con su `.test.js` al
  lado**. Se añaden desde lo que un proyecto real pide; nunca por especulación
  (directiva 9). El catálogo lo llena el uso.

  | comportamiento | qué hace | lo pidió |
  |---|---|---|
  | `confirmar-doble` | una acción irreversible exige dos pulsaciones | chasqui (2026-08-06), copiado en informes, y `medico` iba a ser la tercera copia |
  | `calendario-multiple` | elegir VARIAS fechas sueltas en una rejilla mensual | informes (2026-08-10), el gesto que se perdió al retirar `@angular/material` |
  | `modal` | un `<dialog>` que trae htmx se abre modal y se retira solo al cerrarse | portado de la receta de dominio público de django-htmx-patterns vía mindalá (2026-09-28); ver la cabecera del archivo — NO es mejora progresiva, y eso se declara |
  | `conmutar` | un campo cuyo valor muestra/oculta y habilita/deshabilita otros | técnica `up-switch` de Unpoly, cazada vía mindalá (característica 1) el 2026-09-28; el criterio de R8 determinó que sirve (htmx no la cubre) |
  | `expandir` | hace clicable un contenedor entero disparando el enlace/botón interno | técnica `up-expand` de Unpoly, cazada vía mindalá (característica 2) el 2026-09-28 |
  | `esqueleto` | shimmer «structure-aware» midiendo el DOM real mientras htmx carga | técnica de phantom-ui (sin su dep Lit), cazada vía mindalá (característica 3) el 2026-09-28; su medición se prueba en el banco de navegador, no en la lógica (D28) |

  **`confirmar-doble` nació ya escrito dos veces**, y ése es el argumento de por
  qué este directorio existe: el archivo de informes decía literalmente «se copia
  y no se reescribe porque hoy no hay forma de compartir un comportamiento entre
  proyectos sin publicarlo». Sí la hay, y es la misma por la que viaja `boi.js`:
  vendorizado dentro de cada binario.

  Y al unificarlo salió un defecto que las DOS copias tenían —`stopPropagation()`
  no corta a los oyentes del mismo nodo, que es donde htmx pone el suyo—. Es la
  razón entera de la directiva 9 en una línea: un defecto en código copiado se
  arregla una vez por copia, y solo si alguien se acuerda.

  **Las tres copias están retiradas** (2026-08-07, el mismo día). `chasqui`
  (`8b87d00`, rama `feat/panel-en-maud`) e `informes` (`92b658e`, rama
  `deps/boi-confirmar-doble-compartido`) vendorizan ya este archivo; `medico`
  nació con él. Los tres lo sirven bajo **`/comportamientos/`** y no en la raíz,
  porque el archivo importa `from "../boi.js"` y se vendoriza SIN TOCAR — que es
  lo que hace comprobable con `md5sum` que es el mismo en todos (directiva 26).
  Editarle el import al vendorizarlo sería romper justo esa garantía.

  `chasqui` conserva su `comportamientos.js` con `autoscroll`, que solo usa él:
  un comportamiento de un consumidor **no** sube a la librería. Es la directiva 9
  en su otra dirección, y conviene tenerla escrita — si no, este directorio se
  llena de cosas que nadie más quiere.
- **`*.test.js`** — la lógica (escáner, registro, cada comportamiento) con dobles
  de DOM mínimos. Miden el CÓDEC, y desde la migración corren en un **Worker de
  Chromium** (ámbito sin `document`, como node): las corre `tests/logica.rs`,
  importando cada archivo SIN TOCARLO con `node:test`/`node:assert` reescritos a
  shims del arnés. Un archivo por carga, para aislar el estado de módulo como
  `node --test` aislaba por proceso.
- **`banco/`** — **el arnés en RUST** (`std` puro, sin crates; migrado de node el
  2026-09-28, ver `banco/MIGRACION.md`) y **boi DIBUJADO en un navegador de
  verdad** (desde el 2026-08-12). Los proyectos prueban SUS pantallas, no el
  contrato de la librería, y la promesa entera de boi —«un fragmento que trae htmx
  llega con sus comportamientos vivos»— la cumplen tres piezas que el doble de DOM
  no tiene: el cargador de módulos del navegador, la resolución de `../boi.js` y
  htmx emitiendo `htmx:load` sobre el nodo insertado (directiva 28).

  Sin dependencias, como todo lo demás: `src/servidor.rs` es un servidor HTTP de
  loopback sobre `std::net`; `src/navegador.rs` lanza Chromium con
  `std::process` (Chromium es proceso externo aislado, patrón `mirador`→`yt-dlp`);
  `src/json.rs` lee el informe sin `serde`. htmx 2.0.4 vendorizado en
  `banco/vendor/` **solo para las pruebas** (no viaja a ningún binario). La página
  informa desde dentro por `sendBeacon` y las afirmaciones viven del lado de
  `cargo test` (`tests/banco.rs`); no se mira el DOM volcado porque un intercambio
  de htmx es asíncrono y un volcado tomado un instante antes se ve igual que un
  comportamiento que no se enganchó.

  **Ocho pruebas de navegador (E2E), y cinco son mutantes** (directiva 33): se
  rompe la salvaguarda EN `boi.js` —no en el arnés— y se exige que la observación
  cambie. `mutar` valida la aguja contra el artefacto antes de correr, y cada
  mutante lleva su positivo de control (que el mutante SÍ cargó, para que el rojo
  no se explique por un módulo roto).

  **Lo que la revisión de seguridad del banco añadió** (2026-08-12, sin hallazgos
  y con nueve observaciones que sí valían): el perfil de Chromium se borraba y
  los procesos hijos lo REHACÍAN justo después —76 perfiles acumulados en
  `/var/tmp` con la línea de limpieza puesta—, así que ahora el navegador va en
  su propio grupo de procesos y se espera su muerte antes de borrar (medido:
  delta 0). Se quitó `--no-sandbox`, que no compraba nada aquí. La ruta del
  informe lleva un **nonce**: el banco escucha en loopback, pero una pestaña
  cualquiera podía dispararle un `sendBeacon` a ciegas, y lo único que este banco
  produce es un veredicto. Y `abrir()` pasó dentro del `try`: sin navegador, el
  mensaje cuidado llegaba acompañado de un cuelgue.

  **La QUINTA revisión no fue de un delta sino del ARTEFACTO FINAL** —los bytes
  que se copian en los cinco binarios, anclados a su SHA (directiva 31)—, y fue
  la que encontró lo que muerde:

  - **El doble clic atravesaba `confirmar-doble` entero.** Dos pulsaciones a 8 ms
    ejecutaban la acción irreversible, con el texto de confirmación apareciendo y
    desapareciendo sin que nadie pueda leerlo. **No era latente: afectaba a los
    27 usos vivos de medico, informes y chasqui.** Hay ahora un mínimo de 400 ms
    antes de que la segunda pulsación cuente, elegido contra el usuario legítimo
    y no contra el atacante (directiva 21).
  - **La barrera desaparecía si el botón llegaba YA MARCADO.** El escáner salta
    el `init` de lo marcado, y la caché de historial de htmx guarda el
    `innerHTML` **con la marca puesta**: al volver con Atrás, el botón renace
    marcado y, si es el único de la página, no hay oyente y la acción sale a la
    primera. Se arregla enganchando el documento al cargar el módulo, no desde
    el `init`. Latente hoy —ningún consumidor usa `hx-boost`—, y por eso se
    arregla ahora: el día que alguien lo añada, se cae sin un error en consola.
    Está medido en el banco **contra el servidor**, que es la única prueba de
    que la barrera no existió: el DOM puede engañar.
  - `data-confirmar-espera` avisa de lo que no sirve en vez de sustituirlo en
    silencio (directiva 20): con `-1` o `0.5` el botón se desarmaba antes de que
    nadie pudiera pulsar otra vez, o sea que la acción se volvía **inalcanzable**.

  **Y una SEXTA revisión sobre ese arreglo encontró dos cosas más, las dos de
  confianza 9** — que es la razón de revisar los arreglos y no solo el trabajo:

  - **La ventana útil no es `espera`, es `espera - MINIMO_ARMADO`**, y al poner
    el mínimo se me olvidó mover con él la definición de «inalcanzable»: el
    umbral quedó en `> 400`, así que `data-confirmar-espera="450"` dejaba 50 ms
    para confirmar y **la acción se volvía imposible, en silencio**. Era la
    regresión exacta que esa función dice impedir, movida de sitio. Ahora el
    valor se **sujeta hacia arriba** —nunca hacia abajo— con aviso: alargar de
    más molesta, acortar de menos deja un botón que no hace nada y nadie sabe
    por qué.
  - **La repetición del teclado atravesaba la barrera entera.** Mantener Enter
    pulsado produce `click` de CONFIANZA cada 15-40 ms, indistinguibles del
    bueno, y el mínimo no los cierra: solo retrasa la ejecución hasta el primer
    golpe que caiga pasados los 400 ms. Medido en las cinco configuraciones de
    repetición habituales, y **vivo** en el «Desactivar 2FA» de informes. Se
    corta en `keydown`, que es donde `e.repeat` sí lo distingue, dejando en paz
    los campos de texto largo — quien redacta una nota usa Enter para escribir
    (directiva 21).

    **Su primera prueba no discriminaba y por poco la doy por buena**: disparaba
    las 40 repeticiones en cero milisegundos, así que las cortaba el mínimo y el
    mutante sin guarda salía verde. Las repeticiones tienen que cruzar el mínimo
    en TIEMPO REAL, y el primer golpe de una tecla no es repetición.

  **La SÉPTIMA revisión, sobre ese arreglo, encontró otras dos de confianza 9 —y
  la primera es el mismo error mío por el otro extremo**:

  - **Acoté la espera por abajo y dejé el techo abierto.** `setTimeout` trunca el
    retardo a 32 bits, así que `data-confirmar-espera="999999999999"` —la forma
    natural de escribir «que no caduque»— desarma en el acto y deja la acción
    **inalcanzable para siempre, sin un aviso**. Y mi banco no podía verlo: los
    ocho valores malos que escribí estaban **todos por debajo del umbral** — un
    banco de un solo lado sale verde con la regla buena y con una regla ciega
    (directiva 33). Hay techo, y la pareja mira los dos lados.
  - **Metí la barra espaciadora en la guarda del teclado «porque el coste es
    cero», y el coste no era cero**: cortaba el tecleo de espacios en cualquier
    campo del formulario, incluidos los de contraseña de informes y medico,
    donde el usuario no ve lo que escribió. Y la protección que compraba, medida
    con el mutante: **cero acciones con la guarda y cero sin ella**. Fuera.

  Y de paso, el machaqueo de ratón: un clic cada 80 ms durante 2 s ejecutaba
  **cuatro** borrados, porque el patrón se re-armaba en el acto tras confirmar.
  El bloqueo se cuenta desde el ÚLTIMO clic y no desde la confirmación —contado
  desde la confirmación seguían saliendo dos, porque expiraba dentro de la
  ráfaga—, así que la ráfaga se prolonga a sí misma y hace falta soltar.

  **Y una TERCERA revisión sobre los arreglos de la segunda** —el momento en que
  entran los defectos nuevos—, también sin hallazgos, encontró lo que más
  importaba: **la prueba del aislamiento había dejado de poder ponerse roja por
  la vía real**, porque validar el selector cerró justo el camino que ella medía;
  y quedaba abierta la puerta gemela —un NOMBRE que no sirve como atributo—, que
  produce el mismo catálogo envenenado. Cerrada, con su pareja. El aviso de la
  prueba está escrito encima de ella en vez de fingir que discrimina
  (directiva 33).

## Reglas de este repo

- **Cero dependencias externas y cero build.** El archivo que se escribe es el que
  se sirve. Si algo «necesitaría» una lib, se escribe la primitiva mínima aquí.
- **La seguridad no vive en boi.** La validación de cliente es comodidad; la
  barrera está en el servidor. Un comportamiento que «valida» no puede ser la
  única comprobación de nada.
- **Idempotente y vivo tras los swaps.** Todo comportamiento debe sobrevivir a que
  htmx reemplace su fragmento: se prueba que re-escanear no re-inicializa y que un
  fragmento nuevo sí se engancha.
- **Mejora progresiva.** Sin JS, la página funciona. boi solo añade.
- **Un comportamiento no puede llevarse por delante a los demás.** El aislamiento
  cubre el comportamiento ENTERO —selector incluido—, no solo su `init`: un
  selector que el navegador rechaza dejaba sin correr a todo lo registrado
  DESPUÉS, y en un swap de htmx eso es media pantalla muerta. Y el catálogo se
  valida ANTES de admitir nada: nombre repetido, nombre que solo se diferencia en
  la caja —HTML minusculiza los atributos, así que `Mix` y `mix` comparten
  marca— y selector inválido se rechazan al registrar (2026-08-12).
- **El oyente global va UNO por documento, no uno por elemento.** Registrarlo
  dentro de un `init` crea un cierre que retiene el nodo y no se retira nunca:
  con htmx trayendo el mismo fragmento cada pocos segundos, los oyentes y los
  nodos muertos crecen sin techo. Se resuelve el elemento en el momento del
  evento, con `closest`.
- **Todo cambio en `boi.js` —y en `boi.css`— se propaga a los consumidores en la
  misma pasada.** Son **cinco** copias vendorizadas —chasqui, informes, medico,
  inventario, chuspa— de **las DOS piezas** (`boi.js` el comportamiento, `boi.css`
  la estética), y la garantía que las sostiene es que el `md5sum` de las cinco
  coincide con el de aquí, pieza por pieza. Un arreglo que se queda en el origen
  convierte esa garantía en una frase escrita, que es exactamente el defecto que
  la directiva 9 existe para cerrar. Las que lleven el md5 escrito en un
  comentario del código Rust: se actualiza también.

  `boi.css` se vendorizó en los cinco el 2026-09-29 (decisión de Juan): la mitad
  estética viajaba SOLO en el repo de boi —indocumentada y sin que nadie la
  sirviera—, que es media librería que el consumidor no sabía que existía.
