// Conexión directa iPhone ⇄ reloj con Web Bluetooth (dentro de Bluefy).
// Mismas reglas que el agente de la Mac: solo comandos de la lista blanca,
// y si un comando activa algo, SIEMPRE se envía "detener" al final.
"use strict";

import {
  UUID, MTU, armarPaquete, fragmentar, Reensamblador, leerPasos,
  obtenerComando, interpretar, payloadDe, PacketError,
} from "./moyoung.js?v=20261013c";

export const hayBluetooth = () => typeof navigator !== "undefined" && !!navigator.bluetooth;

/** Bytes EXACTOS de un DataView. Ojo: su .buffer puede ser más grande que la vista. */
export const bytesDe = (v) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
const hexDe = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

export class Reloj extends EventTarget {
  constructor() {
    super();
    this.device = null;
    this.chars = {};
    this.reens = new Reensamblador();
    this.esperando = null;   // { codigo, resolver }
    this.cola = Promise.resolve();
  }

  get conectado() { return !!this.device?.gatt?.connected; }

  emitir(tipo, detalle) { this.dispatchEvent(new CustomEvent(tipo, { detail: detalle })); }

  /** Pide el reloj al usuario (Bluefy muestra la lista) y se conecta. */
  async conectar() {
    if (!hayBluetooth()) throw new Error("Este navegador no tiene Bluetooth. Abrí FacuWatch en Bluefy.");
    if (!this.device) {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "F22" }],
        optionalServices: [UUID.servicio, UUID.bateriaServicio],
      });
      this.device.addEventListener("gattserverdisconnected", () => this.emitir("desconectado"));
    }
    const gatt = await this.device.gatt.connect();
    const moy = await gatt.getPrimaryService(UUID.servicio);
    this.chars.pasos = await moy.getCharacteristic(UUID.pasos);
    this.chars.dataOut = await moy.getCharacteristic(UUID.dataOut);
    this.chars.dataIn = await moy.getCharacteristic(UUID.dataIn);

    this.chars.dataIn.addEventListener("characteristicvaluechanged", (e) => this._alRecibir(e));
    await this.chars.dataIn.startNotifications();
    this.chars.pasos.addEventListener("characteristicvaluechanged", (e) => {
      const b = bytesDe(e.target.value);
      this.emitir("trafico", { dir: "←", donde: "fee1", hex: hexDe(b) });
      try { this.emitir("pasos", leerPasos(b)); }
      catch (err) { this.emitir("aviso", err.message); }
    });
    await this.chars.pasos.startNotifications();

    try {
      const bat = await gatt.getPrimaryService(UUID.bateriaServicio);
      this.chars.bateria = await bat.getCharacteristic(UUID.bateria);
    } catch { this.chars.bateria = null; }
    this.emitir("conectado", { nombre: this.device.name });
    await this.leerBateria();
  }

  async desconectar() { if (this.conectado) this.device.gatt.disconnect(); }

  /** Cambia a una esfera incorporada y lo VERIFICA leyendo cuál quedó puesta. */
  async ponerEsfera(numero) {
    await this.comando("cambiarEsfera", numero);
    await new Promise((r) => setTimeout(r, 600));   // margen para que el reloj aplique
    return this.comando("esfera");                  // { esfera, texto }
  }

  async leerBateria() {
    if (!this.chars.bateria) return null;
    const v = await this.chars.bateria.readValue();
    const p = bytesDe(v)[0];
    if (p <= 100) this.emitir("bateria", { porcentaje: p });
    return p;
  }

  _alRecibir(e) {
    const b = bytesDe(e.target.value);
    this.emitir("trafico", { dir: "←", donde: "fee3", hex: hexDe(b) });
    let paquetes;
    try { paquetes = this.reens.agregar(b); }
    catch (err) {
      if (err instanceof PacketError) this.emitir("trafico", { dir: "!", donde: "fee3", hex: err.message });
      return;
    }
    for (const p of paquetes) {
      if (this.esperando && p.comando === this.esperando.codigo) {
        this.esperando.resolver(p);
        this.esperando = null;
      }
    }
  }

  async _escribir(paquete) {
    for (const trozo of fragmentar(paquete, MTU)) {
      this.emitir("trafico", { dir: "→", donde: "fee2", hex: hexDe(trozo) });
      try {
        await this.chars.dataOut.writeValueWithResponse(trozo);
      } catch (err) {
        this.emitir("trafico", { dir: "!", donde: "fee2", hex: `error al escribir: ${err.message}` });
        throw err;
      }
    }
  }

  /** Ejecuta un comando de la lista blanca. Los comandos se encolan de a uno. */
  comando(clave, valor) {
    const tarea = this.cola.then(() => this._comando(clave, valor));
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  async _comando(clave, valor) {
    const c = obtenerComando(clave);   // lanza si no está aprobado
    const payload = payloadDe(c, valor);   // lanza si el valor está fuera de rango
    if (!this.conectado) throw new Error("El reloj no está conectado");
    if (c.sinRespuesta) {
      await this._escribir(armarPaquete(c.codigo, payload));
      return { texto: `${c.nombre} enviado` };
    }
    const respuesta = new Promise((resolver) => { this.esperando = { codigo: c.codigo, resolver }; });
    const vence = new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error("El reloj no respondió a tiempo")), c.espera));
    try {
      await this._escribir(armarPaquete(c.codigo, payload));
      const p = await Promise.race([respuesta, vence]);
      return interpretar(p);
    } finally {
      this.esperando = null;
      if (c.detener && this.conectado) {
        await this._escribir(armarPaquete(c.codigo, Uint8Array.from(c.detener)));
      }
    }
  }
}
