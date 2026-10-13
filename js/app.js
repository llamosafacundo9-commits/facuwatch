// FacuWatch — app del iPhone. Habla DIRECTO con el reloj (Web Bluetooth en
// Bluefy) y guarda todo en el teléfono. No necesita la Mac ni la PC.
"use strict";

import { Reloj, hayBluetooth } from "./reloj.js?v=20261013c";
import * as datos from "./datos.js?v=20261013c";
import { responder } from "./asistente.js?v=20261013c";
import { esferaSVG, LINEAS } from "./esferas.js?v=20261013c";

const $ = (s) => document.querySelector(s);
const TITULOS = { hoy: "Hoy", historial: "Historial", ia: "Asistente", temas: "Esferas" };
const CIRC = 2 * Math.PI * 86;
const reloj = new Reloj();

function leer(clave, def) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? def; } catch { return def; }
}
function guardarPref(clave, v) {
  try { localStorage.setItem(clave, JSON.stringify(v)); } catch { /* modo privado */ }
}

function toast(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.classList.add("ver");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("ver"), 3000);
}

function hace(iso) {
  if (!iso) return "—";
  const seg = Math.round((Date.now() - new Date(iso)) / 1000);
  if (seg < 60) return "recién";
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}
const fmt = (n) => (n ?? 0).toLocaleString("es-AR");

/* ---------- Navegación ---------- */
function mostrar(v) {
  document.querySelectorAll(".vista").forEach((s) => s.classList.toggle("activa", s.id === `v-${v}`));
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("activa", b.dataset.v === v));
  $("#titulo").textContent = TITULOS[v];
  guardarPref("vista", v);
  if (v === "historial") pintarHistorial();
  if (v === "temas") pintarTemas();
}
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => mostrar(b.dataset.v)));

/* ---------- Estado del reloj ---------- */
let meta = leer("meta", 8000);
const actual = { pasos: null, bpm: null, bateria: null };

/** Escribe un número, o un guion fino y apagado si todavía no hay dato. */
function num(sel, valor, formato = fmt) {
  const el = $(sel);
  const hay = valor != null;
  el.textContent = hay ? formato(valor) : "–";
  el.classList.toggle("sin-dato", !hay);
}

function pintarEstado() {
  const ok = reloj.conectado;
  const pill = $("#estado");
  pill.className = "pill " + (ok ? "ok" : "desc");
  pill.textContent = ok ? "Conectado" : "Conectar";
  $("#btn-conectar").hidden = ok;
  $("#btn-pulso").disabled = !ok;
  pintarEsferaReloj();   // se llama recién desde iniciar(), con todo ya definido
}

async function pintarHoy() {
  const p = await datos.ultima("pasos");
  const hoy = p && datos.diaLocal(p.ts) === datos.diaLocal(new Date().toISOString()) ? p : null;
  actual.pasos = hoy?.pasos ?? null;
  num("#pasos", hoy?.pasos);
  $("#pasos-meta").textContent = hoy || reloj.conectado ? `de ${fmt(meta)} pasos` : "conectá el reloj";
  $("#arco-pasos").style.strokeDashoffset = CIRC * (1 - Math.min((hoy?.pasos ?? 0) / meta, 1));
  num("#distancia", hoy?.distancia);
  num("#calorias", hoy?.calorias);

  const b = await datos.ultima("pulso");
  actual.bpm = b?.bpm ?? null;
  num("#bpm", b?.bpm, String);
  $("#bpm-ts").textContent = b ? hace(b.ts) : "sin mediciones";

  const bat = await datos.ultima("bateria");
  actual.bateria = bat?.porcentaje ?? null;
  num("#bateria", bat?.porcentaje, String);
  $("#bateria-barra").style.width = `${bat?.porcentaje ?? 0}%`;
  $("#bateria-ts").textContent = bat ? hace(bat.ts) : "—";
}

let ultimoPaso = null;
reloj.addEventListener("pasos", async (e) => {
  const clave = JSON.stringify(e.detail);
  if (clave === ultimoPaso) return;   // no guardar repetidos
  ultimoPaso = clave;
  await datos.guardar("pasos", e.detail);
  pintarHoy();
});
reloj.addEventListener("bateria", async (e) => { await datos.guardar("bateria", e.detail); pintarHoy(); });
reloj.addEventListener("conectado", (e) => { pintarEstado(); pintarHoy(); toast(`Conectado a ${e.detail.nombre}`); });
reloj.addEventListener("desconectado", () => { pintarEstado(); pintarHoy(); toast("El reloj se desconectó"); });
reloj.addEventListener("aviso", (e) => console.warn(e.detail));
setInterval(() => { if (reloj.conectado) reloj.leerBateria().catch(() => {}); }, 10 * 60 * 1000);

