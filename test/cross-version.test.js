// Contract test entre versiones — valida la VENTANA DE DESPLIEGUE.
//
// Los unit tests prueban que el código nuevo funciona. Esto prueba algo
// distinto y más peligroso: qué pasa cuando media flota ya se actualizó y la
// otra media no. Es lo único que justifica el orden "verificadores primero"
// con evidencia en vez de intuición.
//
// El firmante v1 se reimplementa aquí congelado. NO se importa del SDK a
// propósito: es el formato histórico, y si el SDK cambia esta referencia debe
// quedarse igual.

import test from "node:test";
import assert from "node:assert/strict";
import { handeia } from "../dist/index.js";
import { NOMBRES } from "./fixtures-i18n.js";

const SECRET = "secreto-de-prueba-no-usar-en-produccion";

/** Firmante v1 congelado: btoa() sobre texto, sin claim `v`. */
async function firmarV1(payload, secret) {
  const b64 = (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64(String.fromCharCode(...new Uint8Array(sig)))}`;
}

const conExp = (p) => {
  const now = Math.floor(Date.now() / 1000);
  return { ...p, iat: now, exp: now + 3600 };
};

test("ventana: token v1 ASCII verificado por el SDK nuevo", async () => {
  const token = await firmarV1(conExp({ sub: "u-1", name: NOMBRES.ascii }), SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name, NOMBRES.ascii);
});

test("ventana: token v1 con Ñ conserva su significado en el SDK nuevo", async () => {
  // Este es el caso que haría daño si el lector nuevo no fuera tolerante:
  // se leería como UTF-8 y saldría basura, o peor, se rechazaría.
  const token = await firmarV1(conExp({ sub: "u-1", name: NOMBRES.apellidoConTilde }), SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name, NOMBRES.apellidoConTilde);
});

test("ventana: token v1 con acentos varios sobrevive", async () => {
  const token = await firmarV1(conExp({ sub: "u-1", name: NOMBRES.acentos }), SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name, NOMBRES.acentos);
});

test("ventana: el SDK nuevo marca sus tokens con v=2 para que sean distinguibles", async () => {
  const nuevo = await handeia.jwt.sign({ sub: "u-1", name: NOMBRES.ascii }, SECRET);
  const viejo = await firmarV1(conExp({ sub: "u-1", name: NOMBRES.ascii }), SECRET);
  const leer = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString("latin1"));
  assert.equal(leer(nuevo).v, 2);
  assert.equal(leer(viejo).v, undefined, "los tokens v1 no llevan versión: su ausencia ES la versión");
});

test("ventana: la seguridad no se relaja para tokens v1", async () => {
  const expirado = await firmarV1(
    { sub: "u-1", name: "Ana", iat: 0, exp: Math.floor(Date.now() / 1000) - 60 },
    SECRET,
  );
  await assert.rejects(() => handeia.jwt.verify(expirado, SECRET), /expirado/i);

  const token = await firmarV1(conExp({ sub: "u-1", name: "Ana" }), SECRET);
  await assert.rejects(() => handeia.jwt.verify(token, "otro-secreto"));

  const [h, p] = token.split(".");
  await assert.rejects(() => handeia.jwt.verify(`${h}.${p}.firmaFalsa`, SECRET));
});
