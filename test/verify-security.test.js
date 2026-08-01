// Seguridad de verify() — lo que NO se debe poder hacer.
//
// Estas pruebas existen por un agujero real: el "probe" de salud se atendía
// ANTES de validar la firma, así que cualquiera en internet podía mandar
// `x-gandia-probe: 1` (o el de Handeia) y hacer correr el endpoint del
// desarrollador sin autenticarse. Aquí queda fijado que eso ya no pasa.

import test from "node:test";
import assert from "node:assert/strict";
import { gandia, handeia } from "../dist/index.js";

const SECRETO = "secreto-de-prueba-no-usar-en-produccion";

async function firmar(secreto, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Petición como la que manda la plataforma. */
async function peticion({ plataforma, body = {}, firmada = true, probe = false, ts = Date.now(), secreto = SECRETO }) {
  const crudo = JSON.stringify(body);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (probe) headers.set(`x-${plataforma}-probe`, "1");
  if (firmada) {
    headers.set(`x-${plataforma}-signature`, `sha256=${await firmar(secreto, `${ts}.${crudo}`)}`);
    headers.set(`x-${plataforma}-timestamp`, String(ts));
  }
  return new Request("https://ejemplo.test/api/invoke", { method: "POST", headers, body: crudo });
}

for (const [nombre, mod, plataforma] of [["gandia", gandia, "gandia"], ["handeia", handeia, "handeia"]]) {
  test(`${nombre}: un probe SIN firma se rechaza`, async () => {
    // El agujero original. Sin esto, el endpoint del desarrollador corría
    // para cualquiera que supiera el nombre de la cabecera.
    const req = await peticion({ plataforma, firmada: false, probe: true });
    await assert.rejects(() => mod.verify(req, SECRETO), e => e.code === "MISSING_AUTH_HEADERS");
  });

  test(`${nombre}: un probe CON firma válida sí se atiende`, async () => {
    // El probe sigue sirviendo para lo suyo: solo hay que demostrar quién eres.
    const req = await peticion({ plataforma, probe: true });
    const { ctx } = await mod.verify(req, SECRETO);
    assert.equal(ctx.capability_id, "__probe__");
  });

  test(`${nombre}: una petición sin firma se rechaza`, async () => {
    const req = await peticion({ plataforma, firmada: false });
    await assert.rejects(() => mod.verify(req, SECRETO));
  });

  test(`${nombre}: una firma de OTRO secreto se rechaza`, async () => {
    const req = await peticion({ plataforma, secreto: "otro-secreto" });
    await assert.rejects(() => mod.verify(req, SECRETO), e => e.code === "HMAC_INVALID");
  });

  test(`${nombre}: un timestamp viejo se rechaza (anti-repetición)`, async () => {
    const req = await peticion({ plataforma, ts: Date.now() - 10 * 60 * 1000 });
    await assert.rejects(() => mod.verify(req, SECRETO), e => e.code === "TIMESTAMP_OUT_OF_RANGE");
  });

  test(`${nombre}: un cuerpo alterado invalida la firma`, async () => {
    const ts = Date.now();
    const sig = await firmar(SECRETO, `${ts}.${JSON.stringify({ a: 1 })}`);
    const req = new Request("https://ejemplo.test/api/invoke", {
      method: "POST",
      headers: new Headers({
        [`x-${plataforma}-signature`]: `sha256=${sig}`,
        [`x-${plataforma}-timestamp`]: String(ts),
      }),
      body: JSON.stringify({ a: 2 }), // ← cambiado después de firmar
    });
    await assert.rejects(() => mod.verify(req, SECRETO), e => e.code === "HMAC_INVALID");
  });

  test(`${nombre}: una firma que no es hex se rechaza sin reventar`, async () => {
    // hexToBytes es estricto: antes parseInt convertía la basura en ceros
    // silenciosos en vez de rechazarla.
    const ts = Date.now();
    const req = new Request("https://ejemplo.test/api/invoke", {
      method: "POST",
      headers: new Headers({
        [`x-${plataforma}-signature`]: "sha256=no-es-hexadecimal-!!",
        [`x-${plataforma}-timestamp`]: String(ts),
      }),
      body: "{}",
    });
    await assert.rejects(() => mod.verify(req, SECRETO), e => e.code === "HMAC_INVALID");
  });
}
