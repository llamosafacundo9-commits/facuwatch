// Guardado local de las lecturas EN EL IPHONE (IndexedDB). Nada sale del teléfono.
// Si IndexedDB no está disponible (modo privado), usa memoria y lo avisa.
"use strict";

const NOMBRE = "facuwatch", VERSION = 1;
let memoria = null;   // respaldo en memoria

function abrir() {
  return new Promise((ok, mal) => {
    let req;
    try { req = indexedDB.open(NOMBRE, VERSION); } catch (e) { mal(e); return; }
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore("lecturas", { keyPath: "id", autoIncrement: true });
      s.createIndex("tipo_ts", ["tipo", "ts"]);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

let _db;
async function db() {
  if (memoria) return null;
  try { return (_db ||= await abrir()); }
  catch { memoria = []; return null; }
}
export const persistente = async () => (await db()) !== null;

const enRango = (tipo, desde) => IDBKeyRange.bound([tipo, desde], [tipo, "￿"]);

export async function guardar(tipo, datos, ts = new Date()) {
  const fila = { tipo, ts: ts.toISOString(), ...datos };
  const d = await db();
  if (!d) { memoria.push(fila); return; }
  await new Promise((ok, mal) => {
    const tx = d.transaction("lecturas", "readwrite");
    tx.objectStore("lecturas").add(fila);
    tx.oncomplete = ok; tx.onerror = () => mal(tx.error);
  });
}

export async function historial(tipo, dias = 7) {
  const desde = new Date(Date.now() - dias * 864e5).toISOString();
  const d = await db();
  if (!d) return memoria.filter((f) => f.tipo === tipo && f.ts >= desde);
  return new Promise((ok, mal) => {
    const req = d.transaction("lecturas").objectStore("lecturas").index("tipo_ts").getAll(enRango(tipo, desde));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => mal(req.error);
  });
}

export async function ultima(tipo) {
  const h = await historial(tipo, 3650);
  return h.length ? h[h.length - 1] : null;
}

/** Día local (AAAA-MM-DD) de una fecha ISO. */
export const diaLocal = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Agrupa por día: máximo de pasos y pulso mín/prom/máx (igual que server/ia.py). */
export function resumirPorDia(pasos, pulsos) {
  const out = {};
  for (const l of pasos) {
    const d = (out[diaLocal(l.ts)] ||= {});
    d.pasos = Math.max(d.pasos ?? 0, l.pasos ?? 0);
  }
  const porDia = {};
  for (const l of pulsos) (porDia[diaLocal(l.ts)] ||= []).push(l.bpm);
  for (const [dia, v] of Object.entries(porDia)) {
    Object.assign((out[dia] ||= {}), {
      pulso_min: Math.min(...v), pulso_max: Math.max(...v),
      pulso_prom: Math.round(v.reduce((a, b) => a + b, 0) / v.length),
    });
  }
  return Object.fromEntries(Object.entries(out).sort());
}

export async function resumen(dias = 7) {
  return resumirPorDia(await historial("pasos", dias), await historial("pulso", dias));
}

/** Copia de seguridad: todo en un JSON que el usuario guarda donde quiera. */
export async function exportar() {
  const tipos = ["pasos", "pulso", "bateria"];
  const todo = {};
  for (const t of tipos) todo[t] = await historial(t, 3650);
  return { app: "FacuWatch", exportado: new Date().toISOString(), lecturas: todo };
}
