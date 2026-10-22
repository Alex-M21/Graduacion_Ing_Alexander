# Factibilidad: GitHub Pages y Drive

La combinación es viable para esta graduación **con un servidor adicional**. GitHub Pages solo publica archivos estáticos; no puede guardar registros privados ni utilizar de forma segura credenciales de Google. La implementación separa la página pública del servidor que verifica pases, cifra CUI y gestiona el almacenamiento.

| Parte | Implementación | Estado |
|---|---|---|
| Diseño y registro | HTML, CSS y JavaScript sin dependencias; gris, naranja y blanco | Implementado y probado en móvil/escritorio |
| Sitio estático | `docs/` + workflow de GitHub Pages | Preparado para publicar en el repositorio |
| Registro | Tres campos, consentimiento y un botón; sin cuenta de Google o ChatGPT | Operativo en el servidor |
| Álbum | Fotos y videos; lectura/subida para confirmados el día del evento; sin borrar | Operativo |
| Drive | API de Drive con autorización del propietario, carpeta privada y hoja privada de invitados | Código preparado; pendiente de autorización de Google |
| Almacenamiento previo | D1 y R2 | Se conserva hasta conectar Drive; las copias anteriores se mantienen |

## Decisión

Se conserva el servidor existente de Sites para no poner secretos en GitHub Pages ni exigir una cuenta a los invitados. Pages aloja exclusivamente la interfaz y llama a ese servidor con CORS limitado a `https://alex-m21.github.io`. La carpeta `docs/` nunca contiene nombres, correos, CUI, fotos privadas ni claves.

Drive será el destino de los archivos y de una copia completa del listado en Sheets. La base D1 seguirá guardando la información necesaria para permisos, búsquedas y reintentos. No se afirma que Drive esté conectado hasta verificar la autorización y completar la sincronización.

Usar únicamente Pages y un enlace a una carpeta de Drive no satisface el registro privado ni la regla de permitir subidas sin dar permisos para borrar. Tampoco se recomienda que cada invitado deba iniciar sesión con Google para subir archivos.

La autorización de Google se completa siguiendo [la guía de conexión](integrations/google-apps-script/README.md). No requiere una carpeta pública ni compartir contraseñas.

Referencias: [qué es GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [workflows de Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Drive y cuentas de servicio](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).
