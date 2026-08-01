/**
 * Superficie React del SDK.
 *
 * Va en un subpath aparte (`@vaia-lab/sdk/react`) para que el núcleo siga en
 * cero dependencias: quien no quiera el círculo no carga React, motion ni
 * lucide. Y quien lo quiera, obtiene EL MISMO campo que hay dentro de Handeia
 * — no una imitación que se desviaría en cuanto alguien toque el original.
 */
export { HandeiaAgent } from './agent.js'
export type { HandeiaAgentProps } from './agent.js'
export { InputBar, VoiceCanvas, MODELS } from './input-bar.js'
export type { InputBarProps, InputBarConnector } from './input-bar.js'
