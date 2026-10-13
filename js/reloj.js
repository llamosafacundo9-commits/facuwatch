// Conexión directa iPhone ⇄ reloj con Web Bluetooth (dentro de Bluefy).
// Mismas reglas que el agente de la Mac: solo comandos de la lista blanca,
// y si un comando activa algo, SIEMPRE se envía "detener" al final.
"use strict";

import {
  UUID, MTU, armarPaquete, fragmentar, Reensamblador, leerPasos,
  obtenerComando, interpretar, PacketError,
} from "./moyoung.js";

export const hayBluetooth = () => typeof navigator !== "undefined" && !!navigator.bluetooth;

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
      try { this.emitir("pasos", leerPasos(new Uint8Array(e.target.value.buffer))); }
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

  async leerBateria() {
    if (!this.chars.bateria) return null;
    const v = await this.chars.bateria.readValue();
    const p = v.getUint8(0);
    if (p <= 100) this.emitir("bateria", { porcentaje: p });
    return p;
  }

  _alRecibir(e) {
    let paquetes;
    try { paquetes = this.reens.agregar(new Uint8Array(e.target.value.buffer)); }
    catch (err) { if (err instanceof PacketError) this.emitir("aviso", err.message); return; }
    for (const p of paquetes) {
      if (this.esperando && p.comando === this.esperando.codigo) {
        this.esperando.resolver(p);
        this.esperando = null;
      }
    }
  }

  async _escribir(paquete) {
    for (const trozo of fragmentar(paquete, MTU)) {
      await this.chars.dataOut.writeValueWithResponse(trozo);
    }
  }

  /** Ejecuta un comando de la lista blanca. Los comandos se encolan de a uno. */
  comando(clave) {
    const tarea = this.cola.then(() => this._comando(clave));
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  async _comando(clave) {
    const c = obtenerComando(clave);   // lanza si no está aprobado
    if (!this.conectado) throw new Error("El reloj no está conectado");
    const respuesta = new Promise((resolver) => { this.esperando = { codigo: c.codigo, resolver }; });
    const vence = new Promise((_, rechazar) =>
      setTimeout(() => rechazar(new Error("El reloj no respondió a tiempo")), c.espera));
    try {
      await this._escribir(armarPaquete(c.codigo, Uint8Array.from(c.payload)));
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
