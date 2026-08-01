// Las 7 piezas, autoridad y puente MCP.
//
// Lo que se prueba aquí NO es que las cosas funcionen: es que las cosas
// PELIGROSAS no se puedan declarar. La diferencia con otros SDK de agentes es
// que ellos saben decir "puede llamar a esta función" y aquí hay que decir
// además hasta dónde, con qué consecuencia y con qué tope.

import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePieces, checkAuthority, requiresApproval,
  fromMCPTool, toMCPTool, toMCPTools,
  defineCapability, toManifest,
} from "../dist/index.js";

const REVERSIBLE = { level: "autonoma", consequence: "reversible" };

// ─── Lo irreversible nunca es autónomo ───────────────────────────────────────

test("una acción irreversible NO puede ser autónoma", () => {
  // La regla que evita el titular de "la IA borró todo". No depende de que el
  // modelo se porte bien: depende de que ni siquiera se pueda declarar.
  const errores = validatePieces({
    tools: [{
      name: "borrar_registros", description: "Borra registros.",
      permission: "write:datos",
      authority: { level: "autonoma", consequence: "irreversible" },
    }],
  });
  assert.ok(errores.some(e => /irreversible no puede ser autónoma/i.test(e)));
});

test("irreversible con aprobación sí se admite", () => {
  const errores = validatePieces({
    tools: [{
      name: "borrar_registros", description: "Borra registros.",
      permission: "write:datos",
      authority: { level: "requiere_aprobacion", consequence: "irreversible" },
    }],
  });
  assert.deepEqual(errores, []);
});

// ─── Dinero ──────────────────────────────────────────────────────────────────

test("gastar de forma autónoma exige un tope", () => {
  const errores = validatePieces({
    tools: [{
      name: "pagar_proveedor", description: "Paga.", permission: "write:pagos",
      authority: { level: "autonoma", consequence: "costosa" },
    }],
  });
  assert.ok(errores.some(e => /tope declarado/i.test(e)));
});

test("un tope sin moneda se rechaza", () => {
  // "500" sin moneda no significa nada, y adivinarla es como se pierde dinero.
  const errores = validatePieces({
    tools: [{
      name: "pagar_proveedor", description: "Paga.", permission: "write:pagos",
      authority: { level: "autonoma", consequence: "costosa", maxAmount: 500 },
    }],
  });
  assert.ok(errores.some(e => /moneda/i.test(e)));
});

test("una herramienta sin permiso declarado se rechaza", () => {
  // Sin permiso no hay a quién pedirle consentimiento ni a quién revocárselo.
  const errores = validatePieces({
    tools: [{ name: "hacer_algo", description: "Hace algo.", permission: "", authority: REVERSIBLE }],
  });
  assert.ok(errores.some(e => /permiso declarado/i.test(e)));
});

// ─── El agente es el techo ───────────────────────────────────────────────────

test("una herramienta NO puede tener más autoridad que su agente", () => {
  // Sin esta regla se podría declarar un agente limitado y colarle una
  // herramienta que hace lo que él no puede.
  const errores = validatePieces({
    tools: [{
      name: "pagar", description: "Paga.", permission: "write:pagos",
      authority: { level: "autonoma", consequence: "costosa", maxAmount: 100, currency: "MXN" },
    }],
    agents: [{
      name: "asistente", description: "Asistente.", purpose: "Ayudar.",
      tools: ["pagar"],
      authority: { level: "requiere_aprobacion", consequence: "costosa" },
    }],
  });
  assert.ok(errores.some(e => /más autoridad que él/i.test(e)));
});

test("un agente que usa una herramienta no declarada se rechaza", () => {
  const errores = validatePieces({
    agents: [{
      name: "asistente", description: "A.", purpose: "P.",
      tools: ["fantasma"], authority: REVERSIBLE,
    }],
  });
  assert.ok(errores.some(e => /no está declarada/i.test(e)));
});

test("un agente sin propósito se rechaza", () => {
  // Si no se puede escribir para qué existe, no debería existir.
  const errores = validatePieces({
    agents: [{ name: "cosa", description: "d", purpose: "  ", authority: REVERSIBLE }],
  });
  assert.ok(errores.some(e => /propósito/i.test(e)));
});

// ─── Autoridad en ejecución ──────────────────────────────────────────────────

