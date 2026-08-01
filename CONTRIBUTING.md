# Contribuir

Gracias por querer ayudar. Este SDK es la superficie pública del ecosistema
VAIA: lo que se abre es **la forma de declarar capacidades y agentes
responsables**, no los motores que los ejecutan.

## Arrancar

```bash
npm install
npm test        # construye y corre todo
```

Sin dependencias de terceros, y así se queda. Si tu cambio necesita una,
plantéalo primero en un issue.

## Antes de mandar un PR

- `npm test` en verde. Las pruebas corren también antes de publicar.
- Si tocas algo de seguridad —firmas, autoridad, permisos— **añade la prueba
  que demuestre que el caso peligroso se rechaza.** Aquí se prueba sobre todo
  lo que NO debe poder hacerse.
- Los comentarios explican **por qué**, no qué. Si un comentario se puede
  deducir leyendo la línea de abajo, sobra.

## Qué no aceptamos

- Nada que describa la arquitectura interna de los motores. El SDK explica lo
  que él hace, no cómo está armado el backend.
- Relajar una regla de autoridad "porque es más cómodo". Que lo irreversible no
  pueda ser autónomo es intencional.

## Reportar seguridad

No abras un issue. Ver [SECURITY.md](./SECURITY.md).
