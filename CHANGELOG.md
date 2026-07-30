# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Este paquete sigue [SemVer](https://semver.org/lang/es/).

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
