/**
 * Compila los estilos del agente y los deja como un módulo TypeScript.
 *
 * El CSS acaba dentro del bundle JS para que el componente pueda inyectarlo
 * solo. Si en vez de eso se publicara un .css suelto, quien instala el SDK
 * tendría que acordarse de importarlo — y el día que se le olvide, el campo
 * vuelve a verse como una caja blanca sin que entienda por qué.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const salidaTmp = join(mkdtempSync(join(tmpdir(), 'vaia-css-')), 'agent.css')

execFileSync(
  process.execPath,
  [join(raiz, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
   '-i', join(raiz, 'src/react/styles.css'),
   '-o', salidaTmp, '--minify'],
  { cwd: raiz, stdio: 'inherit' },
)

const css = readFileSync(salidaTmp, 'utf8').trim()

// Se escapan las tres cosas que romperían el template literal. Sin esto, un
// `${` dentro de una url() o de una fuente convertiría el CSS en código.
const seguro = css.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')

writeFileSync(
  join(raiz, 'src/react/styles.generated.ts'),
  `// GENERADO POR scripts/build-css.mjs — no editar a mano.\n` +
  `// Los estilos del agente, para que el componente los inyecte él mismo.\n` +
  `export const AGENT_CSS = \`${seguro}\`\n`,
  'utf8',
)

console.log(`CSS del agente: ${(css.length / 1024).toFixed(1)} KB embebidos`)
