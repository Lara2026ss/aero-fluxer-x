# Configuración de Clientes MCP para Aeron Fluxer X

Fluxer X soporta una integración transparente (Zero-Friction) con múltiples clientes de Inteligencia Artificial que soportan el protocolo MCP (Model Context Protocol).

Si utilizaste el instalador `Install-FluxerX.bat`, **todos tus clientes locales fueron configurados automáticamente**.

Si necesitas configurar un cliente de forma manual, utiliza las siguientes instrucciones.

## Requisitos Previos

- **Node.js**: v18.0 o superior (`node -v`)
- **Directorio del motor**: Localiza dónde se encuentra tu instalación de Fluxer X. Si usaste el instalador automático, el motor está en:
  `%LOCALAPPDATA%\FluxerX\engine` o `%USERPROFILE%\AppData\Local\FluxerX\engine`.

---

## 1. Google Antigravity

Antigravity es un entorno de codificación local de Google que soporta MCP nativamente.

1. Abre el archivo de configuración de Antigravity MCP:
   `%USERPROFILE%\.gemini\config\mcp_config.json`
2. Añade la entrada `Fluxer_X` bajo `mcpServers`:

```json
{
  "mcpServers": {
    "Fluxer_X": {
      "command": "node",
      "args": [
        "C:\\Users\\TU_USUARIO\\AppData\\Local\\FluxerX\\engine\\server.mjs"
      ]
    }
  }
}
```

3. Guarda el archivo. Antigravity recargará los MCP automáticamente al iniciar un nuevo chat.

---

## 2. Claude Desktop (Anthropic)

Claude Desktop para Windows soporta herramientas locales vía MCP.

1. Abre el archivo de configuración:
   `%APPDATA%\Claude\claude_desktop_config.json`
2. Añade la entrada de Fluxer X:

```json
{
  "mcpServers": {
    "Fluxer_X": {
      "command": "node",
      "args": [
        "C:\\Users\\TU_USUARIO\\AppData\\Local\\FluxerX\\engine\\server.mjs"
      ]
    }
  }
}
```

3. Reinicia Claude Desktop completamente.

---

## 3. Codex

Codex soporta integración local de herramientas.

1. Abre la configuración de Codex:
   `%USERPROFILE%\.codex\config.json`
2. Asegúrate de añadir o combinar la clave `mcpServers`:

```json
{
  "mcpServers": {
    "Fluxer_X": {
      "command": "node",
      "args": [
        "C:\\Users\\TU_USUARIO\\AppData\\Local\\FluxerX\\engine\\server.mjs"
      ]
    }
  }
}
```

---

## Notas de Seguridad

- **No expongas el servidor a redes públicas**: Fluxer X otorga acceso profundo al sistema y está diseñado exclusivamente para ejecución local vía `stdio`.
- **Privilegios**: Por defecto, Fluxer X corre con los privilegios de tu usuario actual. Si la IA necesita ejecutar tareas de Administrador (como editar particiones BCD), solicitará permisos en tiempo de ejecución.