test("un monto por encima del tope se detiene", () => {
  const a = { level: "autonoma", consequence: "costosa", maxAmount: 500, currency: "MXN" };
  assert.equal(checkAuthority(a, { amount: 300, currency: "MXN" }).ok, true);
  const r = checkAuthority(a, { amount: 900, currency: "MXN" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /tope/i);
});

test("comparar monedas distintas se rechaza", () => {
  // Autorizar 500 USD creyendo que eran 500 MXN es como se autoriza 20 veces
  // más de lo que se pensaba.
  const a = { level: "autonoma", consequence: "costosa", maxAmount: 500, currency: "MXN" };
  const r = checkAuthority(a, { amount: 100, currency: "USD" });
  assert.equal(r.ok, false);
  assert.match(r.reason, /moneda/i);
});

test("lo prohibido nunca pasa", () => {
  const r = checkAuthority({ level: "prohibida", consequence: "irreversible" });
  assert.equal(r.ok, false);
});

test("requiresApproval distingue lo autónomo de lo demás", () => {
  assert.equal(requiresApproval(REVERSIBLE), false);
  assert.equal(requiresApproval({ level: "requiere_aprobacion", consequence: "costosa" }), true);
  assert.equal(requiresApproval({ level: "prohibida", consequence: "irreversible" }), true);
});

// ─── Puente MCP ──────────────────────────────────────────────────────────────

test("una herramienta MCP entra SIN permisos propios: la autoridad la pone el dueño", () => {
  // Importar algo de internet no debería concederle permisos por importarlo.
  const { tool } = fromMCPTool(
    { name: "search-web", description: "Busca en la web." },
    REVERSIBLE, "read:web",
  );
  assert.equal(tool.name, "mcp_search_web");
  assert.equal(tool.permission, "read:web");
  assert.equal(tool.authority.level, "autonoma");
});

test("MCP: si el servidor la marca destructiva y se declara reversible, avisa", () => {
  const { warnings } = fromMCPTool(
    { name: "delete-all", description: "Borra.", annotations: { destructiveHint: true } },
    REVERSIBLE, "write:datos",
  );
  assert.ok(warnings.some(w => /destructiva/i.test(w)));
});

test("MCP: una herramienta sin descripción avisa", () => {
  const { warnings } = fromMCPTool({ name: "x" }, REVERSIBLE, "read:x");
  assert.ok(warnings.some(w => /no la describe/i.test(w)));
});

test("hacia MCP: lo que requiere aprobación NO se publica", () => {
  // Exponerlo sería ofrecerle a un agente externo algo que ni el propio dueño
  // puede ejecutar solo.
  const conAprobacion = {
    name: "pagar", description: "Paga.", permission: "write:pagos",
    authority: { level: "requiere_aprobacion", consequence: "costosa" },
  };
  assert.equal(toMCPTool(conAprobacion), null);

  const { published, withheld } = toMCPTools([
    conAprobacion,
    { name: "leer", description: "Lee.", permission: "read:x", authority: REVERSIBLE },
  ]);
  assert.equal(published.length, 1);
  assert.deepEqual(withheld, ["pagar"]);
});

test("hacia MCP: las pistas salen de la autoridad declarada", () => {
  const m = toMCPTool({ name: "leer", description: "Lee.", permission: "read:x", authority: REVERSIBLE });
  assert.equal(m.annotations.readOnlyHint, true);
  assert.equal(m.annotations.destructiveHint, false);
});

// ─── Integración con defineCapability ────────────────────────────────────────

test("defineCapability revienta si una pieza está mal declarada", () => {
  assert.throws(() => defineCapability({
    id: "mx.p", name: "P", version: "1.0.0", target: "handeia", type: "app",
    sector: "educacion", surfaces: { text: { endpoint: "/x" } }, permissions: [], risk: "low",
    pieces: {
      tools: [{
        name: "borrar", description: "Borra.", permission: "write:x",
        authority: { level: "autonoma", consequence: "irreversible" },
      }],
    },
  }), /irreversible/i);
});

test("las piezas viajan al manifest, para poder mostrarlas antes de instalar", () => {
  const cap = defineCapability({
    id: "mx.p", name: "P", version: "1.0.0", target: "handeia", type: "app",
    sector: "educacion", surfaces: { text: { endpoint: "/x" } },
    permissions: ["read:x"], risk: "low",
    pieces: { tools: [{ name: "leer", description: "Lee.", permission: "read:x", authority: REVERSIBLE }] },
  });
  assert.equal(toManifest(cap).pieces.tools.length, 1);
});
