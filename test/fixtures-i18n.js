// Datos de prueba i18n canónicos del ecosistema VAIA.
//
// Existen porque el bug de codificación del JWT llegó a producción por una
// razón simple: NINGUNA prueba, en ningún producto, usó jamás un nombre con
// acento. Todo el equipo se llama con ASCII.
//
// Regla: cualquier producto que maneje nombres de usuario (Gandia, Handeia,
// Nexus, ACIPE) debe incluir estos casos en sus pruebas. Si algo se rompe con
// USUARIO_CANONICO, se va a romper con un estudiante real de la UTD.
//
// Construidos por codepoint a propósito: si alguna herramienta reescribe este
// archivo con otra codificación, los valores no cambian en silencio — que es
// exactamente el accidente que causó el incidente original.

const N_MAYUS = String.fromCharCode(0x00d1); // Ñ
const N_MINUS = String.fromCharCode(0x00f1); // ñ
const E_ACUTE = String.fromCharCode(0x00e9); // é
const A_ACUTE = String.fromCharCode(0x00e1); // á
const U_DIERE = String.fromCharCode(0x00fc); // ü
const CJK_BEI = String.fromCharCode(0x5317); // 北
const CJK_JING = String.fromCharCode(0x4eac); // 京
const EMOJI_FIESTA = String.fromCodePoint(0x1f389); // 🎉
const REEMPLAZO = String.fromCharCode(0xfffd); // � (bytes ya rotos)

/** El nombre que debe sobrevivir a todo el sistema, de punta a punta. */
export const USUARIO_CANONICO = `Jos${E_ACUTE} ${N_MAYUS}u${N_MINUS}ez ${CJK_BEI}${CJK_JING} ${EMOJI_FIESTA}`;

export const NOMBRES = {
  /** Control: lo único que se probaba antes. */
  ascii: "DERIAN GONZALEZ",
  /** Apellido real de un estudiante — el caso que destapó el bug. */
  apellidoConTilde: `IGNACIO QUI${N_MAYUS}ONES CERVANTES`,
  /** Rango latin1: se deformaba para lectores estándar. */
  acentos: `Jos${E_ACUTE} P${E_ACUTE}rez Mu${N_MINUS}oz`,
  diereses: `J${U_DIERE}rgen M${U_DIERE}ller`,
  /** Fuera de latin1: hacía LANZAR a btoa(). */
  cjk: `${CJK_BEI}${CJK_JING} Ana`,
  /** Fuera del BMP (par sustituto). */
  emoji: `Fiesta ${EMOJI_FIESTA}`,
  /** Ya corrupto de origen: lo que Google mandó del estudiante. */
  yaRoto: `QUI${REEMPLAZO}ONES`,
  /** Todo junto. */
  mezcla: USUARIO_CANONICO,
  /** Bordes que suelen olvidarse. */
  vacio: "",
  soloEspacios: "   ",
  muyLargo: `${A_ACUTE}`.repeat(10_000),
};

/** Solo los que deben conservarse intactos (excluye vacíos y lo ya corrupto). */
export const NOMBRES_VALIDOS = Object.entries(NOMBRES)
  .filter(([k]) => !["vacio", "soloEspacios", "yaRoto"].includes(k))
  .map(([k, v]) => [k, v]);
