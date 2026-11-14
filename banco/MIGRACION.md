<!-- SPDX-License-Identifier: MIT -->
# Migración del arnés de `boi` de node a Rust

**Motivo (D38, con fecha):** node no está instalado en la máquina desde el
reinstalar, así que el arnés está MUERTO —`verde_local.py boi` no puede dar
verde— y el banco no se ha podido correr. No es migrar lo vivo por decreto: es el
gatillo que la D38 pide (un fallo, un banco que se rompe). De paso mejora la
fidelidad (D28): las pruebas de lógica dejan el doble de DOM —que mide el códec—
y pasan al DOM real del navegador.

**Principio que NO cambia:** cero dependencias. El banco node era `node:http` +
`node:child_process` de la biblioteca estándar y nada más. El arnés Rust es
**std puro, sin un solo crate** — el servidor HTTP de loopback y el lanzador de
Chromium se escriben a mano. Chromium es un proceso externo aislado (mismo patrón
que `mirador`→`yt-dlp`, `nexus`→`nuclei`).

**Qué se queda en el navegador (JS, sin tocar):** las páginas `pagina*.html`,
`conductor*.js`, `contar.js`, `boi.js`, `comportamientos/*.js`. Corren en
Chromium; ese es el motor JS que el stack ya acepta.

**Qué se porta a Rust:** `servidor.js` → `src/servidor.rs`; `navegador.js` →
`src/navegador.rs`; las afirmaciones y la mutación del artefacto de
`navegador.test.js` → `tests/banco.rs` (`cargo test`).

## Fases

- [x] **F0 — scaffold + caso verde E2E.** `Cargo.toml` std-only, servidor
  HTTP loopback con mutación de artefacto + informe con nonce, lanzador de
  Chromium (grupo de procesos, perfil de usar y tirar), y EL CASO VERDE
  corriendo end-to-end con su primer mutante. Prueba que la arquitectura Rust
  funciona.
- [x] **F1 — portar los 8 casos del banco** (5 mutantes): idempotencia,
  rastro-que-miente, carga tardía, y los dos del botón premarcado de
  confirmar-doble. En `tests/banco.rs`; cada mutante valida su aguja contra el
  ARTEFACTO (D33). **8/8 verde, 4 s.**
- [x] **F2 — subir las pruebas de LÓGICA al navegador.** Las `*.test.js`
  (65 pruebas) se importan SIN TOCARLAS dentro de un **Web Worker** de Chromium
  —ámbito sin `document`, como node—, con `node:test`/`node:assert` reescritos a
  shims del arnés (`arnes/test.js`, `arnes/assert.js`) al servirlos. Corredor en
  `tests/logica.rs`, un archivo por carga. **65/65 verde; discriminación del
  arnés probada con señuelo (2 pasan / 2 fallan).**
- [x] **F3 — quitar node del repo.** Borrados `servidor.js`, `navegador.js`,
  `navegador.test.js` (los `*.test.js`, conductores y páginas se quedan: corren
  en el navegador). Actualizados `README.md`, `CLAUDE.md`, `ci.yml`
  (`run: cargo test --manifest-path banco/Cargo.toml`, verificado con
  `verde_local.py boi` → VERDE) y la fila de `boi` en `MAPA.md` (D24).

## Estado

**TERMINADA.** Node ya no interviene en boi: ni en el producto ni en las pruebas.
`cargo test --manifest-path banco/Cargo.toml` = 3 unit (JSON) + 8 E2E + 65 de
lógica, ~15 s. `verde_local.py boi` en verde con el comando nuevo.
