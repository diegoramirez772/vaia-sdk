// Ecosistemas y bucle del agente.
//
// Lo que se prueba: que varias capacidades de origen distinto se comporten
// como UN sistema, que las reglas de casa APRIETEN y nunca aflojen, y que un
// agente completo corra con un modelo puesto por el desarrollador.

import test from "node:test";
import assert from "node:assert/strict";
import { capabilities, defineEcosystem, agentLoop } from "../dist/index.js";

const LIBRE = { level: "autonoma", consequence: "reversible" };
const CARA = { level: "autonoma", consequence: "costosa", maxAmount: 1000, currency: "MXN" };

/** Capacidad de prueba que anota lo que ejecutó. */
function capDePrueba(id, tools) {
  const ejecutadas = [];
  const cap = capabilities.local({
    id, tools,
    handler: (n, a) => { ejecutadas.push({ n, a }); return `hecho:${n}`; },
  });
  return { cap, ejecutadas };
}

// ─── Componer ────────────────────────────────────────────────────────────────

test("varias capacidades distintas se comportan como un solo sistema", async () => {
  const a = capDePrueba("proyecto_viejo", [
    { name: "leer_clientes", description: "Lee clientes.", permission: "read:x", authority: LIBRE },
  ]);
  const b = capDePrueba("servidor_mcp", [
    { name: "buscar_web", description: "Busca.", permission: "read:web", authority: LIBRE },
  ]);

  const eco = defineEcosystem({ name: "mi_sistema", capabilities: [a.cap, b.cap] });

  assert.equal(eco.tools.length, 2);
  // Cada herramienta sabe de qué capacidad viene.
  assert.equal(eco.tools.find(t => t.name === "buscar_web").capability, "servidor_mcp");

  assert.equal((await eco.run({ name: "leer_clientes" })).ok, true);
  assert.equal((await eco.run({ name: "buscar_web" })).ok, true);
  assert.equal(a.ejecutadas.length, 1);
  assert.equal(b.ejecutadas.length, 1);
});

test("lo que ninguna capacidad declara, no existe", async () => {
  const a = capDePrueba("x", [{ name: "leer", description: "Lee.", permission: "read:x", authority: LIBRE }]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });
  const r = await eco.run({ name: "formatear_disco" });
  assert.equal(r.ok, false);
  assert.equal(a.ejecutadas.length, 0);
});

// ─── Reglas de casa ──────────────────────────────────────────────────────────

test("una regla por patrón prohíbe todo un grupo de golpe", async () => {
  // El caso real: conectas un servidor con 30 herramientas y quieres decir
  // "nada que borre" sin revisarlas una por una.
  const a = capDePrueba("mcp_fs", [
    { name: "delete_file", description: "Borra.", permission: "write:fs", authority: LIBRE },
    { name: "delete_dir", description: "Borra.", permission: "write:fs", authority: LIBRE },
    { name: "read_file", description: "Lee.", permission: "read:fs", authority: LIBRE },
  ]);

  const eco = defineEcosystem({
    name: "seguro",
    capabilities: [a.cap],
    authority: { "delete_*": { level: "prohibida", consequence: "irreversible" } },
  });

  assert.equal((await eco.run({ name: "delete_file" })).ok, false);
  assert.equal((await eco.run({ name: "delete_dir" })).ok, false);
  assert.equal((await eco.run({ name: "read_file" })).ok, true);
  // Solo se ejecutó la lectura: las dos de borrado ni llegaron.
  assert.equal(a.ejecutadas.length, 1);
});

test("las reglas de casa APRIETAN, nunca aflojan", async () => {
  // Si una capacidad dijo "esto requiere aprobación", el ecosistema no puede
  // volverla autónoma. Al revés sí.
  const a = capDePrueba("x", [
    { name: "pagar", description: "Paga.", permission: "write:pagos",
      authority: { level: "requiere_aprobacion", consequence: "costosa" } },
  ]);

  const eco = defineEcosystem({
    name: "s", capabilities: [a.cap],
    authority: { pagar: LIBRE },   // intento de aflojar
  });

  const r = await eco.run({ name: "pagar" });
  assert.equal(r.ok, false);
  assert.equal(r.needsApproval, true);
  assert.equal(a.ejecutadas.length, 0);
});

test("un tope más bajo del ecosistema también aprieta", async () => {
  const a = capDePrueba("x", [
    { name: "pagar", description: "Paga.", permission: "write:pagos", authority: CARA }, // tope 1000
  ]);
  const eco = defineEcosystem({
    name: "s", capabilities: [a.cap],
    authority: { pagar: { level: "autonoma", consequence: "costosa", maxAmount: 200, currency: "MXN" } },
  });

  assert.equal(eco.tools.find(t => t.name === "pagar").authority.maxAmount, 200);
});

// ─── Conectar y desconectar en caliente ──────────────────────────────────────

