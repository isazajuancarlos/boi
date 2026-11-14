// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// boi, DIBUJADO en un navegador de verdad — ahora orquestado por Rust en vez de
// node. Se arranca el servidor de `std::net`, un Chromium headless y htmx de
// verdad, se hace un intercambio parcial de verdad, y la página informa desde
// dentro (`conductor.js`, que sigue corriendo en el navegador).
//
// Cada caso verde viene con su mutante (directiva 33): se rompe la salvaguarda EN
// `boi.js` —el código medido, no el arnés— y se exige que la observación cambie.
// La aguja se valida contra el ARTEFACTO al construir la mutación (`mutar`): si no
// aparece exactamente una vez, la prueba se cae ahí en vez de dar por bueno un
// control que no existió.
//
// F0 de la migración (ver banco/MIGRACION.md): el CASO VERDE y su primer mutante,
// para probar que la arquitectura Rust mide de verdad. Los otros siete casos
// llegan en F1.

use banco_boi::{correr, correr_con, mutar, sin_mutar};

#[test]
fn caso_verde_boi_carga_engancha_y_lo_que_trae_htmx_llega_vivo() {
    let o = correr(sin_mutar, sin_mutar, "pagina.html");

    assert_eq!(o.fallos(), Vec::<String>::new(), "la página no debe soltar ningún error");
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el rastro del núcleo en el DOM");
    assert_eq!(o.bool("hayNucleo"), Some(true), "globalThis.boi publicado");

    assert_eq!(o.bool("inicialContado"), Some(true), "el escaneo de la carga inicial");
    assert_eq!(o.num("trasCargar"), Some(1.0), "una sola inicialización al cargar");

    assert_eq!(o.bool("intercambioAsentado"), Some(true), "htmx completó el intercambio");
    assert_eq!(o.bool("fragmentoLlego"), Some(true), "el fragmento se insertó");
    assert_eq!(
        o.bool("fragmentoContado"),
        Some(true),
        "LA PROMESA: el fragmento llegó con su comportamiento"
    );
    assert_eq!(o.num("trasIntercambio"), Some(2.0), "una inicialización más, la del fragmento");
    assert_eq!(o.num("trasReescanear"), Some(2.0), "re-escanear el mismo subárbol no reinicializa");
}

#[test]
fn mutante_sin_el_enganche_a_htmx_load_el_fragmento_llega_muerto() {
    let o = correr(
        mutar(
            r#"doc.addEventListener("htmx:load""#,
            r#"doc.removeEventListener("htmx:load""#,
        ),
        sin_mutar,
        "pagina.html",
    );

    // Positivo de control: el mutante SIGUE cargando. Si esto fallara, el rojo de
    // abajo se explicaría por un módulo roto y no por el enganche que falta.
    assert_eq!(
        o.txt("marcaDeBoi").as_deref(),
        Some("listo"),
        "el mutante compiló y corrió: solo perdió el enganche"
    );
    assert_eq!(o.bool("inicialContado"), Some(true), "la carga inicial sigue funcionando");
    assert_eq!(o.bool("fragmentoLlego"), Some(true), "htmx insertó el fragmento igual");

    assert_eq!(
        o.bool("fragmentoContado"),
        Some(false),
        "sin htmx:load el fragmento tiene que llegar MUERTO — si aquí sale vivo, el caso verde no mide nada"
    );
}

// ── F1: idempotencia ─────────────────────────────────────────────────────────

