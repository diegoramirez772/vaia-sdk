# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Este paquete sigue [SemVer](https://semver.org/lang/es/).

---

## [0.7.4] — 2026-08-01

### Corregido — el modo voz seguía encendido al reabrir el campo

Cerrar solo ocultaba: `voiceMode` se quedaba activo, así que al volver a abrir
el círculo el lienzo animado aparecía solo, como si se hubiera encendido por su
cuenta. Y peor, el dictado seguía corriendo con el micrófono abierto detrás de
un campo cerrado — lo último que debe hacer un SDK dentro de la app de otro.
Ahora cerrar deja todo como estaba al abrirlo por primera vez.

### Corregido — no se podía escribir después de una respuesta

`aiPhase` distinto de `idle` reemplaza el textarea por un estado ("Listo"), y
la fase se quedaba en `done` al terminar el turno: había que cerrar y abrir el
campo para volver a escribir. La fase vuelve a `idle` en cuanto termina; que
haya respuesta en pantalla lo dice `respuesta`, no la fase.

### Cambiado — el cursor lleva color y avatar

Puntero violeta con el avatar de la IA encima, en vez de blanco/negro plano —
se lee como una presencia moviéndose, no como una flecha decorativa. Color
fijo, no del espacio anfitrión: el cursor representa a Handeia actuando dentro
de la app de otro, y tomar el color del anfitrión lo confundiría con su UI.

---

## [0.7.3] — 2026-08-01

### Añadido — getAuthHeader, para cuando la cookie de sesión no cruza de sitio

Un espacio en otro dominio que el de Handeia nunca podía autenticarse de
verdad: `credentials: 'include'` no sirve de nada si la cookie de sesión es
`SameSite=Lax` (el default recomendado, y el que usa Handeia) — el navegador
simplemente no la manda en una petición cross-site. `getAuthHeader` le da al
turno un `Authorization` explícito en su lugar, pedido fresco en cada turno
(no se cachea, por si expira). Handeia decide qué hacer con ese header; el
SDK no sabe ni le importa si es un JWT, qué firma, o quién lo verifica.

Opcional y aditivo: sin él, el turno sigue yendo solo con la cookie — el
camino que ya funcionaba para un espacio que sí comparte sitio con Handeia.

---

## [0.7.2] — 2026-08-01

### Corregido — el blur aparecía para acciones que no necesitan texto

"Llévame a X" no es una pregunta: no hay nada que el usuario deba leer. Antes,
`turno()` siempre pasaba por `setFase('done')` con el texto puesto —aunque el
turno terminara ejecutando una acción sola, sin confirmar— y esa transición sí
llegaba a pintarse un instante, así que la pantalla se desenfocaba de la nada
en medio de una acción pura. Ahora una acción sin confirmación va directo a
`ejecutar()`, sin pasar por texto ni blur. Lo que SÍ sigue mostrando texto y
blur: una pregunta normal, una acción que requiere confirmar (hay algo que
leer antes de decidir), y un espacio que no sabe ejecutar lo que se le pidió.

---

## [0.7.1] — 2026-08-01

### Cambiado — getActionTarget ahora recibe también los argumentos

`getActionTarget?: (name, args) => HTMLElement | null`. El nombre solo no
alcanzaba para acciones sobre un elemento entre varios ("abrir la vacante 2"
necesita saber CUÁL vacante). Compatible hacia atrás: nadie lo había
implementado todavía.

### Corregido — el campo se podía quedar corto de espacio real

`ALTO_MIN` estaba en 64px — alcanza para el campo cerrado de un renglón, pero
el campo real (fila de contenido + barra de acciones + borde, con el textarea
en su máximo) mide ~220px. En una esquina apretada (círculo arrastrado cerca
del borde) el campo podía terminar necesitando más espacio del garantizado.
Subido a 240px.

### Cambiado — la respuesta vive en su propia capa, no adentro del campo

Antes la respuesta y el campo compartían el mismo contenedor flex, y el
`InputBar` dependía de que flexbox le dejara suficiente espacio. Ahora:

- La respuesta mide, con `ResizeObserver`, dónde empieza el campo AHORA MISMO
  (no un cálculo) y ocupa desde arriba de la pantalla hasta justo ahí — el
  espacio del campo nunca cuenta como disponible para ella.
