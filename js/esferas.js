// Dibujo de esferas de FacuWatch en SVG (viewBox 200×200, pantalla redonda).
// Diseños propios: inspirados en distintas estéticas, sin copiar esferas,
// marcas ni tipografías con licencia restringida.
"use strict";

const SANS = `font-family="Inter, -apple-system, system-ui, sans-serif"`;
const MONO = `font-family="'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace"`;
const SERIF = `font-family="'Cormorant Garamond', Georgia, 'Times New Roman', serif"`;
const ROMANOS = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

let _uid = 0;
const uid = (p) => `${p}${++_uid}`;

/** Punto a `r` del centro, con 0° arriba y sentido horario. */
function pol(r, grados, cx = 100, cy = 100) {
  const a = (grados * Math.PI) / 180;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
}
const f = (n) => Math.round(n * 100) / 100;

function marcas(n, r1, r2, color, ancho, filtro = () => true) {
  let s = "";
  for (let i = 0; i < n; i++) {
    if (!filtro(i)) continue;
    const [x1, y1] = pol(r1, (360 / n) * i), [x2, y2] = pol(r2, (360 / n) * i);
    s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${ancho}" stroke-linecap="round"/>`;
  }
  return s;
}

function bastonAguja(grados, largo, ancho, color, cola = 10) {
  const [x1, y1] = pol(-cola, grados), [x2, y2] = pol(largo, grados);
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${ancho}" stroke-linecap="round"/>`;
}

/** Aguja "dauphine": rombo alargado facetado (dos mitades con distinto tono). */
function dauphine(grados, largo, ancho, color, sombra) {
  const p = pol(largo, grados), b = pol(-8, grados);
  const L = pol(ancho, grados - 90), R = pol(ancho, grados + 90);
  return `<polygon points="${f(p[0])},${f(p[1])} ${f(L[0])},${f(L[1])} ${f(b[0])},${f(b[1])}" fill="${color}"/>
    <polygon points="${f(p[0])},${f(p[1])} ${f(R[0])},${f(R[1])} ${f(b[0])},${f(b[1])}" fill="${sombra}"/>`;
}

function angulos(d) {
  const h = d.getHours() % 12, m = d.getMinutes(), s = d.getSeconds();
  return { h: (h + m / 60) * 30, m: (m + s / 60) * 6, s: s * 6 };
}
const dos = (n) => String(n).padStart(2, "0");
function textos(d) {
  return {
    hh: dos(d.getHours()), mm: dos(d.getMinutes()),
    dia: d.toLocaleDateString("es-AR", { weekday: "short" }).replace(".", "").toUpperCase(),
    num: d.getDate(),
    mes: d.toLocaleDateString("es-AR", { month: "short" }).replace(".", "").toUpperCase(),
  };
}

/* ------------------------------------------------------------------ */
/* Cada estilo recibe (tema, acento, datos, d, conHora) y devuelve SVG  */
/* ------------------------------------------------------------------ */

