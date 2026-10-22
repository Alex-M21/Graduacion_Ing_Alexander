# Activar tu Drive

El conector está implementado, pero **no se activa hasta que autorices tu cuenta en Google y completes la conexión**. Mientras tanto se conserva el almacenamiento actual del sitio. Conectar Google Drive al chat permite trabajar con archivos desde el chat; no entrega automáticamente esa autorización permanente al servidor de la invitación.

## 1. Crear el proyecto de Google

1. Abre [Google Apps Script](https://script.google.com/home/start) con tu cuenta de Google.
2. Crea un proyecto y copia el contenido de `Code.gs`.
3. En configuración del proyecto, muestra el archivo de manifiesto `appsscript.json` y sustituye su contenido por el de esta carpeta. El manifiesto incluye el servicio avanzado Drive API v3 y los permisos de Drive y Sheets necesarios.
4. Ejecuta `setupDrive` desde el editor y autoriza tu propio proyecto. Se crea una carpeta privada con `Fotos`, `Videos` y un listado de invitados en Google Sheets. El nombre de la carpeta es “Graduación Ing. Alexander Mejía 2026”.

Si prefieres una carpeta existente, configura antes la propiedad de script `ROOT_FOLDER_ID` con su ID. Debe ser privada y no tener otros lectores ni editores; el script rechaza carpetas compartidas para proteger los CUI. Ejecutar la configuración otra vez conserva los IDs existentes.

## 2. Publicar la conexión

En Apps Script, selecciona **Implementar → Nueva implementación → Aplicación web**:

- Ejecutar como: **tú**, la cuenta propietaria.
- Quién tiene acceso: **cualquier persona**.

La URL recibe únicamente operaciones verificadas con una clave privada de 64 caracteres. No publica la carpeta ni el listado. La clave y los tokens de Google nunca se envían a los invitados.

## 3. Conectar desde tu panel privado

1. Copia la URL de la implementación que termina en `/exec`.
2. En configuración de Apps Script → Propiedades del script, copia el valor de `BRIDGE_KEY`.
3. Abre el [panel privado de la graduación](https://celebramos-alexander.mellowwolf11.chatgpt.site/admin) e inicia sesión con el correo autorizado.
4. Abre **Almacenamiento en Google Drive → Conectar mi Drive** y pega allí la URL y la clave. **La clave va en ese formulario privado, no en el chat, el repositorio ni la página pública.**
5. Pulsa **Conectar Drive** y después **Sincronizar pendientes**. El panel mostrará la carpeta, la hoja de invitados y cuántos elementos faltan por copiar.

Comprueba en Drive que las fotos, los videos y las filas del listado estén presentes. Los CUI son legibles en la hoja privada para preparar el ingreso; la base operativa mantiene su copia cifrada. Con Drive activo, las nuevas subidas van a Drive. Los registros se copian a Sheets; si una copia falla, el registro se conserva y queda pendiente para reintentar desde el panel.

Las copias previas de archivos se conservan como respaldo en el almacenamiento anterior. La migración nunca las borra. Cambiar de conexión después de subir archivos requiere mantener el acceso a sus carpetas anteriores; no apuntar a otra carpeta sin migrarlos.

Para usar «Eliminar» en el listado del administrador con Drive conectado, actualiza tu implementación de Apps Script con el `Code.gs` actual, que incluye `deleteRecord`. Conserva las propiedades y la clave de la conexión. Esta operación elimina únicamente la fila del invitado en Sheets y conserva sus fotos y videos.

## Límites y permisos

- Los invitados no reciben permisos de edición ni eliminación en tu Drive.
- Los archivos permanecen privados; el servidor reproduce fotos y videos mediante enlaces temporales verificados.
- Videos de hasta 50 MB y fotos de hasta 8 MB. La transferencia de medios se hace directamente entre el servidor y la API de Drive; no pasa por Apps Script en base64.
- Apps Script solo facilita la autorización del propietario y las actualizaciones pequeñas del listado. Está sujeto a las cuotas de Google. El almacenamiento consume espacio de tu cuenta.
- Esta cuenta de Gmail utiliza tu autorización de usuario; una cuenta de servicio independiente no tiene cuota propia de “Mi unidad”.

Referencias: [implementaciones web de Apps Script](https://developers.google.com/apps-script/guides/web), [token OAuth de la cuenta ejecutora](https://developers.google.com/apps-script/reference/script/script-app#getoauthtoken), [subidas reanudables de Drive](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [cuotas de Apps Script](https://developers.google.com/apps-script/guides/services/quotas).