test("se agregan y se quitan capacidades sin reiniciar nada", async () => {
  const a = capDePrueba("a", [{ name: "uno", description: "d", permission: "p", authority: LIBRE }]);
  const b = capDePrueba("b", [{ name: "dos", description: "d", permission: "p", authority: LIBRE }]);

  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });
  assert.equal(eco.tools.length, 1);

  eco.add(b.cap);
  assert.equal(eco.tools.length, 2);
  assert.equal((await eco.run({ name: "dos" })).ok, true);

  await eco.remove("b");
  assert.equal(eco.tools.length, 1);
  // Ya no existe para los agentes.
  assert.equal((await eco.run({ name: "dos" })).ok, false);
});

// ─── Bucle del agente ────────────────────────────────────────────────────────

test("el agente corre con el modelo que ponga el desarrollador", async () => {
  const a = capDePrueba("x", [
    { name: "consultar", description: "Consulta datos.", permission: "read:x", authority: LIBRE },
  ]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  // Un "modelo" de mentira: primero pide la acción, luego cierra con texto.
  let vuelta = 0;
  const turno = await agentLoop({
    ecosystem: eco,
    model: async ({ lastResult }) => {
      vuelta++;
      if (vuelta === 1) return { action: { name: "consultar", args: { id: 7 } } };
      return { text: `Listo. La capacidad respondió: ${lastResult.data}` };
    },
  });

  const r = await turno("consulta el 7");
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].ok, true);
  assert.match(r.text, /hecho:consultar/);
  assert.deepEqual(a.ejecutadas[0].a, { id: 7 });
});

test("el agente NO ejecuta lo que requiere aprobación si nadie la concede", async () => {
  const a = capDePrueba("x", [
    { name: "borrar", description: "Borra.", permission: "write:x",
      authority: { level: "requiere_aprobacion", consequence: "irreversible" } },
  ]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  const turno = await agentLoop({
    ecosystem: eco,
    model: async () => ({ action: { name: "borrar" } }),
    maxSteps: 2,
    // Sin onApproval: el comportamiento seguro es NO ejecutar.
  });

  const r = await turno("borra todo");
  assert.equal(a.ejecutadas.length, 0);
  assert.ok(r.steps.every(s => !s.ok));
});

test("con aprobación humana sí se ejecuta — y solo esa vez", async () => {
  const a = capDePrueba("x", [
    { name: "pagar", description: "Paga.", permission: "write:pagos",
      authority: { level: "requiere_aprobacion", consequence: "costosa" } },
  ]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  let preguntas = 0;
  let vuelta = 0;
  const turno = await agentLoop({
    ecosystem: eco,
    model: async () => (++vuelta === 1 ? { action: { name: "pagar" } } : { text: "listo" }),
    onApproval: async () => { preguntas++; return true; },
  });

  const r = await turno("paga la factura");
  assert.equal(preguntas, 1);
  assert.equal(a.ejecutadas.length, 1);
  assert.equal(r.steps[0].ok, true);

  // La declaración NO cambió: un "sí" no es cheque en blanco.
  assert.equal(eco.tools.find(t => t.name === "pagar").authority.level, "requiere_aprobacion");
});

test("si el humano dice que no, no se ejecuta", async () => {
  const a = capDePrueba("x", [
    { name: "pagar", description: "Paga.", permission: "write:pagos",
      authority: { level: "requiere_aprobacion", consequence: "costosa" } },
  ]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  let vuelta = 0;
  const turno = await agentLoop({
    ecosystem: eco,
    model: async () => (++vuelta === 1 ? { action: { name: "pagar" } } : { text: "ok" }),
    onApproval: async () => false,
  });

  await turno("paga");
  assert.equal(a.ejecutadas.length, 0);
});

test("lo PROHIBIDO no se desbloquea ni con aprobación humana", async () => {
  // Para eso está declarado prohibido y no "requiere aprobación".
  const a = capDePrueba("x", [
    { name: "formatear", description: "Formatea.", permission: "write:x",
      authority: { level: "prohibida", consequence: "irreversible" } },
  ]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  const turno = await agentLoop({
    ecosystem: eco,
    model: async () => ({ action: { name: "formatear" } }),
    onApproval: async () => true,   // el humano dice que sí
    maxSteps: 2,
  });

  await turno("formatea");
  assert.equal(a.ejecutadas.length, 0);
});

test("el agente tiene tope de vueltas — sin él, la factura no tiene tope", async () => {
  const a = capDePrueba("x", [{ name: "girar", description: "d", permission: "p", authority: LIBRE }]);
  const eco = defineEcosystem({ name: "s", capabilities: [a.cap] });

  const turno = await agentLoop({
    ecosystem: eco,
    model: async () => ({ action: { name: "girar" } }),   // nunca termina
    maxSteps: 3,
  });

  const r = await turno("gira para siempre");
  assert.equal(r.steps.length, 3);
  assert.equal(a.ejecutadas.length, 3);
});
