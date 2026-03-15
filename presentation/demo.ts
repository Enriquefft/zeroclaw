#!/usr/bin/env bun
// OpenClaw - Form Intelligence Demo
// Fundacion Botin - XVII Programa Fortalecimiento Funcion Publica
// Self-contained mock for presentation. Zero dependencies beyond Bun.

const R = "\x1b[0m", B = "\x1b[1m", D = "\x1b[2m";
const GRN = "\x1b[32m", CYN = "\x1b[36m";
const BGRN = "\x1b[1;32m", BYLW = "\x1b[1;33m", BRED = "\x1b[1;31m";
const BW = "\x1b[1;37m", BC = "\x1b[1;36m";

const CHK = "\u2714", HALF = "\u25D1", CIRC = "\u25CB";
const DOT = "\u00B7", BLK = "\u2588", LIT = "\u2591";
const TL = "\u2554", TR = "\u2557", BL = "\u255A", BR = "\u255D";
const HZ = "\u2550", VT = "\u2551", SL = "\u255F", SR = "\u2562", SH = "\u2500";

const W = 76;

const SECS: [string, string, number][] = [
  ["1.1", "Datos Personales", 20],
  ["1.2", "Otros Datos", 25],
  ["2.1", "Universidad", 21],
  ["2.2", "Estudios de Grado", 18],
  ["2.3", "Otra Formaci\u00F3n", 7],
  ["2.4", "Idiomas", 5],
  ["3.1", "Pr\u00E1cticas Universitarias", 12],
  ["3.2", "Experiencia Profesional", 12],
  ["3.3", "Iniciativas Sociales", 12],
  ["3.4", "Organizaciones", 3],
  ["3.5", "Otros Programas o Becas", 8],
  ["4.1", "Acci\u00F3n de Impacto", 13],
  ["4.2", "Informaci\u00F3n Cualitativa I", 9],
  ["4.3", "Informaci\u00F3n Cualitativa II", 12],
  ["5.0", "Documentaci\u00F3n", 12],
];

const BKTS = [
  {
    sym: CHK, clr: BGRN, label: "100% Automatizable",
    n: 91, pct: 60,
    ex: [
      "Nombre, apellidos, fecha de nacimiento",
      "Nacionalidad, pasaporte, DNI",
      "Universidad, facultad, nota media",
      "Idiomas y niveles certificados",
      "Organizaciones, becas, fechas",
    ],
  },
  {
    sym: HALF, clr: BYLW, label: "Semi-automatizable",
    n: 49, pct: 32,
    ex: [
      "Motivaci\u00F3n para participar en el programa",
      "Ensayos: liderazgo, \u00E9tica, polarizaci\u00F3n",
      "Descripciones de experiencia profesional",
      "Reflexiones sobre pel\u00EDculas y libros",
    ],
  },
  {
    sym: CIRC, clr: BRED, label: "No automatizable",
    n: 12, pct: 8,
    ex: [
      "Video YouTube (grabar y subir)",
      "Carta del rector, declaraci\u00F3n jurada",
      "Desaf\u00EDo proactividad (3 inscripciones)",
    ],
  },
];

const wait = (ms: number) => Bun.sleep(ms);
const vis = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const p = (s = "") => console.log(s);

function bxT() { p(`  ${CYN}${TL}${HZ.repeat(W)}${TR}${R}`); }
function bxB() { p(`  ${CYN}${BL}${HZ.repeat(W)}${BR}${R}`); }
function bxS() { p(`  ${CYN}${SL}${SH.repeat(W)}${SR}${R}`); }

function bxR(c = "") {
  const pad = Math.max(0, W - vis(c).length);
  p(`  ${CYN}${VT}${R}${c}${" ".repeat(pad)}${CYN}${VT}${R}`);
}

function dots(lbl: string, val: string, w = 72) {
  const gap = w - vis(lbl).length - vis(val).length - 2;
  if (gap < 3) return `${lbl} ${val}`;
  return `${lbl} ${D}${DOT.repeat(gap)}${R} ${val}`;
}

function bar(pct: number, w: number, clr: string) {
  const f = Math.round((pct / 100) * w);
  return `${clr}${BLK.repeat(f)}${D}${LIT.repeat(w - f)}${R}`;
}

async function header() {
  p();
  bxT();
  bxR();
  bxR(`   ${BW}OpenClaw${R}`);
  bxR(`   ${CYN}Form Intelligence Engine${R}`);
  bxR();
  bxB();
  p();
  p(`  ${D}Target:${R} ${BW}Programa Fortalecimiento de la Funci\u00F3n P\u00FAblica${R}`);
  p(`  ${D}Org:${R}    ${BW}Fundaci\u00F3n Bot\u00EDn${R}`);
  p(`  ${D}URL:${R}    ${CYN}becas.fundacionbotin.org${R}`);
  p();
  await wait(3500);
}

async function phase1() {
  p(`  ${BC}\u2500\u2500 Phase 1: Conectando \u2500\u2500${R}`);
  p();
  await wait(1000);
  p(`  Navegando a ${CYN}becas.fundacionbotin.org${R}...`);
  await wait(1500);
  p(`  Detectando autenticaci\u00F3n...`);
  await wait(1200);
  p(`  Credenciales encontradas en vault`);
  await wait(1000);
  p(`  ${BGRN}Sesi\u00F3n establecida${R}                                   ${GRN}${CHK}${R}`);
  p();
  await wait(1500);
}

async function phase2() {
  p(`  ${BC}\u2500\u2500 Phase 2: Extrayendo preguntas \u2500\u2500${R}`);
  p();
  await wait(600);
  let total = 0;
  for (const [id, name, count] of SECS) {
    total += count;
    p(dots(
      `  ${D}[${id}]${R}  ${name}`,
      `${BW}${String(count).padStart(3)}${R} campos`,
    ));
    await wait(600);
  }
  p();
  p(`  ${BGRN}Total: ${SECS.length} secciones \u2014 ${total} campos extra\u00EDdos${R}           ${GRN}${CHK}${R}`);
  p();
  await wait(1500);
}

async function phase3() {
  p(`  ${BC}\u2500\u2500 Phase 3: Clasificando campos \u2500\u2500${R}`);
  p();
  await wait(600);
  p(`  Analizando tipos de campo...`);
  await wait(2000);
  p(`  Cruzando con perfil del postulante...`);
  await wait(2000);
  p(`  ${BGRN}Clasificaci\u00F3n completa${R}                               ${GRN}${CHK}${R}`);
  p();
  await wait(1500);

  bxT();
  bxR(`  ${BW}RESULTADOS DE CLASIFICACI\u00D3N${R}`);
  bxS();
  await wait(500);

  for (const bk of BKTS) {
    bxR();
    const lp = Math.max(0, 18 - bk.label.length);
    const left = `  ${bk.clr}${bk.sym}${R}  ${B}${bk.label}${R}${" ".repeat(lp)}`;
    const right = `${BW}${String(bk.n).padStart(3)}${R} campos  ${D}(${String(bk.pct).padStart(2)}%)${R}`;
    const gap = W - vis(left).length - vis(right).length - 2;
    bxR(`${left}${" ".repeat(Math.max(1, gap))}${right}`);
    bxR(`     ${bar(bk.pct, 40, bk.clr)}`);
    for (const ex of bk.ex) bxR(`     ${D}${ex}${R}`);
    await wait(1000);
  }

  bxR();
  bxB();
}

async function main() {
  await header();
  await phase1();
  await phase2();
  await phase3();
  p();
  p(`  ${BW}OpenClaw${R} ${D}\u2014 Postulaciones inteligentes${R}`);
  p();
}

main();
