// Capacidades que corren.
//
// Lo que se prueba: que EJECUTEN de verdad, y que la autoridad las detenga
// antes de tocar nada. Un runtime que ejecuta pero no frena no sirve de nada;
// uno que frena pero no ejecuta tampoco.

import test from "node:test";
import assert from "node:assert/strict";
import { capabilities } from "../dist/index.js";

const LIBRE = { level: "autonoma", consequence: "reversible" };
const CARA = { level: "autonoma", consequence: "costosa", maxAmount: 500, currency: "MXN" };
const CON_VISTO_BUENO = { level: "requiere_aprobacion", consequence: "irreversible" };

// ─── local() ─────────────────────────────────────────────────────────────────

test("local: ejecuta de verdad y devuelve evidencia", async () => {
  const cap = capabilities.local({
    id: "mi_app",
    tools: [{ name: "sumar", description: "Suma dos números.", permission: "read:calc", authority: LIBRE }],
    handler: (_n, a) => a.x + a.y,
  });

  const r = await cap.run({ name: "sumar", args: { x: 2, y: 3 } });
  assert.equal(r.ok, true);
  assert.equal(r.data, 5);
  // Sin evidencia no hay nada que auditar.
  assert.equal(r.evidence.source, "local");
});

test("local: una operación no declarada no se ejecuta", async () => {
  let seEjecuto = false;
  const cap = capabilities.local({
    id: "mi_app",
    tools: [{ name: "sumar", description: "Suma.", permission: "read:calc", authority: LIBRE }],
    handler: () => { seEjecuto = true; },
  });

  const r = await cap.run({ name: "borrar_todo" });
  assert.equal(r.ok, false);
  // Lo importante no es el mensaje: es que el handler NUNCA corrió.
  assert.equal(seEjecuto, false);
});

test("local: lo que requiere aprobación NO se ejecuta, se devuelve para pedirla", async () => {
  let seEjecuto = false;
  const cap = capabilities.local({
    id: "mi_app",
    tools: [{ name: "borrar", description: "Borra.", permission: "write:datos", authority: CON_VISTO_BUENO }],
    handler: () => { seEjecuto = true; },
  });

  const r = await cap.run({ name: "borrar" });
  assert.equal(r.ok, false);
  assert.equal(r.needsApproval, true);
  // El SDK no puede fingir que consiguió el visto bueno humano.
  assert.equal(seEjecuto, false);
});

test("local: el tope de gasto se aplica ANTES de ejecutar", async () => {
  let cobrado = 0;
  const cap = capabilities.local({
    id: "pagos",
    tools: [{ name: "pagar", description: "Paga.", permission: "write:pagos", authority: CARA }],
    handler: (_n, a) => { cobrado += a.monto; return "pagado"; },
  });

  assert.equal((await cap.run({ name: "pagar", args: { monto: 300 }, amount: 300, currency: "MXN" })).ok, true);
  assert.equal(cobrado, 300);

  const r = await cap.run({ name: "pagar", args: { monto: 900 }, amount: 900, currency: "MXN" });
  assert.equal(r.ok, false);
  assert.match(r.reason ?? r.error, /tope/i);
  // Lo que importa: no se cobró de más.
  assert.equal(cobrado, 300);
});

test("local: un fallo del handler no revienta el proceso", async () => {
  const cap = capabilities.local({
    id: "mi_app",
    tools: [{ name: "romper", description: "Falla.", permission: "read:x", authority: LIBRE }],
    handler: () => { throw new Error("se cayó"); },
  });
  const r = await cap.run({ name: "romper" });
  assert.equal(r.ok, false);
  assert.match(r.error, /se cayó/);
});

// ─── mcp() ───────────────────────────────────────────────────────────────────

/** Servidor MCP de mentira, para probar sin depender de uno real. */
function servidorFalso(tools, alLlamar = () => ({ content: "listo" })) {
  const llamadas = [];
  return {
    llamadas,
    transport: {
      async send(msg) {
        if (msg.method === "initialize") return { jsonrpc: "2.0", id: msg.id, result: {} };
        if (msg.method === "tools/list") return { jsonrpc: "2.0", id: msg.id, result: { tools } };
        if (msg.method === "tools/call") {
          llamadas.push(msg.params);
          return { jsonrpc: "2.0", id: msg.id, result: alLlamar(msg.params) };
        }
        return { jsonrpc: "2.0", id: msg.id, result: {} };
      },
    },
  };
}