#[test]
fn mutante_sin_la_marca_reescanear_reinicializa() {
    let o = correr(
        mutar(r#"el.setAttribute(marca(c.nombre), "");"#, "/* la marca, retirada */"),
        sin_mutar,
        "pagina.html",
    );

    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante compiló y corrió");
    assert_eq!(o.bool("fragmentoContado"), Some(true), "y sigue enganchando lo que llega");

    let tras_intercambio = o.num("trasIntercambio").unwrap();
    let tras_reescanear = o.num("trasReescanear").unwrap();
    assert!(
        tras_reescanear > tras_intercambio,
        "sin la marca, re-escanear TIENE que reinicializar ({tras_intercambio} → {tras_reescanear}). \
         Si no sube, la idempotencia del caso verde es decorativa"
    );
}

// ── F1: el rastro que MIENTE — boi que ni carga ──────────────────────────────

#[test]
fn mutante_del_rastro_boi_que_ni_carga() {
    let o = correr(
        mutar(
            "export const comportamientos = [];",
            "export const comportamientos = [];\nthrow new Error(\"mutante: boi no carga\");",
        ),
        sin_mutar,
        "pagina.html",
    );

    assert!(o.es_nulo("marcaDeBoi"), "sin boi no puede haber rastro");
    assert_eq!(o.bool("hayNucleo"), Some(false), "ni núcleo publicado");
    assert_eq!(o.bool("inicialContado"), Some(false), "ni escaneo inicial");
    assert_eq!(o.bool("fragmentoContado"), Some(false), "ni comportamiento en lo que trae htmx");

    // Positivo de control de que la MEDICIÓN ocurrió: htmx es ajeno a boi y siguió
    // trabajando. Si esto también saliera falso, el informe estaría vacío por otra
    // causa y los cuatro de arriba no dirían nada.
    assert_eq!(o.bool("fragmentoLlego"), Some(true), "htmx insertó el fragmento igual");
}

// ── F1: carga tardía ─────────────────────────────────────────────────────────

#[test]
fn carga_tardia_boi_con_el_documento_ya_analizado_escanea_igual() {
    let o = correr(sin_mutar, sin_mutar, "pagina-tardia.html");

    assert_eq!(o.fallos(), Vec::<String>::new(), "la página no debe soltar ningún error");
    assert_eq!(o.bool("documentoYaAnalizado"), Some(true), "el control: el documento YA estaba analizado");
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "boi se enganchó");
    assert_eq!(o.bool("inicialContado"), Some(true), "y aplicó el comportamiento pese a llegar tarde");
    assert_eq!(o.num("trasCargar"), Some(1.0), "una sola vez");
}

#[test]
fn mutante_de_la_carga_tardia_el_rastro_que_miente() {
    let o = correr(
        mutar("documentoEnganchado = doc;", "documentoEnganchado = null;"),
        sin_mutar,
        "pagina-tardia.html",
    );

    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante carga y deja el rastro igual");
    assert_eq!(
        o.bool("inicialContado"),
        Some(false),
        "sin el arreglo el comportamiento NO se aplica — si aquí saliera vivo, el caso verde no mide nada"
    );
}

// ── F1: la barrera de confirmar-doble no depende del escáner ─────────────────

#[test]
fn un_boton_de_confirmacion_premarcado_sigue_protegido() {
    let o = correr(sin_mutar, sin_mutar, "pagina-premarcada.html");

    assert_eq!(o.fallos(), Vec::<String>::new());
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"));
    assert_eq!(o.bool("llegaMarcado"), Some(true), "el control: el botón tenía que llegar premarcado");

    assert_eq!(o.acciones_en_el_servidor, 0, "LA ACCIÓN IRREVERSIBLE SALIÓ A LA PRIMERA PULSACIÓN");
    assert_eq!(o.bool("quedoArmado"), Some(true), "el botón se armó en vez de disparar");
    assert_eq!(o.txt("textoDespues").as_deref(), Some("¿Seguro? Pulse otra vez"));
}

#[test]
fn mutante_sin_el_enganche_al_cargar_el_premarcado_queda_a_pelo() {
    let o = correr(
        sin_mutar,
        mutar(
            r#"if (typeof document !== "undefined") engancharDocumento(document);"#,
            "/* el enganche al cargar, retirado */",
        ),
        "pagina-premarcada.html",
    );

    // Positivo de control: el módulo cargó igual y boi se enganchó.
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante compiló y corrió");
    assert_eq!(o.bool("llegaMarcado"), Some(true));

    assert_eq!(
        o.acciones_en_el_servidor, 1,
        "sin el enganche, la acción TIENE que salir a la primera — si no, el caso verde no mide nada"
    );
    assert_eq!(o.bool("quedoArmado"), Some(false));
}

// ── R8: esqueleto — la técnica structure-aware, en un navegador de verdad ─────
//
// El doble de DOM no puede medir esto: `getBoundingClientRect` es maquetación, y
// la promesa de esqueleto es que el shimmer copia la FORMA REAL del contenido.

