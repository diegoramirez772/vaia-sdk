// El guardián. Corre los datos i18n canónicos contra la API pública.
//
// Si alguien vuelve a meter btoa()/atob() sobre texto, o cualquier otra
// codificación que no sea UTF-8, estas pruebas se ponen rojas antes de que
// el cambio llegue a un estudiante.

import test from "node:test";
import assert from "node:assert/strict";
import { handeia, gandia } from "../dist/index.js";
import { NOMBRES, NOMBRES_VALIDOS, USUARIO_CANONICO } from "./fixtures-i18n.js";

const SECRET = "secreto-de-prueba-no-usar-en-produccion";

for (const [etiqueta, name] of NOMBRES_VALIDOS) {
  test(`i18n handeia: ${etiqueta} sobrevive el round-trip`, async () => {
    const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
    const claims = await handeia.jwt.verify(token, SECRET);
    assert.equal(claims.name, name);
  });

  test(`i18n handeia: ${etiqueta} es legible por un lector estándar`, async () => {
    const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    assert.equal(payload.name, name);
  });
}

test("i18n gandia: el usuario canónico sobrevive con contexto institucional", async () => {
  const token = await gandia.jwt.sign(
    { sub: "u-1", tenantId: "utd", role: "estudiante", name: USUARIO_CANONICO },
    SECRET,
  );
  const claims = await gandia.jwt.verify(token, SECRET);
  assert.equal(claims.name, USUARIO_CANONICO);
});

test("i18n: un nombre ya corrupto se transporta tal cual, sin tumbar la firma", async () => {
  // El SDK NO limpia: transportar es su trabajo. Sanear le toca a quien
  // construye la identidad (Handeia lo hace en lib/text.ts). Lo que sí es
  // obligatorio es que un dato feo nunca IMPIDA entrar — que es lo que pasaba.
  const token = await handeia.jwt.sign({ sub: "u-1", name: NOMBRES.yaRoto }, SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name, NOMBRES.yaRoto);
});

test("i18n: nombre vacío o solo espacios no rompe nada", async () => {
  for (const name of [NOMBRES.vacio, NOMBRES.soloEspacios]) {
    const token = await handeia.jwt.sign({ sub: "u-1", name }, SECRET);
    const claims = await handeia.jwt.verify(token, SECRET);
    assert.equal(claims.name, name);
  }
});

test("i18n: un nombre muy largo no revienta la pila", async () => {
  const token = await handeia.jwt.sign({ sub: "u-1", name: NOMBRES.muyLargo }, SECRET);
  const claims = await handeia.jwt.verify(token, SECRET);
  assert.equal(claims.name, NOMBRES.muyLargo);
});
