# Graduación Ing. Alexander Mejía

Invitación web en **gris, naranja y blanco**, con registro directo y álbum compartido de fotos y videos.

**28 de octubre de 2026, 10:00 a. m.** · Auditorio Francisco Vela, Campus Central, zona 12, cerca del edificio T3.

- Interfaz estática para GitHub Pages: [`docs/`](docs/).
- Servidor y código completo: [`invitacion/`](invitacion/README.md).
- [Evaluación de factibilidad de Pages + Drive](invitacion/ARQUITECTURA.md).
- [Pasos para autorizar Google Drive](invitacion/integrations/google-apps-script/README.md).
- [Panel privado del organizador](https://celebramos-alexander.mellowwolf11.chatgpt.site/admin).

El invitado completa nombre, correo, CUI y consentimiento sin crear una cuenta. Recibe un acceso privado para volver al registro y al álbum. El álbum se habilita el día del evento y rechaza la edición y el borrado, incluso para quien subió el archivo.

Estudiantes: llevar identificación de estudiante. Si no son estudiantes: llevar DPI e indicar que asisten a la graduación. Pueden mostrar la invitación, llevando siempre su identificación.

GitHub Pages publica únicamente los archivos públicos de la carpeta `docs/`. Las claves, los registros, los CUI y los archivos privados no se guardan en el repositorio. El servidor limita CORS al sitio de GitHub del propietario.

La integración de Google Drive está implementada y tiene un panel para conectarla y sincronizar los elementos existentes. **Requiere la autorización de la cuenta de Google y no se activa automáticamente**. Hasta verificar esa conexión se mantiene el almacenamiento anterior. Los archivos previos se copian sin borrar sus respaldos.

Para actualizar la versión de Pages:

```powershell
cd invitacion
node scripts/build-pages.mjs
```

El workflow `.github/workflows/pages.yml` publica `docs/` al subir cambios a `main`. El servidor de Sites se publica por su flujo independiente. Cambios en colores, textos o formulario se hacen en `invitacion/web/body.html` y `invitacion/public/web/`; después se regenera `docs/`.
