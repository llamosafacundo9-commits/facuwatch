// Protocolo Moyoung (lógica pura, sin Bluetooth). Port a JavaScript de
// tools/moyoung_packet.py + tools/comandos.py, validados con el F22c real.
// Fuente: Gadgetbridge (AGPLv3) como referencia; código propio.
"use strict";

export const UUID = {
  servicio: "0000feea-0000-1000-8000-00805f9b34fb",
  pasos: "0000fee1-0000-1000-8000-00805f9b34fb",     // notify: 9 bytes
  dataOut: "0000fee2-0000-1000-8000-00805f9b34fb",   // write: comandos
  dataIn: "0000fee3-0000-1000-8000-00805f9b34fb",    // notify: respuestas
  bateriaServicio: "0000180f-0000-1000-8000-00805f9b34fb",
  bateria: "00002a19-0000-1000-8000-00805f9b34fb",
};

export const MTU = 20; // CONFIRMADO con el F22c: respuesta "fe ea 10 06 2e 01"

export class PacketError extends Error {}

/** Arma un paquete: FE EA | B2 | tamaño | comando | payload */
export function armarPaquete(comando, payload = new Uint8Array(), mtu = MTU) {
  if (!(comando >= 0 && comando <= 0xff)) throw new PacketError(`comando fuera de rango: ${comando}`);
  const tam = 5 + payload.length;
  let b2;
  if (mtu === 20) {
    if (tam > 0xff) throw new PacketError(`con MTU 20 el paquete no puede superar 255 bytes (${tam})`);
    b2 = 0x10;
  } else {
    b2 = 0x20 + (tam >> 8);
  }
  return Uint8Array.from([0xfe, 0xea, b2, tam & 0xff, comando, ...payload]);
}

export function fragmentar(paquete, mtu = MTU) {
  const out = [];
  for (let i = 0; i < paquete.length; i += mtu) out.push(paquete.slice(i, i + mtu));
  return out.length ? out : [new Uint8Array()];
}

function tamanoDeclarado(d) {
  if (d.length < 4 || d[0] !== 0xfe || d[1] !== 0xea) throw new PacketError(`no empieza con FE EA: ${hex(d.slice(0, 4))}`);
  if (d[2] === 0x10) return { tam: d[3], modo: "mtu20" };
  if (d[2] >= 0x20) return { tam: ((d[2] - 0x20) << 8) | d[3], modo: "v2" };
  throw new PacketError(`byte de tamaño desconocido: 0x${d[2].toString(16)}`);
}

export function leerPaquete(d) {
  const { tam, modo } = tamanoDeclarado(d);
  if (tam < 5) throw new PacketError(`tamaño declarado imposible: ${tam}`);
  if (d.length !== tam) throw new PacketError(`tamaño declarado ${tam} pero llegaron ${d.length} bytes`);
  return { comando: d[4], payload: d.slice(5), modo };
}

/** Junta los fragmentos que llegan por notify hasta completar paquetes. */
export class Reensamblador {
  constructor() { this.buf = new Uint8Array(); }
  agregar(trozo) {
    const n = new Uint8Array(this.buf.length + trozo.length);
    n.set(this.buf); n.set(trozo, this.buf.length);
    this.buf = n;
    const completos = [];
    while (this.buf.length >= 4) {
      let tam;
      try { ({ tam } = tamanoDeclarado(this.buf)); }
      catch (e) { this.buf = new Uint8Array(); throw e; }
      if (this.buf.length < tam) break;
      completos.push(leerPaquete(this.buf.slice(0, tam)));
      this.buf = this.buf.slice(tam);
    }
    return completos;
  }
}

/** STEPS (0xFEE1): 3 × uint24 little-endian = pasos, distancia, calorías. */
export function leerPasos(d) {
  if (d.length !== 9) throw new PacketError(`STEPS debería tener 9 bytes, llegaron ${d.length}`);
  const u24 = (i) => d[i] | (d[i + 1] << 8) | (d[i + 2] << 16);
  return { pasos: u24(0), distancia: u24(3), calorias: u24(6) };
}

export const hex = (d) => Array.from(d, (b) => b.toString(16).padStart(2, "0")).join(" ");

/* ---------------- Lista blanca de comandos ---------------- */
// Igual que tools/comandos.py: solo comandos documentados en Gadgetbridge y
// aprobados por Facundo. Uno sin fecha de aprobación se rechaza.
export const COMANDOS = {
  version: {
    nombre: "CMD_QUERY_DEVICE_VERSION", codigo: 0x2e, payload: [], espera: 5000,
    aprobado: "2026-10-12", queHace: "Pregunta la versión. No cambia nada.",
  },
  pulso: {
    nombre: "CMD_TRIGGER_MEASURE_HEARTRATE", codigo: 0x6d, payload: [0x00], detener: [0xff],
    espera: 45000, aprobado: "2026-10-12",
    queHace: "Mide el pulso. Siempre se envía 'detener' al final.",
  },
  esfera: {
    nombre: "CMD_QUERY_DISPLAY_WATCH_FACE", codigo: 0x29, payload: [], espera: 5000,
    aprobado: "2026-10-13", queHace: "Pregunta qué número de esfera está puesta. Solo lectura.",
  },
  // 0x84 (QUERY_SUPPORT_WATCH_FACE) NO se incluye: en Gadgetbridge está comentado
  // y marcado como no verificado.
};

export class ComandoNoPermitido extends Error {}

export function obtenerComando(clave) {
  const c = COMANDOS[clave];
  if (!c) throw new ComandoNoPermitido(`'${clave}' no está en la lista blanca`);
  if (!c.aprobado) throw new ComandoNoPermitido(`'${clave}' todavía no fue aprobado por Facundo`);
  return c;
}

export function interpretar(p) {
  if (p.comando === 0x2e && p.payload.length) {
    return { texto: `versión: ${["CHINESE_EDITION", "INTERNATIONAL_EDITION"][p.payload[0]] ?? p.payload[0]}` };
  }
  if (p.comando === 0x29 && p.payload.length) {
    return { texto: `esfera actual: ${p.payload[0]}`, esfera: p.payload[0] };
  }
  if (p.comando === 0x6d && p.payload.length) {
    const bpm = p.payload[0];
    return bpm > 0 && bpm < 255 ? { texto: `pulso: ${bpm} BPM`, bpm } : { texto: "medición sin resultado" };
  }
  return { texto: `respuesta 0x${p.comando.toString(16)}: ${hex(p.payload)}` };
}