async function conectar() {
  if (reloj.conectado) return;
  try {
    $("#btn-conectar").disabled = true;
    $("#btn-conectar").textContent = "Conectando…";
    await reloj.conectar();
  } catch (e) {
    if (e.name !== "NotFoundError") toast(e.message);  // NotFoundError = el usuario canceló
  } finally {
    $("#btn-conectar").disabled = false;
    $("#btn-conectar").textContent = "Conectar el reloj";
    pintarEstado();
  }
}
$("#btn-conectar").addEventListener("click", conectar);
$("#estado").addEventListener("click", conectar);

$("#anillo-pasos").addEventListener("click", () => {
  const n = parseInt(prompt("Meta diaria de pasos:", meta), 10);
  if (n > 0) { meta = n; guardarPref("meta", n); pintarHoy(); }
});

$("#btn-pulso").addEventListener("click", async () => {
  const btn = $("#btn-pulso");
  btn.disabled = true;
  btn.textContent = "Midiendo… quieto";
  try {
    const r = await reloj.comando("pulso");
    if (r.bpm) { await datos.guardar("pulso", { bpm: r.bpm }); pintarHoy(); }
    toast(r.texto);
  } catch (e) {
    toast(e.message);
  } finally {
    btn.textContent = "Medir ahora";
    pintarEstado();
  }
});

/* ---------- Historial ---------- */
function barras(serie, color, unidad) {
  const dias = Object.keys(serie);
  if (!dias.length) return `<div class="vacio">Todavía no hay datos guardados.</div>`;
  const W = 320, H = 150, max = Math.max(...dias.map((d) => serie[d])) || 1;
  const ancho = W / Math.max(dias.length, 7);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${unidad} por día">` + dias.map((d, i) => {
    const h = Math.max(2, (serie[d] / max) * (H - 34));
    const x = i * ancho + ancho * 0.2, w = ancho * 0.6;
    const dia = new Date(d + "T12:00").toLocaleDateString("es-AR", { weekday: "narrow" });
    return `<rect x="${x}" y="${H - 18 - h}" width="${w}" height="${h}" rx="5" fill="${color}"/>
      <text x="${x + w / 2}" y="${H - 23 - h}" fill="#fff" font-size="10" text-anchor="middle">${fmt(serie[d])}</text>
      <text x="${x + w / 2}" y="${H - 3}" fill="#8e8e93" font-size="11" text-anchor="middle">${dia}</text>`;
  }).join("") + "</svg>";
}

async function pintarHistorial() {
  const r = await datos.resumen(7);
  const pasos = {}, pulso = {};
  for (const [d, v] of Object.entries(r)) {
    if (v.pasos != null) pasos[d] = v.pasos;
    if (v.pulso_prom != null) pulso[d] = v.pulso_prom;
  }
  $("#graf-pasos").innerHTML = barras(pasos, "var(--acento)", "pasos");
  $("#graf-pulso").innerHTML = barras(pulso, "var(--acento-2)", "BPM");
  $("#txt-datos").textContent = (await datos.persistente())
    ? "Se guardan solo en este iPhone. Hacé una copia de vez en cuando."
    : "Este navegador no deja guardar: los datos se pierden al cerrar. Usá Bluefy sin modo privado.";
}

