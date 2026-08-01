# Política de seguridad

Este SDK maneja firmas HMAC, identidad de usuarios y autoridad delegada a
agentes. Un fallo aquí no rompe una función: deja entrar a alguien.

## Reportar una vulnerabilidad

**No abras un issue público.** Escribe a **hello@vaia.dev** con el asunto
`[security] @vaia-lab/sdk`.

Incluye qué versión usas, cómo reproducirlo y qué impacto le ves. Te
respondemos en un plazo de 72 horas hábiles y te mantenemos al tanto hasta
que esté cerrado.

## Versiones con soporte

| versión | soporte |
|---------|---------|
| 0.3.x   | ✅ |
| 0.2.x   | correcciones de seguridad únicamente |
| < 0.2   | ❌ — actualiza |

## Lo que el SDK garantiza

- **Verificación en tiempo constante.** Las firmas se comparan con Web Crypto,
  no con comparación de cadenas, para no filtrar información por temporización.
- **El probe de salud exige firma.** Hasta la 0.2.x se atendía antes de validar
  el HMAC, lo que permitía ejecutar el endpoint del desarrollador sin
  autenticarse. Corregido en 0.3.0.
- **Ventana de ±5 minutos** en el `timestamp` firmado.
- **Autoridad obligatoria.** Una acción irreversible no puede declararse
  autónoma, y gastar de forma autónoma exige tope y moneda. La validación
  ocurre al declarar, no en producción.
- **Importar de MCP no concede permisos.** La autoridad se asigna aparte,
  siempre.

## Lo que le toca a quien lo usa

Estas cosas el SDK **no** puede resolver por ti, y conviene que las sepas:

- **Repetición de peticiones.** El `timestamp` acota la ventana a 5 minutos,
  pero el SDK no guarda estado, así que **no lleva registro de los `call_id`
  ya vistos**. Si te importa que una petición capturada no pueda repetirse
  dentro de esa ventana, guarda los `call_id` atendidos y descarta duplicados.
- **Custodia del secreto.** `KEY_SECRET` vive solo en tu servidor. Si aparece
  en el navegador, en un repo o en un registro, cámbialo de inmediato.
- **Rotación.** El SDK no rota claves por ti.
- **Límite de frecuencia** en tus propios endpoints.

## Fuera de alcance

- Vulnerabilidades de dependencias tuyas, no del SDK (no tiene ninguna).
- Ataques que requieran acceso previo a tu servidor o a tu `KEY_SECRET`.
