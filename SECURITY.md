# 🛡️ Política de Seguridad — Aero Fluxer X

## Compromiso de Seguridad

Aero Fluxer X se desarrolla con una estricta política de **Seguridad por Defecto** y **Cero Secretos**.

1. **Aislamiento Total de Almacenamiento**: El repositorio de código es completamente apátrida (*stateless*). Ninguna clave de API, contraseña, token personal ni dato de usuario se almacena en los archivos del repositorio. Todos los datos locales se confinan en `%LOCALAPPDATA%\FluxerX` (Windows) o `~/.config/aero-fluxer-x` (Linux/macOS).
2. **Nivel de Permisos por Defecto (`user`) y Principio de Menor Privilegio**:
   - Por defecto, toda instalación "de fábrica" opera en nivel **`user`**.
   - Las operaciones de bajo riesgo (lectura de archivos, diagnóstico del sistema, consultas SQLite, listado de procesos, etc.) operan sin interrupción.
   - Las operaciones de alto riesgo (ejecución de comandos en consola `terminal.run_command`, instalación de paquetes o borrado masivo de rutas) requieren nivel **`poweruser`** o **`admin`**.
3. **Flujo de Consentimiento y Elevación Temporal (5 Minutos)**:
   - Ante una operación restringida, el servidor rechaza la ejecución con `PERMISSION_DENIED` e instruye a la Inteligencia Artificial a **solicitar confirmación explícita al usuario**.
   - Cuando el usuario autoriza la acción, la IA invoca `security.grant_permission({ role: "poweruser", minutes: 5 })`.
   - La elevación dura **estrictamente 5 minutos por defecto** (o la duración acordada con el usuario), expirando automáticamente para volver al nivel seguro `user`.
4. **Enmascaramiento de Secretos**: El subsistema `core/permissions.mjs` y `tools/security.mjs` analiza y enmascara automáticamente cadenas sensibles (tokens, hashes, API keys) en salidas de consola y logs.
5. **Verificación Criptográfica de Actualizaciones**: Las descargas del actualizador automático validan obligatoriamente el hash SHA-256 antes de aplicar cualquier archivo al sistema.

## Notificación de Vulnerabilidades

Si descubres una vulnerabilidad de seguridad en Aero Fluxer X, por favor **NO abras un issue público**. En su lugar, envía un reporte privado detallando:
- Descripción de la vulnerabilidad.
- Pasos precisos para reproducir el fallo o vector de ataque.
- Impacto potencial estimado.

- Utilice variables de entorno (`.env` local, basado en `.env.example`) para configuraciones locales avanzadas.
- Nunca suba su directorio `%APPDATA%\AeroFluxerX` ni su archivo `.env` a repositorios públicos.
- Aero Fluxer X no requiere tokens ni conexiones a cuentas remotas externas; mantenga separadas las credenciales de cualquier servicio.
