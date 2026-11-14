// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 Juan Carlos Isaza
//
// Un parser de JSON mínimo, `std` puro — para leer el informe que el conductor
// manda desde el navegador sin traer `serde`. No pretende ser completo ni veloz:
// entiende lo que `JSON.stringify` produce (objetos, listas, cadenas con escapes
// básicos, números, `true`/`false`/`null`), que es lo único que este banco
// recibe. Un informe mal formado se DICE con error, no se rellena (directiva 20).

use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Valor {
    Nulo,
    Bool(bool),
    Num(f64),
    Txt(String),
    Lista(Vec<Valor>),
    Obj(HashMap<String, Valor>),
}

impl Valor {
    pub fn bool(&self) -> Option<bool> {
        match self {
            Valor::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn num(&self) -> Option<f64> {
        match self {
            Valor::Num(n) => Some(*n),
            _ => None,
        }
    }
    pub fn txt(&self) -> Option<&str> {
        match self {
            Valor::Txt(s) => Some(s),
            _ => None,
        }
    }
    pub fn es_nulo(&self) -> bool {
        matches!(self, Valor::Nulo)
    }
    pub fn get(&self, clave: &str) -> Option<&Valor> {
        match self {
            Valor::Obj(m) => m.get(clave),
            _ => None,
        }
    }
    pub fn lista(&self) -> Option<&[Valor]> {
        match self {
            Valor::Lista(v) => Some(v),
            _ => None,
        }
    }
}

pub fn parsear(texto: &str) -> Result<Valor, String> {
    let bytes: Vec<char> = texto.chars().collect();
    let mut p = Analizador { bytes, i: 0 };
    p.saltar_blanco();
    let v = p.valor()?;
    p.saltar_blanco();
    if p.i != p.bytes.len() {
        return Err(format!("sobra texto tras el JSON en la posición {}", p.i));
    }
    Ok(v)
}

struct Analizador {
    bytes: Vec<char>,
    i: usize,
}

impl Analizador {
    fn mirar(&self) -> Option<char> {
        self.bytes.get(self.i).copied()
    }
    fn saltar_blanco(&mut self) {
        while let Some(c) = self.mirar() {
            if c.is_whitespace() {
                self.i += 1;
            } else {
                break;
            }
        }
    }
    fn valor(&mut self) -> Result<Valor, String> {
        self.saltar_blanco();
        match self.mirar() {
            Some('{') => self.objeto(),
            Some('[') => self.lista(),
            Some('"') => Ok(Valor::Txt(self.cadena()?)),
            Some('t') | Some('f') => self.booleano(),
            Some('n') => self.nulo(),
            Some(c) if c == '-' || c.is_ascii_digit() => self.numero(),
            otro => Err(format!("token inesperado {otro:?} en la posición {}", self.i)),
        }
    }
    fn objeto(&mut self) -> Result<Valor, String> {
        self.i += 1; // {
        let mut m = HashMap::new();
        self.saltar_blanco();
        if self.mirar() == Some('}') {
            self.i += 1;
            return Ok(Valor::Obj(m));
        }
        loop {
            self.saltar_blanco();
            let clave = self.cadena()?;
            self.saltar_blanco();
            if self.mirar() != Some(':') {
                return Err(format!("falta ':' tras la clave «{clave}»"));
            }
            self.i += 1;
            let v = self.valor()?;
            m.insert(clave, v);
            self.saltar_blanco();
            match self.mirar() {
                Some(',') => {
                    self.i += 1;
                }
                Some('}') => {
                    self.i += 1;
                    break;
                }
                otro => return Err(format!("esperaba ',' o '}}', llegó {otro:?}")),
            }
        }
        Ok(Valor::Obj(m))
    }
    fn lista(&mut self) -> Result<Valor, String> {
        self.i += 1; // [
        let mut v = Vec::new();
        self.saltar_blanco();
        if self.mirar() == Some(']') {
            self.i += 1;
            return Ok(Valor::Lista(v));
        }
        loop {
            let e = self.valor()?;
            v.push(e);
            self.saltar_blanco();
            match self.mirar() {
                Some(',') => {
                    self.i += 1;
                }
                Some(']') => {
                    self.i += 1;
                    break;
                }
                otro => return Err(format!("esperaba ',' o ']', llegó {otro:?}")),
            }
        }
        Ok(Valor::Lista(v))
    }
    fn cadena(&mut self) -> Result<String, String> {
        if self.mirar() != Some('"') {
            return Err(format!("esperaba '\"' en la posición {}", self.i));
        }
        self.i += 1;
        let mut s = String::new();
        loop {
            match self.mirar() {
                None => return Err("cadena sin cerrar".into()),
                Some('"') => {
                    self.i += 1;
                    break;
                }
                Some('\\') => {
                    self.i += 1;
                    match self.mirar() {
                        Some('"') => s.push('"'),
                        Some('\\') => s.push('\\'),
                        Some('/') => s.push('/'),
                        Some('n') => s.push('\n'),
                        Some('t') => s.push('\t'),
                        Some('r') => s.push('\r'),
                        Some('b') => s.push('\u{0008}'),
                        Some('f') => s.push('\u{000C}'),
                        Some('u') => {
                            let mut code = 0u32;
                            for _ in 0..4 {
                                self.i += 1;
                                let d = self
                                    .mirar()
                                    .and_then(|c| c.to_digit(16))
                                    .ok_or("escape \\u incompleto")?;
                                code = code * 16 + d;
                            }
                            s.push(char::from_u32(code).unwrap_or('\u{FFFD}'));
                        }
                        otro => return Err(format!("escape desconocido \\{otro:?}")),
                    }
                    self.i += 1;
                }
                Some(c) => {
                    s.push(c);
                    self.i += 1;
                }
            }
        }
        Ok(s)
    }
    fn booleano(&mut self) -> Result<Valor, String> {
        if self.resto_empieza_con("true") {
            self.i += 4;
            Ok(Valor::Bool(true))
        } else if self.resto_empieza_con("false") {
            self.i += 5;
            Ok(Valor::Bool(false))
        } else {
            Err(format!("booleano mal formado en la posición {}", self.i))
        }
    }
    fn nulo(&mut self) -> Result<Valor, String> {
        if self.resto_empieza_con("null") {
            self.i += 4;
            Ok(Valor::Nulo)
        } else {
            Err(format!("esperaba 'null' en la posición {}", self.i))
        }
    }
    fn numero(&mut self) -> Result<Valor, String> {
        let inicio = self.i;
        if self.mirar() == Some('-') {
            self.i += 1;
        }
        while let Some(c) = self.mirar() {
            if c.is_ascii_digit() || c == '.' || c == 'e' || c == 'E' || c == '+' || c == '-' {
                self.i += 1;
            } else {
                break;
            }
        }
        let s: String = self.bytes[inicio..self.i].iter().collect();
        s.parse::<f64>()
            .map(Valor::Num)
            .map_err(|_| format!("número mal formado «{s}»"))
    }
    fn resto_empieza_con(&self, lit: &str) -> bool {
        self.bytes[self.i..]
            .iter()
            .take(lit.len())
            .collect::<String>()
            == lit
    }
}

#[cfg(test)]
mod prueba {
    use super::*;

    #[test]
    fn objeto_plano_como_el_de_json_stringify() {
        let v = parsear(r#"{"fallos":[],"marcaDeBoi":"listo","hayNucleo":true,"trasCargar":1,"nada":null}"#)
            .unwrap();
        assert_eq!(v.get("marcaDeBoi").unwrap().txt(), Some("listo"));
        assert_eq!(v.get("hayNucleo").unwrap().bool(), Some(true));
        assert_eq!(v.get("trasCargar").unwrap().num(), Some(1.0));
        assert!(v.get("nada").unwrap().es_nulo());
        assert_eq!(v.get("fallos").unwrap().lista().unwrap().len(), 0);
    }

    #[test]
    fn lista_de_cadenas_con_escapes() {
        let v = parsear(r#"{"fallos":["conductor: x","y\n"]}"#).unwrap();
        let l = v.get("fallos").unwrap().lista().unwrap();
        assert_eq!(l.len(), 2);
        assert_eq!(l[0].txt(), Some("conductor: x"));
        assert_eq!(l[1].txt(), Some("y\n"));
    }

    #[test]
    fn un_informe_mal_formado_falla_ruidoso() {
        assert!(parsear(r#"{"a":}"#).is_err());
        assert!(parsear(r#"{"a":1"#).is_err());
        assert!(parsear("basura").is_err());
    }
}