$("#btn-exportar-datos").addEventListener("click", async () => {
  const blob = new Blob([JSON.stringify(await datos.exportar(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `facuwatch-datos-${datos.diaLocal(new Date().toISOString())}.json`;
  a.click();
});

/* ---------- Asistente ---------- */
function burbuja(texto, quien) {
  const d = document.createElement("div");
  d.className = `msg ${quien}`;
  d.textContent = texto;
  $("#chat").append(d);
  d.scrollIntoView({ behavior: "smooth", block: "end" });
}
async function preguntar(texto) {
  if (!texto.trim()) return;
  burbuja(texto, "yo");
  const ctx = {
    resumen: await datos.resumen(7), meta, bateria: actual.bateria,
    hoy: datos.diaLocal(new Date().toISOString()),
  };
  setTimeout(() => burbuja(responder(texto, ctx), "ia"), 250);
}
$("#form-ia").addEventListener("submit", (ev) => {
  ev.preventDefault();
  preguntar($("#pregunta").value);
  $("#pregunta").value = "";
});
document.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => preguntar(c.dataset.p)));

/* ---------- Esferas ---------- */
let temas = [];
let sel = leer("tema", { id: "pure", acento: 0 });
let filtro = leer("filtro", "todas");

function temaActual() { return temas.find((t) => t.id === sel.id) || temas[0]; }

function pintarTemas() {
  const t = temaActual();
  if (!t) return;
  const ia = Math.min(sel.acento, t.acentos.length - 1);
  const color = t.acentos[ia].color;
  const datosVivos = { pasos: actual.pasos ?? 6231, bpm: actual.bpm ?? 72, bateria: actual.bateria ?? 80, meta };
  document.documentElement.style.setProperty("--acento", t.linea === "elegante" || t.id === "night" ? "#D4AF6A" : color);

  $("#tema-preview").innerHTML = esferaSVG(t, ia, datosVivos);
  $("#tema-linea").textContent = LINEAS[t.linea];
  $("#tema-nombre").textContent = t.nombre;
  $("#tema-desc").textContent = t.descripcion;
  $("#tema-acentos").innerHTML = t.acentos.map((a, i) =>
    `<button type="button" style="background:${a.color}" class="${i === ia ? "sel" : ""}" data-i="${i}" aria-label="${a.nombre}" title="${a.nombre}"></button>`).join("");
  $("#tema-acentos").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    sel.acento = +b.dataset.i; guardarPref("tema", sel); pintarTemas();
  }));

  $("#filtros").innerHTML = [["todas", "Todas"], ...Object.entries(LINEAS)].map(([k, n]) =>
    `<button type="button" class="chip ${k === filtro ? "sel" : ""}" data-f="${k}">${n}</button>`).join("");
  $("#filtros").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    filtro = b.dataset.f; guardarPref("filtro", filtro); pintarTemas();
  }));

  const visibles = temas.filter((x) => filtro === "todas" || x.linea === filtro);
  $("#galeria").innerHTML = visibles.map((x) =>
    `<button type="button" data-id="${x.id}" class="${x.id === t.id ? "sel" : ""}">${esferaSVG(x, 0, datosVivos)}${x.nombre}</button>`).join("");
  $("#galeria").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    sel = { id: b.dataset.id, acento: 0 }; guardarPref("tema", sel); pintarTemas();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
}

/* ----- Esferas incorporadas del reloj (0x29 leer / 0x19 cambiar) ----- */
const ESFERA_MIN = 0, ESFERA_MAX = 6;   // rango que usa DaFup; se verifica leyendo
let esferaActual = leer("esferaReloj", null);
let ocupado = false;

function pintarEsferaReloj() {
  const original = leer("esferaOriginal", null);
  num("#esfera-reloj", esferaActual, (n) => `Nº ${n}`);
  num("#esfera-original", original, (n) => `Nº ${n}`);
  const listo = reloj.conectado && !ocupado;
  // Botones directos 0..6: funcionan aunque la lectura haya fallado.
  const cont = $("#numeros-esfera");
  cont.innerHTML = Array.from({ length: ESFERA_MAX - ESFERA_MIN + 1 }, (_, i) => {
    const n = ESFERA_MIN + i;
    const cls = n === esferaActual ? "sel" : rechazadas.has(n) ? "no" : "";
    return `<button type="button" class="${cls}" data-n="${n}" ${listo ? "" : "disabled"}>${n}</button>`;
  }).join("");
  cont.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => conReloj(() => ponerEsfera(+b.dataset.n))));
  $("#btn-leer-esfera").disabled = !listo;
  $("#btn-esfera-ant").disabled = !listo || esferaActual == null;
  $("#btn-esfera-sig").disabled = !listo || esferaActual == null;
  $("#btn-esfera-original").disabled = !listo || original == null || original === esferaActual;
}

async function conReloj(tarea) {
  ocupado = true; pintarEsferaReloj();
  try { await tarea(); } catch (e) { toast(e.message); }
  finally { ocupado = false; pintarEsferaReloj(); }
}

