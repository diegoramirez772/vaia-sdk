// Compatibilidad de la migración v1 -> v2.
//
// El riesgo de cambiar un formato de cable no es el formato nuevo: es la
// ventana en que conviven los dos. Durante el despliegue habrá tokens v1
// (latin1) firmados por instancias viejas circulando contra verificadores ya
// actualizados. Si el lector nuevo los rechazara, la gente se quedaría fuera.
//
// Estas pruebas fijan ese contrato para que nadie lo rompa después.

import test from "node:test";
import assert from "node:assert/strict";
import { handeia } from "../dist/index.js";

const SECRET = "secreto-de-prueba-no-usar-en-produccion";
const N_TILDE = String.fromCharCode(0x00d1);
const CJK = String.fromCharCode(0x5317);

// ── Firmante v1 (el código EXACTO de antes del fix) ──────────────────────────
// Se reimplementa aquí a propósito, en vez de importarlo: es el formato
// histórico congelado. Si el SDK cambia, esta referencia NO debe cambiar.
function b64urlV1(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function signV1(payload, secret) {
  const header = b64urlV1(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64urlV1(JSON.stringify(payload)); // sin claim `v` = v1
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  const sigStr = String.fromCharCode(...new Uint8Array(sig));
  return `${unsigned}.${b64urlV1(sigStr)}`;
}

test("v1 ASCII: un token viejo sigue verificando", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signV1({ sub: "u-1", name: "DERIAN GONZALEZ", iat: now, exp: now + 3600 }, SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.sub, "u-1");
  assert.equal(claims.name, "DERIAN GONZALEZ");
});

test("v1 latin1: un token viejo con Ñ conserva su significado original", async () => {
  const now = Math.floor(Date.now() / 1000);
  const name = `QUI${N_TILDE}ONES`;
  const token = await signV1({ sub: "u-1", name, iat: now, exp: now + 3600 }, SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  // El lector tolerante detecta la ausencia del claim `v` y lo lee como
  // latin1, que es como se escribió — así el nombre NO se degrada.
  assert.equal(claims.name, name);
});

test("v1 expirado se sigue rechazando", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signV1({ sub: "u-1", name: "Ana", iat: now - 7200, exp: now - 3600 }, SECRET);
  await assert.rejects(() => handeia.jwt.verify(token, SECRET));
});

test("v1 con firma alterada se sigue rechazando", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await signV1({ sub: "u-1", name: "Ana", iat: now, exp: now + 3600 }, SECRET);
  const [h, p] = token.split(".");
  await assert.rejects(() => handeia.jwt.verify(`${h}.${p}.firmaFalsa`, SECRET));
});

// ── Interoperabilidad con lectores estándar ──────────────────────────────────
// El token viaja a ACIPE (Python) y puede ser leído por jose o cualquier
// librería JWT que cumpla el RFC. Esas decodifican el payload como UTF-8.

test("v2 es legible por un decodificador UTF-8 estándar (ACIPE, jose, jwt.io)", async () => {
  const name = `Jos${String.fromCharCode(0x00e9)} ${N_TILDE}u${N_TILDE}ez ${CJK}`;
  const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
  const body = token.split(".")[1];
  // Exactamente lo que haría una librería estándar: base64url -> UTF-8 -> JSON
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.equal(payload.name, name, "un lector estándar debe ver el nombre correcto");
  assert.equal(payload.v, 2, "los tokens nuevos deben declarar su versión");
});

test("el header sigue siendo el estándar HS256/JWT", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1" }, SECRET);
  const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
  assert.deepEqual(header, { alg: "HS256", typ: "JWT" });
});

test("un payload gigante no revienta la pila", async () => {
  // bytesToB64url arma la cadena por trozos justo para esto: el spread de un
  // arreglo grande tira RangeError (el patrón que tenía el código anterior).
  const name = "á".repeat(200_000);
  const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name.length, 200_000);
});
