# 🌐 Aero Fluxer X — Feedback Gateway (Render + Firebase)

Microservicio intermedio autónomo para Render que desacopla por completo a los clientes de Aero Fluxer X de cualquier infraestructura privada o canal de comunicación.

## Arquitectura

```text
┌─────────────────────────────┐
│         AGENTE / IA         │
└──────────────┬──────────────┘
               │
               │ MCP
               ▼
┌─────────────────────────────┐
│ Aero Fluxer X               │
│ developer.submit_feedback   │
└──────────────┬──────────────┘
               │
               │ HTTPS
               ▼
┌─────────────────────────────┐
│ Feedback Gateway (Render)   │
├─────────────────────────────┤
│ Validation & Sanitization   │
│ Rate limiting (10 req/h)    │
│ Deduplication Engine        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Firebase Realtime Database  │
│ fluxer_feedbacks            │
└──────────────┬──────────────┘
               │
               ▼
        Email Digest / Admin
```

## Características
1. **Desacoplamiento Total**: Cero dependencias privadas del mantenedor en el cliente público.
2. **Deduplicación**: Agrupa reportes con contenido idéntico sin inundar la base de datos ni generar alertas redundantes.
3. **Digest Periódico**: Agrupa los reportes y envía un resumen periódico al correo del mantenedor en lugar de mensajes individuales.
4. **Alerta Crítica Única**: Reportes de severidad crítica activan una notificación inmediata con cooldown anti-abuso.
