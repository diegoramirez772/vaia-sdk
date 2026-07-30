// Guardián de la clase de bug, no del caso.
//
// Las pruebas de arriba verifican COMPORTAMIENTO. Esta verifica la REGLA:
// que nadie vuelva a aplicar btoa()/atob() sobre texto en el código fuente.
//
// Es deliberadamente un test y no una regla de ESLint: el SDK no tiene
// ESLint, y una prueba corre en `npm test` y en `prepublishOnly` — o sea que
// bloquea la publicación, que es donde de verdad importa.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function archivosTs(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return archivosTs(p);
    return n.endsWith(".ts") ? [p] : [];
  });
}

// btoa/atob son válidos SOBRE BYTES (una firma, un buffer). Lo prohibido es
// usarlos sobre texto, que es donde asumen latin1 y rompen el UTF-8. En
// jwt-utils están encapsulados en bytesToB64url/b64urlToBytes, que solo tocan
// Uint8Array — cualquier uso NUEVO fuera de ahí debe justificarse.
const PERMITIDOS = new Set(["jwt-utils.ts"]);

test("nadie usa btoa/atob fuera del encapsulado de bytes", () => {
  const infractores = [];
  for (const archivo of archivosTs(SRC)) {
    const nombre = archivo.split("/").pop();
    if (PERMITIDOS.has(nombre)) continue;
    const src = readFileSync(archivo, "utf8");
    src.split("\n").forEach((linea, i) => {
      if (/\b(btoa|atob)\s*\(/.test(linea)) {
        infractores.push(`${nombre}:${i + 1} -> ${linea.trim()}`);
      }
    });
  }
  assert.deepEqual(
    infractores,
    [],
    "btoa/atob asumen latin1 y corrompen UTF-8. Usa TextEncoder/TextDecoder, " +
      "o encapsúlalos sobre Uint8Array como en jwt-utils.ts.",
  );
});

test("el payload del JWT se serializa con TextEncoder, no con btoa directo", () => {
  const src = readFileSync(join(SRC, "jwt-utils.ts"), "utf8");
  assert.match(src, /TextEncoder/, "jwt-utils debe codificar texto con TextEncoder");
  assert.match(
    src,
    /new TextDecoder\('utf-8', \{ fatal: true \}\)/,
    "la lectura estricta debe LANZAR ante bytes inválidos, no meter U+FFFD en silencio",
  );
});