const ESTILOS = {
  // ---------- MINIMALISTAS ----------
  digital(t, a, x, d, hora) {
    const k = textos(d);
    return `<text x="100" y="64" ${SANS} font-size="12" font-weight="600" fill="${a}" text-anchor="middle" letter-spacing="2">${k.dia} ${k.num}</text>
      ${hora ? `<text x="100" y="122" ${SANS} font-size="58" font-weight="800" fill="${t.texto}" text-anchor="middle" letter-spacing="-2">${k.hh}:${k.mm}</text>` : ""}
      <rect x="86" y="146" width="28" height="9" rx="3" fill="none" stroke="${t.secundario}" stroke-width="1.2"/>
      <rect x="88" y="148" width="${f(24 * (x.bateria ?? 70) / 100)}" height="5" rx="1.5" fill="${a}"/>`;
  },

  mono(t, a, x, d, hora) {
    const k = textos(d);
    return `<text x="100" y="52" ${SANS} font-size="10" font-weight="600" fill="${t.secundario}" text-anchor="middle" letter-spacing="3">${k.dia} · ${k.num} ${k.mes}</text>
      ${hora ? `<text x="100" y="112" ${SANS} font-size="66" font-weight="800" fill="${t.texto}" text-anchor="middle" letter-spacing="-3">${k.hh}</text>
      <text x="100" y="168" ${SANS} font-size="66" font-weight="300" fill="${a}" text-anchor="middle" letter-spacing="-3">${k.mm}</text>` : ""}`;
  },

  punto(t, a, x, d, hora) {
    const g = angulos(d), k = textos(d);
    const [px, py] = pol(78, g.h);
    return `<circle cx="100" cy="100" r="78" fill="none" stroke="${t.terciario}" stroke-width="1.5"/>
      ${marcas(12, 78, 78, t.secundario, 3, () => true)}
      ${hora ? `<circle cx="${f(px)}" cy="${f(py)}" r="9" fill="${a}"/>
      <text x="100" y="116" ${SANS} font-size="46" font-weight="300" fill="${t.texto}" text-anchor="middle" letter-spacing="-1">${k.mm}</text>
      <text x="100" y="134" ${SANS} font-size="9" font-weight="600" fill="${t.secundario}" text-anchor="middle" letter-spacing="2">MIN</text>` : ""}`;
  },

  analogico(t, a, x, d, hora) {
    const g = angulos(d);
    return marcas(60, 90, 85, t.terciario, 1, (i) => i % 5)
      + marcas(12, 90, 76, t.secundario, 3)
      + `<text x="140" y="104" ${SANS} font-size="11" font-weight="700" fill="${a}" text-anchor="middle">${d.getDate()}</text>`
      + (hora ? bastonAguja(g.h, 46, 5, t.texto) + bastonAguja(g.m, 68, 3.5, t.texto)
        + bastonAguja(g.s, 76, 1.4, a, 16) + `<circle cx="100" cy="100" r="4" fill="${a}"/>` : "");
  },

  noche(t, a, x, d, hora) {
    const g = angulos(d), k = textos(d);
    return marcas(12, 86, 78, a, 2.5)
      + `<text x="100" y="142" ${SANS} font-size="10" font-weight="600" fill="${a}" text-anchor="middle" opacity=".75" letter-spacing="2">${k.dia} ${k.num}</text>`
      + (hora ? bastonAguja(g.h, 44, 5, a) + bastonAguja(g.m, 66, 3.5, a) + `<circle cx="100" cy="100" r="4" fill="${a}"/>` : "");
  },

  modular(t, a, x, d, hora) {
    const k = textos(d);
    const celda = (cx, cy, etq, val, c) => `<rect x="${cx}" y="${cy}" width="62" height="50" rx="12" fill="${t.superficie || "#1c1c1e"}"/>
      <text x="${cx + 9}" y="${cy + 17}" ${SANS} font-size="8" font-weight="700" fill="${t.secundario}" letter-spacing="1">${etq}</text>
      <text x="${cx + 9}" y="${cy + 39}" ${SANS} font-size="17" font-weight="800" fill="${c}">${val}</text>`;
    const pasos = x.pasos != null ? (x.pasos >= 1000 ? `${(x.pasos / 1000).toFixed(1)}k` : x.pasos) : "—";
    return (hora ? celda(36, 46, "HORA", `${k.hh}:${k.mm}`, t.texto) : celda(36, 46, "HORA", "", t.texto))
      + celda(102, 46, "FECHA", k.num, a) + celda(36, 104, "PASOS", pasos, a)
      + celda(102, 104, "PULSO", x.bpm ?? "—", t.texto);
  },

  // ---------- BRUTALISTAS ----------
  bloque(t, a, x, d, hora) {
    const k = textos(d);
    return `<rect x="0" y="108" width="200" height="66" fill="${a}"/>
      <text x="30" y="40" ${MONO} font-size="9" font-weight="700" fill="${t.texto}" letter-spacing="1">${k.dia}/${dos(k.num)}</text>
      <text x="170" y="40" ${MONO} font-size="9" font-weight="700" fill="${t.texto}" text-anchor="end">${x.bateria ?? "--"}%</text>
      ${hora ? `<text x="100" y="103" ${SANS} font-size="84" font-weight="900" fill="${t.texto}" text-anchor="middle" letter-spacing="-6">${k.hh}</text>
      <text x="100" y="166" ${SANS} font-size="70" font-weight="900" fill="${t.fondo}" text-anchor="middle" letter-spacing="-5">${k.mm}</text>` : ""}
      <rect x="0" y="174" width="200" height="3" fill="${t.texto}"/>`;
  },

  concreto(t, a, x, d, hora) {
    const k = textos(d);
    let grilla = "";
    for (let i = 20; i < 200; i += 20) {
      grilla += `<line x1="${i}" y1="0" x2="${i}" y2="200" stroke="${t.terciario}" stroke-width=".5"/>
        <line x1="0" y1="${i}" x2="200" y2="${i}" stroke="${t.terciario}" stroke-width=".5"/>`;
    }
    const fila = (y, etq, val) => `<text x="40" y="${y}" ${MONO} font-size="10" fill="${t.secundario}">${etq}</text>
      <text x="160" y="${y}" ${MONO} font-size="10" font-weight="700" fill="${t.texto}" text-anchor="end">${val}</text>`;
    return grilla + `<rect x="40" y="40" width="10" height="10" fill="${a}"/>
      <text x="56" y="49" ${MONO} font-size="9" font-weight="700" fill="${t.texto}" letter-spacing="1">${k.dia}.${dos(k.num)}.${k.mes}</text>
      ${hora ? `<text x="100" y="104" ${MONO} font-size="46" font-weight="800" fill="${t.texto}" text-anchor="middle" letter-spacing="-2">${k.hh}:${k.mm}</text>` : ""}
      <line x1="40" y1="116" x2="160" y2="116" stroke="${a}" stroke-width="2"/>
      ${fila(134, "STEP", String(x.pasos ?? 0).padStart(5, "0"))}
      ${fila(150, "BPM", String(x.bpm ?? 0).padStart(3, "0"))}
      ${fila(166, "BAT", `${String(x.bateria ?? 0).padStart(3, "0")}%`)}`;
  },

  senal(t, a, x, d, hora) {
    const k = textos(d);
    return `<rect x="0" y="0" width="200" height="200" fill="${a}"/>
      <rect x="0" y="46" width="200" height="16" fill="${t.fondo}"/>
      <text x="100" y="58" ${MONO} font-size="10" font-weight="800" fill="${a}" text-anchor="middle" letter-spacing="3">${k.dia} ${k.num} ${k.mes}</text>
      ${hora ? `<text x="100" y="138" ${SANS} font-size="78" font-weight="900" fill="${t.fondo}" text-anchor="middle" letter-spacing="-5">${k.hh}:${k.mm}</text>` : ""}
      <rect x="40" y="150" width="120" height="14" fill="${t.fondo}"/>
      <text x="100" y="161" ${MONO} font-size="9" font-weight="800" fill="${a}" text-anchor="middle" letter-spacing="2">${x.pasos ?? 0} PASOS</text>`;
  },

  // ---------- ELEGANTES ----------
  romano(t, a, x, d, hora) {
    const g = angulos(d), id = uid("esf");
    let numeros = "";
    ROMANOS.forEach((n, i) => {
      const [nx, ny] = pol(70, i * 30);
      numeros += `<text x="${f(nx)}" y="${f(ny + 5)}" ${SERIF} font-size="${i % 3 ? 11 : 14}" font-weight="600" fill="${a}" text-anchor="middle">${n}</text>`;
    });
    return `<defs><radialGradient id="${id}" cx="50%" cy="42%" r="60%">
        <stop offset="0" stop-color="${t.fondo2}"/><stop offset="1" stop-color="${t.fondo}"/></radialGradient></defs>
      <circle cx="100" cy="100" r="99" fill="url(#${id})"/>
      <circle cx="100" cy="100" r="92" fill="none" stroke="${a}" stroke-width=".6" opacity=".7"/>
      ${marcas(60, 92, 87, a, .7, (i) => i % 5)}${marcas(12, 92, 84, a, 1.6)}
      ${numeros}
      <text x="100" y="62" ${SERIF} font-size="6.5" fill="${a}" text-anchor="middle" letter-spacing="2.5">FACUWATCH</text>
      <rect x="92" y="128" width="16" height="11" rx="1" fill="#f4efe4" stroke="${a}" stroke-width=".8"/>
      <text x="100" y="136.5" ${SERIF} font-size="8" font-weight="700" fill="#1a1a1a" text-anchor="middle">${d.getDate()}</text>
      ${hora ? dauphine(g.h, 44, 5, a, t.sombra) + dauphine(g.m, 66, 4, a, t.sombra)
        + bastonAguja(g.s, 78, .9, a, 18) + `<circle cx="100" cy="100" r="3.5" fill="${a}"/>` : ""}`;
  },

  baston(t, a, x, d, hora) {
    const g = angulos(d), id = uid("esf");
    let indices = "", rayos = "";
    for (let i = 0; i < 12; i++) {
      const ang = i * 30, doble = i === 0;
      const tramo = (desv) => {
        const [x1, y1] = pol(84, ang + desv), [x2, y2] = pol(68, ang + desv);
        return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${a}" stroke-width="${i % 3 ? 3 : 4.2}" stroke-linecap="square"/>`;
      };
      indices += doble ? tramo(-2.6) + tramo(2.6) : tramo(0);
    }
    for (let i = 0; i < 72; i++) {
      const [x1, y1] = pol(18, i * 5), [x2, y2] = pol(96, i * 5);
      rayos += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#fff" stroke-width=".35" opacity=".05"/>`;
    }
    return `<defs><radialGradient id="${id}" cx="50%" cy="40%" r="62%">
        <stop offset="0" stop-color="${t.fondo2}"/><stop offset="1" stop-color="${t.fondo}"/></radialGradient></defs>
      <circle cx="100" cy="100" r="99" fill="url(#${id})"/>${rayos}
      ${marcas(60, 92, 89, a, .6, (i) => i % 5)}
      ${indices}
      <text x="100" y="58" ${SERIF} font-size="7" fill="${a}" text-anchor="middle" letter-spacing="3">FACUWATCH</text>
      <text x="100" y="148" ${SERIF} font-size="5.5" fill="${a}" text-anchor="middle" letter-spacing="2" opacity=".8">EDICIÓN ESPECIAL</text>
      ${hora ? bastonAguja(g.h, 46, 4.2, a, 8) + bastonAguja(g.m, 70, 3, a, 10)
        + bastonAguja(g.s, 80, .8, t.segundero || a, 20)
        + `<circle cx="100" cy="100" r="3.2" fill="${a}"/><circle cx="100" cy="100" r="1.2" fill="${t.fondo}"/>` : ""}`;
  },

  // ---------- DEPORTIVOS ----------
  anillos(t, a, x, d, hora) {
    const k = textos(d);
    const anillo = (r, frac, color) => {
      const c = 2 * Math.PI * r;
      return `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${t.superficie || "#1c1c1e"}" stroke-width="7"/>
        <circle cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
          stroke-dasharray="${f(c)}" stroke-dashoffset="${f(c * (1 - Math.min(frac, 1)))}" transform="rotate(-90 100 100)"/>`;
    };
    return anillo(84, (x.pasos ?? 5400) / (x.meta ?? 8000), a)
      + anillo(73, ((x.bpm ?? 72) - 40) / 140, t.texto) + anillo(62, (x.bateria ?? 70) / 100, t.secundario)
      + (hora ? `<text x="100" y="98" ${SANS} font-size="34" font-weight="800" fill="${t.texto}" text-anchor="middle" letter-spacing="-1">${k.hh}:${k.mm}</text>` : "")
      + `<text x="100" y="118" ${SANS} font-size="10" font-weight="600" fill="${a}" text-anchor="middle" letter-spacing="1.2">${k.dia} ${k.num}</text>`;
  },

  sprint(t, a, x, d, hora) {
    const k = textos(d), seg = d.getSeconds();
    let s = "";
    for (let i = 0; i < 60; i++) {
      const [x1, y1] = pol(93, i * 6), [x2, y2] = pol(84, i * 6);
      s += `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${i <= seg ? a : t.terciario}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    return s + (hora ? `<text x="100" y="112" ${SANS} font-size="50" font-weight="900" font-style="italic" fill="${t.texto}" text-anchor="middle" letter-spacing="-2">${k.hh}:${k.mm}</text>` : "")
      + `<text x="70" y="140" ${SANS} font-size="15" font-weight="800" fill="${a}" text-anchor="middle">${x.bpm ?? "--"}</text>
      <text x="70" y="151" ${SANS} font-size="7" font-weight="700" fill="${t.secundario}" text-anchor="middle" letter-spacing="1">BPM</text>
      <text x="130" y="140" ${SANS} font-size="15" font-weight="800" fill="${t.texto}" text-anchor="middle">${x.pasos ?? "--"}</text>
      <text x="130" y="151" ${SANS} font-size="7" font-weight="700" fill="${t.secundario}" text-anchor="middle" letter-spacing="1">PASOS</text>
      <text x="100" y="66" ${SANS} font-size="10" font-weight="700" fill="${t.secundario}" text-anchor="middle" letter-spacing="2">${k.dia} ${k.num}</text>`;
  },
};

/**
 * Devuelve el SVG de una esfera.
 * @param {object} tema   definición de temas.json
 * @param {number} iAcento índice del acento elegido
 * @param {object} datos  { pasos, bpm, bateria, meta } (opcionales)
 * @param {object} op     { fecha: Date, conHora: bool (false = solo fondo, para la esfera con foto) }
 */
export function esferaSVG(tema, iAcento = 0, datos = {}, op = {}) {
  const d = op.fecha || new Date();
  const hora = op.conHora !== false;
  const acento = tema.acentos[Math.min(iAcento, tema.acentos.length - 1)].color;
  const dibujar = ESTILOS[tema.tipo];
  if (!dibujar) throw new Error(`estilo de esfera desconocido: ${tema.tipo}`);
  const clip = uid("clip");
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Esfera ${tema.nombre}">
    <defs><clipPath id="${clip}"><circle cx="100" cy="100" r="99"/></clipPath></defs>
    <g clip-path="url(#${clip})"><rect width="200" height="200" fill="${tema.fondo}"/>${dibujar(tema, acento, datos, d, hora)}</g>
    <circle cx="100" cy="100" r="99" fill="none" stroke="#2c2c2e" stroke-width="1.5"/></svg>`;
}

export const ESTILOS_DISPONIBLES = Object.keys(ESTILOS);
export const LINEAS = { minimal: "Minimalistas", brutal: "Brutalistas", elegante: "Elegantes", deporte: "Deportivos" };
