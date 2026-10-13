// Asistente local de FacuWatch: responde en el iPhone, sin internet ni IA externa.
// Usa SOLO los datos guardados; si falta un dato, lo dice. No da diagnósticos.
"use strict";

const fmt = (n) => Number(n).toLocaleString("es-AR");
const nombreDia = (dia) =>
  new Date(dia + "T12:00").toLocaleDateString("es-AR", { weekday: "long" });

function tema(pregunta) {
  const p = pregunta.toLowerCase();
  if (/dorm|sueñ|suen/.test(p)) return "sueño";
  if (/puls|coraz|bpm|latid/.test(p)) return "pulso";
  if (/paso|camin|anduv|moví|movi|activ/.test(p)) return "pasos";
  if (/bater|carga/.test(p)) return "bateria";
  if (/consejo|recomend|hoy|qué hago|que hago/.test(p)) return "consejo";
  return "general";
}

/**
 * @param {string} pregunta
 * @param {object} ctx { resumen: {dia: {pasos, pulso_prom,...}}, meta, bateria, hoy: "AAAA-MM-DD" }
 */
export function responder(pregunta, ctx) {
  const dias = Object.entries(ctx.resumen || {});
  const conPasos = dias.filter(([, v]) => v.pasos != null);
  const conPulso = dias.filter(([, v]) => v.pulso_prom != null);
  const meta = ctx.meta || 8000;

  switch (tema(pregunta)) {
    case "sueño":
      return "Todavía no leo el sueño del reloj: necesito que apruebes el comando de historial de sueño de Gadgetbridge. Cuando lo tengamos, te lo cuento acá.";

    case "pasos": {
      if (!conPasos.length) return "Todavía no tengo pasos guardados. Conectá el reloj desde la pestaña Hoy.";
      const total = conPasos.reduce((a, [, v]) => a + v.pasos, 0);
      const prom = Math.round(total / conPasos.length);
      const [mejorDia, mejor] = conPasos.reduce((m, x) => (x[1].pasos > m[1].pasos ? x : m));
      const cumplidos = conPasos.filter(([, v]) => v.pasos >= meta).length;
      return `En ${conPasos.length} día(s) con datos promediaste ${fmt(prom)} pasos. ` +
        `Tu mejor día fue el ${nombreDia(mejorDia)} con ${fmt(mejor.pasos)}. ` +
        `Llegaste a la meta de ${fmt(meta)} en ${cumplidos} de ${conPasos.length} día(s).`;
    }

    case "pulso": {
      if (!conPulso.length) return "No tengo mediciones de pulso todavía. Tocá «Medir ahora» en la pestaña Hoy.";
      const vals = conPulso.map(([, v]) => v.pulso_prom);
      const min = Math.min(...conPulso.map(([, v]) => v.pulso_min));
      const max = Math.max(...conPulso.map(([, v]) => v.pulso_max));
      const prom = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      return `Tu pulso promedio medido fue ${prom} BPM (mínimo ${min}, máximo ${max}). ` +
        "Son mediciones puntuales del reloj, no un registro continuo. Ante cualquier duda de salud, consultá a un profesional.";
    }

    case "bateria":
      return ctx.bateria != null
        ? `El reloj tiene ${ctx.bateria}% de batería.`
        : "No sé la batería todavía: conectá el reloj.";

    case "consejo": {
      const hoy = ctx.resumen?.[ctx.hoy]?.pasos ?? 0;
      if (hoy >= meta) return `Hoy ya llegaste a la meta (${fmt(hoy)} pasos). Buen momento para estirar y descansar.`;
      const faltan = meta - hoy;
      return `Hoy llevás ${fmt(hoy)} pasos; te faltan ${fmt(faltan)} para la meta. ` +
        `Una caminata de unos ${Math.max(5, Math.round(faltan / 110))} minutos te deja ahí.`;
    }

    default:
      return "Puedo contarte de tus pasos, tu pulso, la batería o darte un consejo para hoy. Probá con «¿cómo vengo con los pasos?».";
  }
}