- Si el texto es corto, se centra en lo que sobra arriba del campo. Si es
  largo, usa casi toda esa altura. Si no alcanza ni así, esa capa (y solo
  esa) tiene su propio scroll.
- El campo (`InputBar`) ahora está marcado `shrink-0`: nunca es él quien cede
  espacio si algo aprieta.

Las dos cosas juntas cierran el mismo problema por los dos lados: el campo
tiene garantizado su mínimo real, y aunque no lo tuviera, ya no comparte
contenedor con nada que pueda empujarlo.

---

## [0.7.0] — 2026-08-01

### Añadido — el cursor de Handeia camina hasta la acción

`HandeiaAgent` acepta `getActionTarget?: (name: string) => HTMLElement | null`.
Si el espacio declara dónde vive una acción en su propio DOM, el cursor de
Handeia camina de verdad hasta ahí (con `initial`/`animate` real, no un salto)
antes de ejecutarla, y el campo muestra "Activando '...'…" mientras tanto —
mismo lenguaje visual que usa Handeia al activar sus propios artefactos. Sin
blur de por medio: si el agente va a actuar sobre la UI, lo único que debe
verse pasar es el cursor.

Puramente opcional: un espacio que no implementa `getActionTarget` no ve
cambio ninguno, la acción se ejecuta directo como antes.

### Corregido — el campo se veía sin el borde sutil de Handeia

`input-bar.tsx` depende de `var(--field-border)`, pero el agente vive en un
Shadow DOM aislado a propósito (para no romper los estilos de quien lo
instala) y esa variable nunca se definía ahí dentro — el borde caía al valor
inicial (`currentColor`) en vez del 9%/16% de opacidad real. Se define ahora
en el propio `styles.css` del paquete, sin depender de nada externo.

### Corregido — la respuesta se sentía pegada al campo

Más separación entre la respuesta y el campo (antes casi sin aire). El límite
de altura contra el borde de pantalla (`maxAlto`) sigue igual: no se cambió
nada del clamping, solo el espacio visual.

### Corregido — "modo voz" no hacía nada

El botón de onda solo encendía el lienzo animado de fondo; el dictado real
esperaba un segundo botón aparte (el micrófono), lo que se sentía como que
el modo voz no respondía. Ahora encenderlo arranca a escuchar de una vez;
apagarlo detiene el dictado en curso.

---

### Añadido — las 7 piezas operativas

`defineCapability({ pieces })` declara skills, herramientas, workflows,
agentes, personalidades y modalidades. Se validan al declararlas y viajan en
el manifest, para que el portal pueda mostrar qué autoridad pide una capacidad
**antes** de que alguien la instale.

### Añadido — autoridad, y es obligatoria

Casi todos los SDK de agentes saben decir *"puede llamar a esta función"*.
Ninguno sabe decir *"hasta $500 solo, arriba pregunta, y nunca borrar"*. Aquí
eso no es opcional — una pieza sin autoridad declarada no compila:

- **Lo irreversible nunca puede ser autónomo.** No depende de que el modelo se
  porte bien: depende de que no se pueda declarar.
- **Gastar de forma autónoma exige tope Y moneda.** Un "500" sin moneda no
  significa nada, y adivinarla es como se pierde dinero de verdad.
- **Ninguna pieza puede superar el techo de su agente.** Sin esto se podría
  declarar un agente limitado y colarle una herramienta que hace lo que él no
  puede.
- **Una herramienta sin permiso declarado se rechaza**: sin permiso no hay a
  quién pedirle consentimiento ni a quién revocárselo.
- `checkAuthority()` revisa además la ejecución concreta, incluyendo que no se
  comparen montos de monedas distintas.

### Añadido — evidencia

`EvidencePolicy` permite exigir que una afirmación venga respaldada. Un
asistente que no puede decir de dónde sacó algo es un oráculo, y un oráculo no
se audita ni se corrige.

### Añadido — puente MCP en dos direcciones

MCP aporta catálogo y transporte; VAIA aporta la autoridad que MCP no sabe
expresar.

- `fromMCPTool()` importa una herramienta MCP, pero **la autoridad se asigna
  aparte y es obligatoria**: importar algo de internet no debería concederle
  permisos por el hecho de importarlo. Las pistas del servidor solo sirven para
  avisar de incoherencias, nunca para decidir.
- `toMCPTool()` publica hacia MCP, y **omite lo que requiere aprobación o está
  prohibido**: exponerlo sería ofrecerle a un agente externo algo que ni el
  propio dueño puede ejecutar solo.