async function leerEsfera() {
  const r = await reloj.comando("esfera");          // 0x29, solo lectura
  if (r.esfera == null) throw new Error("El reloj respondió algo inesperado");
  esferaActual = r.esfera;
  guardarPref("esferaReloj", esferaActual);
  // La primera vez que la leemos, la guardamos como "original" para poder volver.
  if (leer("esferaOriginal", null) == null) guardarPref("esferaOriginal", esferaActual);
  return esferaActual;
}

// Números que el reloj no aceptó: las flechas los saltean.
const rechazadas = new Set(leer("esferasRechazadas", []));

async function ponerEsfera(n) {
  let r;
  try {
    r = await reloj.ponerEsfera(n);                  // 0x19 + verificación con 0x29
  } catch (e) {
    // El cambio se envió pero no pudimos verificarlo: no marcamos nada como rechazado.
    toast(`Envié la Nº ${n}, pero no pude confirmar: ${e.message}`);
    return;
  }
  esferaActual = r.esfera ?? esferaActual;
  guardarPref("esferaReloj", esferaActual);
  if (leer("esferaOriginal", null) == null && r.esfera != null) guardarPref("esferaOriginal", r.esfera);
  if (r.esfera === n) {
    rechazadas.delete(n);
    toast(`Listo: esfera Nº ${n} en el reloj`);
  } else {
    rechazadas.add(n);
    toast(`El reloj sigue en la Nº ${r.esfera}: no aplicó la Nº ${n}`);
  }
  guardarPref("esferasRechazadas", [...rechazadas]);
}

/** Próxima esfera en la dirección `paso` (+1 / -1), salteando las rechazadas. */
function proxima(paso) {
  let n = esferaActual;
  for (let i = 0; i <= ESFERA_MAX - ESFERA_MIN; i++) {
    n += paso;
    if (n > ESFERA_MAX) n = ESFERA_MIN;
    if (n < ESFERA_MIN) n = ESFERA_MAX;
    if (!rechazadas.has(n)) return n;
  }
  return esferaActual;
}

$("#btn-leer-esfera").addEventListener("click", () => conReloj(async () => {
  toast(`El reloj tiene la esfera Nº ${await leerEsfera()}`);
}));
$("#btn-esfera-sig").addEventListener("click", () => conReloj(() => ponerEsfera(proxima(+1))));
$("#btn-esfera-ant").addEventListener("click", () => conReloj(() => ponerEsfera(proxima(-1))));
$("#btn-esfera-original").addEventListener("click", () => conReloj(() =>
  ponerEsfera(leer("esferaOriginal", null))));

// Al conectar, leer sola la esfera puesta (así las flechas quedan listas).
reloj.addEventListener("conectado", () => conReloj(leerEsfera));
reloj.addEventListener("desconectado", pintarEsferaReloj);

/* ----- Registro Bluetooth (para diagnosticar desde el teléfono) ----- */
const registro = [];
reloj.addEventListener("trafico", (e) => {
  const { dir, donde, hex } = e.detail;
  const h = new Date().toLocaleTimeString("es-AR", { hour12: false });
  registro.push(`${h} ${dir} ${donde}  ${hex}`);
  if (registro.length > 80) registro.shift();
  $("#registro").textContent = registro.join("\n");
});
$("#btn-copiar-registro").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(registro.join("\n")); toast("Registro copiado"); }
  catch { toast("No pude copiar: mandame una captura del registro"); }
});

$("#btn-exportar").addEventListener("click", () => {
  const t = temaActual();
  const svg = esferaSVG(t, sel.acento, {}, { conHora: false });  // solo el fondo
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;   // la resolución real del F22c no está confirmada
    const ctx = c.getContext("2d");
    ctx.fillStyle = t.fondo; ctx.fillRect(0, 0, 1024, 1024);
    ctx.drawImage(img, 0, 0, 1024, 1024);
    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `facuwatch-${t.id}.png`;
      a.click();
      toast("Imagen lista: en Da Fit elegila como esfera con foto");
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
});

/* ---------- Arranque ---------- */
async function iniciar() {
  $("#aviso-bluefy").hidden = hayBluetooth();
  if (!hayBluetooth()) $("#btn-conectar").disabled = true;
  try { temas = await (await fetch("temas.json")).json(); } catch { toast("No pude cargar las esferas"); }
  pintarEstado();
  await pintarHoy();
  mostrar(leer("vista", "hoy"));
  setInterval(() => { if (!document.hidden) pintarHoy(); }, 30000);
}
iniciar();