#[test]
fn esqueleto_dibuja_la_forma_medida_mientras_htmx_carga_y_la_retira_al_terminar() {
    let o = correr(sin_mutar, sin_mutar, "pagina-esqueleto.html");

    assert_eq!(o.fallos(), Vec::<String>::new(), "la página no debe soltar errores");
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el núcleo se enganchó");
    assert!(o.num("hojasEsperadas").unwrap() >= 3.0, "el panel tiene varias hojas medibles");

    assert_eq!(o.bool("capaEnVuelo"), Some(true), "la capa de shimmer apareció durante la petición");
    assert_eq!(o.bool("activoEnVuelo"), Some(true), "el panel quedó marcado activo");
    assert!(o.num("numBloques").unwrap() >= 3.0, "un bloque por hoja medida");
    assert_eq!(
        o.bool("bloquesCoinciden"),
        Some(true),
        "LA TÉCNICA: cada bloque cae sobre una hoja real del panel (se MIDIÓ, no se inventó)"
    );

    assert_eq!(o.bool("fragmentoLlego"), Some(true), "htmx completó el intercambio");
    assert_eq!(o.bool("capaTrasTerminar"), Some(false), "la capa se retiró al terminar");
    assert_eq!(o.bool("activoTrasTerminar"), Some(false), "y el panel dejó de estar activo");
}

#[test]
fn mutante_esqueleto_con_los_bloques_en_y_cero_no_casan_la_forma_real() {
    // Todos los bloques a y=0: siguen apareciendo, pero YA NO copian la forma
    // (las hojas están apiladas en distintas alturas). Es el mutante que rompe
    // justo lo distintivo —la medición— por la vía real (directiva 33).
    let o = correr_con(
        sin_mutar,
        mutar(r#"bloque.style.top = m.y + "px";"#, r#"bloque.style.top = "0px";"#),
        "comportamientos/esqueleto.js",
        "pagina-esqueleto.html",
    );

    // Positivo de control: el esqueleto SIGUE mostrándose, solo mal colocado.
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante compiló y corrió");
    assert_eq!(o.bool("capaEnVuelo"), Some(true), "la capa aparece igual");
    assert!(o.num("numBloques").unwrap() >= 3.0, "y con sus bloques");

    assert_eq!(
        o.bool("bloquesCoinciden"),
        Some(false),
        "con todos los bloques en y=0 la forma NO casa — si aquí saliera true, el verde no medía la medición"
    );
}

#[test]
fn mutante_esqueleto_sin_cierre_la_capa_se_queda_pegada() {
    // Sin el oyente de cierre, la capa no se retira al terminar la petición: el
    // shimmer se queda tapando el contenido para siempre.
    let o = correr_con(
        sin_mutar,
        mutar(
            r#"contenedor.addEventListener("htmx:afterRequest""#,
            r#"contenedor.removeEventListener("htmx:afterRequest""#,
        ),
        "comportamientos/esqueleto.js",
        "pagina-esqueleto.html",
    );

    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante compiló y corrió");
    assert_eq!(o.bool("capaEnVuelo"), Some(true), "positivo de control: la capa sí se mostró");
    assert_eq!(
        o.bool("capaTrasTerminar"),
        Some(true),
        "sin el cierre, la capa TIENE que quedarse — si aquí sale false, el verde no mide el cierre"
    );
}

// ── R8: expandir — clic real reenviado, y la rama de selección de texto ───────

#[test]
fn expandir_reenvia_el_clic_de_la_fila_al_enlace_interno() {
    let o = correr(sin_mutar, sin_mutar, "pagina-expandir.html");

    assert_eq!(o.fallos(), Vec::<String>::new(), "la página no debe soltar errores");
    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el núcleo se enganchó");

    assert_eq!(
        o.bool("zonaDispara"),
        Some(true),
        "un clic en la zona muerta reenvía al enlace y htmx trae el fragmento"
    );
    assert_eq!(
        o.bool("conSeleccionDispara"),
        Some(false),
        "con texto seleccionado, el mismo clic NO navega (rama que el Worker no puede medir)"
    );
    assert_eq!(
        o.bool("propioDisparaEnlace"),
        Some(false),
        "un clic en el botón propio no dispara el enlace de la fila"
    );
    assert_eq!(
        o.acciones_en_el_servidor, 1,
        "pero el botón propio SÍ hizo su propia acción: el clic aterrizó, no se lo comió expandir"
    );
}

#[test]
fn mutante_expandir_neutralizado_no_reenvia_el_clic() {
    let o = correr_con(
        sin_mutar,
        mutar("return d || null;", "return null;"),
        "comportamientos/expandir.js",
        "pagina-expandir.html",
    );

    assert_eq!(o.txt("marcaDeBoi").as_deref(), Some("listo"), "el mutante compiló y corrió");
    assert_eq!(
        o.bool("zonaDispara"),
        Some(false),
        "sin reenvío, el clic en la zona muerta NO trae fragmento — si aquí sale true, el verde no mide nada"
    );
    assert_eq!(
        o.acciones_en_el_servidor, 1,
        "positivo de control: el botón propio actúa igual, ajeno a expandir"
    );
}
