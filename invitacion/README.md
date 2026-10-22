# Invitación web · Alexander Mejía

Diseño en azul marino, dorado y marfil, inspirado en la invitación proporcionada por la Facultad de Ingeniería, para la graduación del **28 de octubre de 2026, 10:00 a. m.**, en el **Auditorio Francisco Vela, Campus Central, zona 12, cerca del edificio T3**.

## Experiencia

- Confirmación directa en una sola pantalla: nombre completo, correo, CUI y consentimiento. Sin crear una cuenta ni elegir pasos adicionales.
- Registro cifrado en el servidor y pase privado de recuperación. El CUI se valida por formato, sin consultar RENAP ni acreditar identidad.
- Álbum de fotos y videos desde el 28 de octubre a las 00:00, hora de Guatemala, solo para invitados confirmados. Cada cuenta de invitado puede compartir hasta 50 archivos, seleccionando hasta 10 por envío.
- Fotos JPG/PNG/WebP de hasta 8 MB en el servidor; el navegador convierte originales de hasta 20 MB a JPEG y elimina sus metadatos. Videos MP4/MOV/WebM de hasta 50 MB, con progreso de subida y reproducción por rangos. La reproducción depende del códec del navegador.
- Galería con filtros, paginación y vista ampliada; sin opciones para editar ni borrar. Las rutas del servidor también rechazan esas operaciones.
- Listado y conexión de Drive reservados al correo del organizador, autenticado por Sites. Los invitados no necesitan ChatGPT ni Google.

## GitHub Pages y Drive

La interfaz pública usa HTML/CSS/JavaScript sin dependencias y está preparada en `../docs/`. El servidor de Sites mantiene permisos, cifrado, registro y archivos privados. Pages no ejecuta ese servidor ni contiene los datos de los invitados.

La integración con Drive está implementada, pero se activa únicamente después de autorizarla en Google y conectar sus datos desde el panel privado. No se ha conectado automáticamente por escribir un correo de Gmail ni por compartir una carpeta.

- [Evaluación de factibilidad](ARQUITECTURA.md)
- [Guía para conectar Drive](integrations/google-apps-script/README.md)
- Panel privado: `/admin` en el servidor de Sites.

Con Drive activo, las nuevas fotos y videos se guardan privados en tu Drive y el listado se copia a Google Sheets. D1 conserva la base operativa y los reintentos pendientes. El panel migra las subidas anteriores sin borrar los respaldos de R2. Si falla una copia de registro a Drive, el registro y su pase se entregan al invitado y el organizador puede reintentar la sincronización.

La conexión usa una implementación de Google Apps Script de tu propiedad, protegida por una clave privada; la clave se guarda cifrada en el servidor. Los tokens OAuth de Google nunca se envían al navegador de invitados. La hoja privada contiene CUI legibles para organizar el ingreso. No compartir sus permisos ni publicarla.

## Archivos principales

| Archivo | Uso |
|---|---|
| `web/body.html` | Contenido común de la invitación |
| `public/web/styles.css` | Diseño y adaptación a móvil |
| `public/web/faculty.css` | Colores y detalles inspirados en el PDF de la facultad |
| `public/web/fonts/` | Great Vibes y su licencia SIL OFL, servidas desde el propio sitio |
| `public/web/app.js` | Formulario, galería, pases y subidas |
| `public/web/config.js` | URL pública del servidor, sin claves |
| `public/venue/` | Las cuatro fotos públicas del campus y del auditorio |
| `scripts/build-pages.mjs` | Exportar archivos estáticos a GitHub Pages |
| `web/share-card.html` | Diseño de la imagen de vista previa al compartir |
| `app/api/[...path]/route.ts` | API y CORS limitado a la cuenta de GitHub autorizada |
| `lib/media.ts` | Validación y transferencia limitada por tamaño |
| `lib/drive.ts` | Conexión privada, subidas a Drive y lectura por rangos |
| `app/admin/drive-settings.tsx` | Configuración y sincronización de Drive |

Para actualizar textos de fecha/lugar, modificar `web/body.html`; mantener las fechas del servidor en `lib/event.ts` y la configuración del calendario en `public/web/app.js` coherentes. Después ejecutar el exportador de Pages.

## Desarrollo

Node.js >=22.13. Desde esta carpeta:

```powershell
npm run install:ci
npm run build
npm run build:pages
npm run dev
```

El archivo local ignorado `.dev.vars` necesita una clave de pruebas, distinta de producción:

```text
CUI_ENCRYPTION_KEY=<32 bytes aleatorios en base64>
ADMIN_EMAIL=seedy@sites.test
```

Para una base local nueva, aplicar una sola vez cada SQL de `drizzle/` en orden (`0000`, `0001`, `0002`) con:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_rainy_gamora.sql
```

Cambiar el nombre del archivo para cada migración pendiente. No repetir migraciones aplicadas ni crear tablas durante solicitudes. Sites aplica las pendientes al publicar. La simulación de cuenta de ChatGPT del starter solo se usa para el administrador local en `/signin-with-chatgpt?return_to=/admin`.

En Windows, si el shim de npm falla desde un helper, usar la entrada JavaScript de npm ajustando su ruta:

```powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' run build
```

## Validación

```powershell
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/security.test.mjs
node --test tests/api.test.mjs
node --test tests/drive.test.mjs
node scripts/qa-browser.mjs
node scripts/qa-gallery.mjs
```

La prueba de navegador requiere el servidor local, una clave de pruebas y Chrome instalado. Escribe registros sintéticos solo en la base local y prueba la reproducción con un video generado en el navegador. `CHROME_PATH` permite indicar el ejecutable. La API se prueba en un Worker con D1/R2 efímeros. La integración de Drive se prueba con respuestas simuladas: la autorización real y el guardado en tu cuenta deben verificarse al conectarla.

`qa-gallery.mjs` comprueba las fotos del lugar, el visor con teclado y deslizamiento, la cuadrícula en varios tamaños y los filtros de fotos y videos. Su colección del día del evento se simula solo en el navegador: no crea invitados ni sube archivos al servidor. Guarda capturas en `.sites-runtime/gallery/`.

Conservar `CUI_ENCRYPTION_KEY` y `ADMIN_EMAIL` en el entorno del servidor. No registrar ni publicar credenciales, pases ni CSV con invitados. Mantener el `project_id` de `.openai/hosting.json`; seguir el flujo de Sites para publicar el servidor. El workflow de la raíz publica únicamente `docs/` en GitHub Pages.