test("mcp: lista las herramientas del servidor y las deja llamables", async () => {
  const s = servidorFalso([{ name: "search_web", description: "Busca." }]);
  const cap = await capabilities.mcp({
    id: "buscador", transport: s.transport,
    authority: { search_web: LIBRE },
  });

  assert.equal(cap.tools.length, 1);
  const r = await cap.run({ name: "search_web", args: { q: "hola" } });
  assert.equal(r.ok, true);
  // Se llama al servidor con el nombre ORIGINAL, no con el normalizado.
  assert.equal(s.llamadas[0].name, "search_web");
  assert.deepEqual(s.llamadas[0].arguments, { q: "hola" });
});

test("mcp: lo que NO tiene autoridad asignada nace prohibido", async () => {
  // La decisión de diseño central: conectas un servidor de internet y NADA
  // corre hasta que tú lo autorices, una por una.
  const s = servidorFalso([
    { name: "search_web", description: "Busca." },
    { name: "delete_everything", description: "Borra todo." },
  ]);
  const cap = await capabilities.mcp({
    id: "peligroso", transport: s.transport,
    authority: { search_web: LIBRE },   // delete_everything NO se menciona
  });

  const r = await cap.run({ name: "delete_everything" });
  assert.equal(r.ok, false);
  assert.equal(s.llamadas.length, 0);   // nunca llegó al servidor
});

test("mcp: el error del servidor se reporta, no se traga", async () => {
  const s = servidorFalso(
    [{ name: "fallar", description: "Falla." }],
    () => ({ isError: true, content: "explotó" }),
  );
  const cap = await capabilities.mcp({
    id: "x", transport: s.transport, authority: { fallar: LIBRE },
  });
  const r = await cap.run({ name: "fallar" });
  assert.equal(r.ok, false);
});

test("mcp: se puede subir el piso con defaultAuthority, a conciencia", async () => {
  const s = servidorFalso([{ name: "leer_algo", description: "Lee." }]);
  const cap = await capabilities.mcp({
    id: "x", transport: s.transport, authority: {}, defaultAuthority: LIBRE,
  });
  assert.equal((await cap.run({ name: "leer_algo" })).ok, true);
});

// ─── http() ──────────────────────────────────────────────────────────────────

test("http: un proyecto que ya existe se vuelve capacidad sin reescribirlo", async () => {
  const real = globalThis.fetch;
  let pedido = null;
  globalThis.fetch = async (url, init) => {
    pedido = { url: String(url), body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ total: 42 }), { status: 200 });
  };
  try {
    const cap = capabilities.http({
      id: "proyecto_viejo", baseUrl: "https://api.ejemplo.test/vaia",
      tools: [{ name: "contar", description: "Cuenta.", permission: "read:x", authority: LIBRE }],
    });
    const r = await cap.run({ name: "contar", args: { desde: 1 } });
    assert.equal(r.ok, true);
    assert.deepEqual(r.data, { total: 42 });
    assert.equal(pedido.url, "https://api.ejemplo.test/vaia/contar");
    assert.deepEqual(pedido.body, { desde: 1 });
  } finally {
    globalThis.fetch = real;
  }
});

test("http: la autoridad frena ANTES de salir a la red", async () => {
  const real = globalThis.fetch;
  let salio = false;
  globalThis.fetch = async () => { salio = true; return new Response("{}"); };
  try {
    const cap = capabilities.http({
      id: "x", baseUrl: "https://ejemplo.test",
      tools: [{ name: "borrar", description: "Borra.", permission: "write:x", authority: CON_VISTO_BUENO }],
    });
    const r = await cap.run({ name: "borrar" });
    assert.equal(r.needsApproval, true);
    assert.equal(salio, false);   // ni siquiera se hizo la petición
  } finally {
    globalThis.fetch = real;
  }
});