### Añadido — conectores prestados

El espacio declara `needs: ['github', 'drive']` y pide operaciones; **jamás
recibe el token del usuario**. Si cada espacio guardara tokens, la superficie
de ataque se multiplicaría por cada desarrollador que publique. Solo lectura,
lista cerrada de operaciones, y revocable por espacio.

### Añadido — `npx vaia init`

Deja una capacidad declarada y lista, sin cuenta, sin claves y sin red. Lo que
genera **pasa la validación de autoridad**, así que el ejemplo enseña la regla
en vez de enseñar el atajo.

### Corregido — SEGURIDAD: el probe saltaba la verificación de firma

`gandia.verify()` y `handeia.verify()` atendían el probe de salud **antes** de
validar el HMAC. Cualquiera en internet podía mandar `x-gandia-probe: 1` (o el
de Handeia) y hacer correr el endpoint del desarrollador sin autenticarse.

El portal ya firmaba sus probes y ni siquiera mandaba esa cabecera, así que era
código muerto que solo servía de puerta trasera. Exigir la firma no rompe a
ningún consumidor.

### Corregido — hex permisivo en la verificación de firmas

`hexToBytes` usaba `parseInt`, que ante basura devuelve `NaN` y dejaba un cero
silencioso. Una firma con caracteres inválidos se convertía en bytes en vez de
rechazarse. Ahora valida que sea hexadecimal de verdad.

---

## [0.4.0] — 2026-07-31

### Añadido — `@vaia-lab/sdk/react` con EL MISMO campo de Handeia

`HandeiaAgent` monta el círculo y el campo del asistente dentro de un espacio
de terceros. No es una imitación: el `InputBar` es una copia directa del de
Handeia, con un único cambio —el hook de tema, que dependía del proveedor de
la app y aquí se resuelve leyendo el documento.

Se copia en vez de reescribirse a propósito. Una versión "equivalente" se
desviaría del original en cuanto alguien lo tocara, y entonces el agente
dejaría de sentirse Handeia — que es justo el punto de ponerlo en un espacio
ajeno.

Misma mecánica que el original: el círculo se arrastra, se acota a lo que de
verdad se ve (`visualViewport`, porque las barras del navegador se comen alto
en móvil), y al soltarlo sin moverlo abre el campo hacia el lado donde hay
espacio. La respuesta va centrada y sin tarjeta: la pantalla se transforma, no
se abre un chat.

### Quitado — `mountAgent()` en HTML plano

Era el enfoque equivocado. Se justificó con "cero dependencias", pero el
resultado era una copia peor del campo real que además se iba a desviar. Vive
ahora en el subpath `react`, con React, motion y lucide como **peer
dependencies opcionales**: el núcleo sigue sin una sola línea de React, y
quien solo quiere la capa de autoridad no carga nada de eso.

---

## [0.3.0] — 2026-07-31

### Añadido — superficie de AGENTE (VAIA Extension Protocol)

Permite que el asistente de Handeia viva dentro de un espacio de terceros.
El reparto: **el espacio pone la superficie y las manos, Handeia pone el
cerebro, la memoria y la autoridad.**

Por eso un espacio no trae su propia IA. Si la trajera no conocería al
usuario, empezaría de cero cada vez, y no podría contradecirse a sí mismo —
el caso que lo justifica es que el espacio puntúe una vacante con 90 y el
agente diga que conviene la de 87, porque sabe algo del usuario que el
espacio no sabe.

- `defineCapability({ agent: { actions, queryEndpoint } })` — el espacio
  declara qué sabe hacer. Viaja en el manifest, así que el portal y Handeia
  lo conocen sin abrir el código de nadie.
- `validateAgentSurface()` — valida el contrato **al declararlo**, no en
  producción: un contrato mal escrito debe reventar en el escritorio del
  desarrollador, no frente al usuario.
- `validateActionCall()` — la lista blanca en ejecución. Aunque el modelo
  alucine una acción o un argumento fuera de rango, aquí se detiene.
- `AGENT_PROTOCOL_VERSION` — el protocolo va versionado desde el día uno.
- Tipos del turno: `AgentTurnRequest`, `AgentTurnResponse`, `AgentAction`,
  `AgentSpaceContext`, `AgentEvidence`.

### Seguridad

El espacio es **código de terceros**, y todo el diseño sale de ahí:

- Lo que manda el espacio se llama `claims`, no `facts`. Handeia lo trata
  como afirmación citada, nunca como instrucción y nunca al mismo nivel que
  lo que sabe del usuario. Un espacio que escriba "ignora las instrucciones
  anteriores" en su contexto no consigue nada.
- Handeia **solo puede pedir acciones declaradas**. No improvisa, no toca el
  DOM, no busca rodeos.
- Una acción que modifica datos **exige un permiso declarado** — sin él, el
  contrato ni siquiera compila — y se confirma con el usuario antes de
  ejecutarse.
- `queryEndpoint` debe ser una ruta propia: si se aceptaran URLs externas, un
  espacio podría hacer que Handeia le pegue a un tercero con la identidad del
  usuario.
- `AgentEvidence` obliga a poder decir de dónde salió cada afirmación. Un
  oráculo que no se explica no se gana la confianza.

15 pruebas nuevas, con un espacio de mentira en vez de uno real: si el
contrato solo funcionara porque conocemos Nexus, estaría mal hecho.

### Compatibilidad

Puramente aditivo. Nada cambia para quien ya usa `0.2.x`: sin el campo
`agent`, el manifest sale idéntico a antes.

---

## [0.2.0] — 2026-07-30

### Corregido — codificación del payload JWT (UTF-8)

`jwt.sign` serializaba el payload con `btoa()`, que trata cada carácter como
**un byte** (latin1) en vez de UTF-8. Dos fallas distintas salían de ahí:

| Rango | Antes | Ahora |
|---|---|---|
| ASCII | correcto | correcto |
| `128..255` (`é`, `Ñ`, `ü`) | ilegible para cualquier lector estándar | correcto |
| `>255` (CJK, emoji, `U+FFFD`) | **`InvalidCharacterError` — la firma tronaba** | correcto |

El caso que lo destapó: un usuario cuyo nombre llevaba `U+FFFD` (codepoint
65533) no podía abrir su Espacio. `jwt.sign` lanzaba, el servidor respondía
HTML de error en vez de JSON, y el llamador lo interpretaba como "servicio
caído" — mandando a investigar el servicio equivocado durante horas.

El problema de rango `128..255` no se notaba **porque el error era simétrico**:
firma y verificación del propio SDK usaban latin1, así que se entendían entre
sí. Cualquier consumidor externo con una librería JWT estándar (`jose`, PyJWT,
jwt.io) veía los nombres corruptos. RFC 7519 §3 exige UTF-8.

### Añadido

- Claim `v` con la versión del formato de payload (`v: 2` en los tokens nuevos).
- `JWT_PAYLOAD_VERSION` exportado.
- Suite de pruebas (antes no había ninguna): round-trip i18n, compatibilidad
  v1→v2, interoperabilidad con decodificadores estándar, y casos de seguridad
  (firma alterada, payload alterado, secreto distinto, expiración).

### Compatibilidad

**Los tokens v1 se siguen aceptando.** `jwt.verify` detecta la ausencia del
claim `v` y decodifica en latin1, que es como se escribieron — así un token
viejo con `Ñ` conserva su significado original en vez de degradarse.

No hay ventana de invalidez: la firma HMAC se calcula sobre el texto que viaja
en el token, no re-serializando el payload, de modo que actualizar el firmante
y el verificador en momentos distintos **no invalida nada**.

Orden de despliegue recomendado:

1. **Verificadores primero** (Nexus y cualquiera que llame `jwt.verify`).
2. Esperar el TTL de los tokens en vuelo (1 h por defecto).
3. **Firmantes después** (Gandia-7).

### Por qué 0.2.0 y no 0.1.4

Los consumidores tienen `^0.1.3`, que en el rango `0.x` **no** sube a `0.2.0`.
El salto de minor es deliberado: cambia el formato del cable, así que cada
consumidor debe optar por la nueva versión conscientemente, en el orden de
arriba, en vez de recibirla sola en el próximo `npm install`.

### Migración

```bash
npm install @vaia-lab/sdk@^0.2.0
```

Sin cambios de API. Si tu código decodificaba el payload por su cuenta con
`atob()`, cámbialo a UTF-8 (`Buffer.from(body, 'base64url').toString('utf8')`)
o usa `jwt.verify`.

---

## [0.1.0] — 2026

Primera versión pública: `gandia.jwt`, `handeia.jwt`, cliente, CLI.
