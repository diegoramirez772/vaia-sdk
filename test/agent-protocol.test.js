// Protocolo de agente — contrato y seguridad.
//
// El espacio es CÓDIGO DE TERCEROS. Estas pruebas fijan lo que NO se le
// permite, que es más importante que lo que sí: la lista blanca de acciones es
// la única barrera entre "el agente hace lo que el espacio declaró" y "el
// agente hace lo que alguien logre colarle".
//
// Se prueba con un espacio de mentira, no con Nexus: si el contrato solo
// funciona porque conocemos Nexus, está mal hecho.

import test from "node:test";
import assert from "node:assert/strict";
import {
  defineCapability, toManifest,
  validateAgentSurface, validateActionCall,
  AGENT_PROTOCOL_VERSION,
} from "../dist/index.js";

/** Espacio de mentira que declara el contrato completo. */
const ESPACIO_DE_MENTIRA = {
  actions: [
    {
      name: "filtrar_items",
      description: "Filtra la lista visible por ciudad o categoría.",
      params: [
        { name: "ciudad", type: "string", description: "Ciudad a filtrar." },
        { name: "categoria", type: "string", description: "Categoría.", enum: ["a", "b"] },
      ],
    },
    {
      name: "abrir_item",
      description: "Abre un elemento por su número.",
      params: [{ name: "n", type: "number", description: "Número del elemento.", required: true }],
    },
    {
      name: "postular",
      description: "Envía una postulación.",
      writes: true,
      permission: "write:postulacion",
    },
  ],
  queryEndpoint: "/api/agent/query",
};

// ─── El contrato se valida al DECLARAR ───────────────────────────────────────

test("un contrato bien declarado pasa", () => {
  assert.deepEqual(validateAgentSurface(ESPACIO_DE_MENTIRA), []);
});

test("una acción que escribe SIN permiso declarado se rechaza", () => {
  // Es el agujero que no se permite: modificar datos del usuario sin que él
  // haya concedido nada.
  const errores = validateAgentSurface({
    actions: [{ name: "borrar_todo", description: "Borra todo.", writes: true }],
  });
  assert.equal(errores.length, 1);
  assert.match(errores[0], /permiso/i);
});

test("una acción sin descripción se rechaza", () => {
  // Sin descripción el modelo no puede elegirla: queda muerta en el contrato.
  const errores = validateAgentSurface({ actions: [{ name: "x_y", description: "  " }] });
  assert.match(errores[0], /descripci/i);
});

test("nombres inválidos o repetidos se rechazan", () => {
  assert.match(validateAgentSurface({ actions: [{ name: "Filtrar Cosas", description: "d" }] })[0], /nombre/i);
  const dup = validateAgentSurface({
    actions: [{ name: "abc", description: "d" }, { name: "abc", description: "d" }],
  });
  assert.ok(dup.some(e => /dos veces/.test(e)));
});

test("queryEndpoint tiene que ser una ruta propia, no una URL externa", () => {
  // Si aceptáramos URLs, un espacio podría hacer que Handeia le pegue a un
  // tercero con la identidad del usuario.
  const errores = validateAgentSurface({ queryEndpoint: "https://otro-dominio.com/api" });
  assert.match(errores[0], /ruta/i);
});

test("defineCapability revienta si la superficie de agente es inválida", () => {
  assert.throws(
    () => defineCapability({
      id: "mx.prueba", name: "Prueba", version: "1.0.0", target: "handeia",
      type: "app", sector: "educacion", surfaces: { text: { endpoint: "/x" } },
      permissions: [], risk: "low",
      agent: { actions: [{ name: "escribe", description: "d", writes: true }] },
    }),
    /permiso/i,
  );
});

test("el agente viaja en el manifest, con su versión de protocolo", () => {
  // Así el portal y Handeia saben qué puede hacer el espacio sin abrir su código.
  const cap = defineCapability({
    id: "mx.prueba", name: "Prueba", version: "1.0.0", target: "handeia",
    type: "app", sector: "educacion", surfaces: { text: { endpoint: "/x" } },
    permissions: ["write:postulacion"], risk: "low",
    agent: ESPACIO_DE_MENTIRA,
  });
  const manifest = toManifest(cap);
  assert.equal(manifest.agent.protocol, AGENT_PROTOCOL_VERSION);
  assert.equal(manifest.agent.actions.length, 3);
  assert.equal(manifest.agent.query_endpoint, "/api/agent/query");
});

test("sin superficie de agente, el manifest no la inventa", () => {
  const cap = defineCapability({
    id: "mx.prueba", name: "Prueba", version: "1.0.0", target: "handeia",
    type: "app", sector: "educacion", surfaces: { text: { endpoint: "/x" } },
    permissions: [], risk: "low",
  });
  assert.equal(toManifest(cap).agent, undefined);
});

// ─── La lista blanca en EJECUCIÓN ────────────────────────────────────────────

const ACCIONES = ESPACIO_DE_MENTIRA.actions;

test("una acción declarada, con argumentos válidos, pasa", () => {
  const r = validateActionCall({ name: "filtrar_items", args: { ciudad: "Durango" } }, ACCIONES);
  assert.equal(r.ok, true);
});

test("una acción INVENTADA se rechaza", () => {
  // El caso central: aunque el modelo alucine una acción, aquí se detiene.
  const r = validateActionCall({ name: "borrar_cuenta", args: {} }, ACCIONES);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no está declarada/i);
});

test("falta un parámetro obligatorio", () => {
  const r = validateActionCall({ name: "abrir_item", args: {} }, ACCIONES);
  assert.equal(r.ok, false);
  assert.match(r.reason, /obligatorio/i);
});

test("un parámetro con el tipo equivocado se rechaza", () => {
  const r = validateActionCall({ name: "abrir_item", args: { n: "tres" } }, ACCIONES);
  assert.equal(r.ok, false);
  assert.match(r.reason, /number/);
});

test("un valor fuera del enum se rechaza", () => {
  const r = validateActionCall({ name: "filtrar_items", args: { categoria: "z" } }, ACCIONES);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no admite/i);
});

test("un parámetro de más se rechaza", () => {
  // Un argumento no declarado puede ser un intento de colar algo que el
  // espacio no espera recibir.
  const r = validateActionCall({ name: "abrir_item", args: { n: 1, admin: true } }, ACCIONES);
  assert.equal(r.ok, false);
  assert.match(r.reason, /no está declarado/i);
});

test("las acciones que escriben quedan marcadas, para poder confirmarlas", () => {
  const r = validateActionCall({ name: "postular" }, ACCIONES);
  assert.equal(r.ok, true);
  assert.equal(r.action.writes, true);
});
