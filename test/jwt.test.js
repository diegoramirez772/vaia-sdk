// Contrato de codificación del JWT — pruebas de la API PÚBLICA (lo que de
// verdad consumen Gandia, Nexus y los desarrolladores externos), no de los
// internos.
//
// Por qué existe este archivo: un estudiante no podía entrar a su Espacio
// porque su apellido llevaba Ñ. b64urlEncode usaba btoa(), que trata cada
// carácter como un byte — o sea latin1, no UTF-8. Todo lo de 128..255 salía
// deformado y todo lo de >255 LANZABA excepción. Ninguna prueba había usado
// jamás un nombre con acento, así que el bug vivió hasta producción.
//
// Sin dependencias: runner nativo de node:test, igual que el SDK, que presume
// de no tener dependencias de terceros.

import test from "node:test";
import assert from "node:assert/strict";
import { handeia, gandia } from "../dist/index.js";

const SECRET = "secreto-de-prueba-no-usar-en-produccion";

// Nombres construidos por codepoint para que ninguna herramienta que reescriba
// este archivo pueda alterarlos silenciosamente (justo el tipo de accidente que
// causó el bug original).
const N_TILDE = String.fromCharCode(0x00d1); // Ñ  — dentro de latin1
const E_ACUTE = String.fromCharCode(0x00e9); // é  — dentro de latin1
const CJK = String.fromCharCode(0x5317); // 北 — FUERA de latin1
const EMOJI = String.fromCodePoint(0x1f389); // 🎉 — fuera del plano básico
const REPLACEMENT = String.fromCharCode(0xfffd); // �  — el que tenía el usuario

const CASOS = [
  ["ascii puro", "DERIAN GONZALEZ"],
  ["latin1: N con tilde", `IGNACIO QUI${N_TILDE}ONES`],
  ["latin1: e acentuada", `Jos${E_ACUTE} P${E_ACUTE}rez`],
  ["fuera de latin1: CJK", `${CJK}${CJK} Ana`],
  ["fuera del BMP: emoji", `Fiesta ${EMOJI}`],
  ["caracter de reemplazo", `QUI${REPLACEMENT}ONES`],
  ["mezcla completa", `Jos${E_ACUTE} ${N_TILDE}u${N_TILDE}ez ${CJK} ${EMOJI}`],
];

for (const [etiqueta, name] of CASOS) {
  test(`handeia: el nombre sobrevive intacto — ${etiqueta}`, async () => {
    const token = await handeia.jwt.sign({ sub: "u-1", email: "a@b.test", name }, SECRET);
    const claims = await handeia.jwt.verify(token, SECRET);
    assert.equal(
      claims.name,
      name,
      `el nombre se deformó al pasar por el JWT (codificación no UTF-8)`,
    );
  });
}

test("gandia: el mismo contrato aplica al lado institucional", async () => {
  const name = `Jos${E_ACUTE} ${N_TILDE}u${N_TILDE}ez`;
  const token = await gandia.jwt.sign(
    { sub: "u-1", tenantId: "t-1", role: "admin", name },
    SECRET,
  );
  const claims = await gandia.jwt.verify(token, SECRET);
  assert.equal(claims.name, name);
});

test("el token es un JWT bien formado (3 partes)", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: `${N_TILDE}` }, SECRET);
  assert.equal(token.split(".").length, 3);
});

test("una firma alterada se rechaza", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: "Ana" }, SECRET);
  const [h, p] = token.split(".");
  await assert.rejects(() => handeia.jwt.verify(`${h}.${p}.firmaFalsa`, SECRET));
});

test("un payload alterado invalida la firma", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: "Ana" }, SECRET);
  const [h, , s] = token.split(".");
  const otro = Buffer.from(JSON.stringify({ sub: "atacante" })).toString("base64url");
  await assert.rejects(() => handeia.jwt.verify(`${h}.${otro}.${s}`, SECRET));
});

test("un secreto distinto no verifica", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: "Ana" }, SECRET);
  await assert.rejects(() => handeia.jwt.verify(token, "otro-secreto"));
});

test("un token expirado se rechaza", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: "Ana" }, SECRET, { expiresIn: -10 });
  await assert.rejects(() => handeia.jwt.verify(token, SECRET));
});

test("un token malformado se rechaza sin reventar", async () => {
  await assert.rejects(() => handeia.jwt.verify("no-es-un-jwt", SECRET));
});

test("fromUrl extrae y verifica el token de la URL", async () => {
  const name = `QUI${N_TILDE}ONES`;
  const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
  const url = `https://nexus.handeia.com/api/auth/handoff?handeia_token=${encodeURIComponent(token)}`;
  const claims = await handeia.jwt.fromUrl(url, SECRET);
  assert.equal(claims.name, name);
});
