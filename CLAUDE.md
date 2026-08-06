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
node --test              # el runner nativo de Node ≥ 18: SIN npm, SIN node_modules
```

**No hay `package.json` ni `node_modules`, a propósito.** Node ejecuta el módulo
ESM por detección de sintaxis. Un `npm install` aquí es el error que la librería
existe para no cometer — el `.gitignore` bloquea `node_modules/` por si acaso.

## Arquitectura

- **`boi.js`** — el núcleo, y nada más: el registro de comportamientos
  (`registrar`), el escáner idempotente (`escanear`) y el enganche a htmx
  (`enganchar`, a `DOMContentLoaded` y `htmx:load`). ~90 líneas, legible de una
  sentada. Se auto-instala en `globalThis.boi` y auto-engancha SOLO si hay
  `document` (en las pruebas no, para poder inyectar un doble).
- **`comportamientos/*.js`** (aún no hay ninguno) — cada comportamiento concreto
  (máscara, validación, confirmación…) en su archivo, importando `registrar`. **Se
  añaden desde lo que un proyecto real pide, con su prueba; nunca por
  especulación** (directiva 9). El catálogo lo llena el uso, empezando por el
  primer proyecto que estrene boi.
- **`boi.test.js`** — la lógica del escáner con un doble de DOM mínimo (sin
  navegador). El comportamiento real en un navegador se prueba E2E con Chromium
  headless desde cada proyecto (directiva 28) — no cabe aquí.

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
