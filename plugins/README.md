# FLUXER Plugins

Este directorio contiene plugins dinámicos que extienden FLUXER con nuevos dominios MCP.

## Estructura de un plugin

```
plugins/
  mi-plugin/
    index.mjs    ← punto de entrada (obligatorio)
    README.md    ← documentación (opcional)
```

## Crear un plugin

```javascript
// plugins/mi-plugin/index.mjs
export default async function (runtime) {
  return {
    name: "mi_plugin", // nombre del dominio MCP (sin espacios)
    description: "Descripción breve del plugin",
    actions: {
      // Cada acción recibe (args, runtime, router)
      hacer_algo: async ({ param1, param2 = "default" } = {}) => {
        return runtime.run(`echo ${runtime.shellQuote(param1)}`);
      },
    },
    // Permisos opcionales por acción
    permissions: {
      hacer_algo: "poweruser", // 'user' | 'poweruser' | 'admin'
    },
  };
}
```

## Plugins disponibles

_Sin plugins instalados._

## Comandos

```bash
# Los plugins se cargan automáticamente al iniciar FLUXER
# Para recargar un plugin en caliente (sin reiniciar):
# Invocar desde el cliente MCP: security.grant_permission + runtime reload
```

## Notas

- Un plugin no puede registrar un dominio con el mismo nombre que uno existente.
- Si un plugin falla al cargar, FLUXER sigue iniciando normalmente.
- El directorio del plugin puede llamarse diferente al `name` del dominio.
