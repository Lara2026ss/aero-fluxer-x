# 🛡️ Política de Seguridad — Aero Fluxer X

## Compromiso de Seguridad

Aero Fluxer X se desarrolla con una estricta política de **Seguridad por Defecto** y **Cero Secretos**.

1. **Aislamiento Total de Almacenamiento**: El repositorio de código es completamente apátrida (*stateless*). Ninguna clave de API, contraseña, token personal ni dato de usuario se almacena en los archivos del repositorio. Todos los datos locales se confinan en `%APPDATA%\AeroFluxerX` (Windows) o `~/.config/aero-fluxer-x` (Linux/macOS).
2. **Enmascaramiento de Secretos**: El subsistema `core/permissions.mjs` y `tools/security.mjs` analiza y enmascara automáticamente cadenas sensibles (tokens, hashes, API keys) en salidas de consola y logs.
3. **Modos de Permisos**:
   - `SAFE`: Bloquea acciones de modificación destructiva en disco o ejecución de comandos sin confirmación.
   - `NORMAL`: Permite operaciones estándar de lectura/escritura en el espacio de trabajo.
   - `ELEVATED`: Requiere confirmación explícita para operaciones que requieran privilegios de administrador.
4. **Verificación Criptográfica de Actualizaciones**: Las descargas del actualizador automático validan obligatoriamente el hash SHA-256 antes de aplicar cualquier archivo al sistema.

## Notificación de Vulnerabilidades

Si descubres una vulnerabilidad de seguridad en Aero Fluxer X, por favor **NO abras un issue público**. En su lugar, envía un reporte privado detallando:
- Descripción de la vulnerabilidad.
- Pasos precisos para reproducir el fallo o vector de ataque.
- Impacto potencial estimado.

- Utilice variables de entorno (`.env` local, basado en `.env.example`) para configuraciones locales avanzadas.
- Nunca suba su directorio `%APPDATA%\AeroFluxerX` ni su archivo `.env` a repositorios públicos.
- Aero Fluxer X no requiere tokens ni conexiones a GitHub; mantenga separadas las credenciales de cualquier servicio externo.
