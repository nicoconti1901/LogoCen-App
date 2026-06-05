# Paso 4 — WhatsApp en producción (Meta + cron)

API en Render: `https://logocen-app.onrender.com`  
Front: `https://www.logocen-admin.com`

---

## Checklist previo (Render → Environment)

Confirmá que estas variables estén en el servicio **logocen-app** (mismos valores que en tu `backend/.env` local si ya probaste WhatsApp):

| Variable | Notas |
|----------|--------|
| `WHATSAPP_ENABLED` | `true` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número real (no +1 555…) |
| `WHATSAPP_ACCESS_TOKEN` | Token permanente (system user) en producción |
| `WHATSAPP_VERIFY_TOKEN` | Texto que elijas; debe coincidir con Meta webhook |
| `WHATSAPP_APP_SECRET` | App → Settings → Basic |
| `WHATSAPP_REMINDER_TEMPLATE_24H_NAME` | ej. `recordatorio_turno_24hs_contacto` o `recordatorio_turno_24h` |
| `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE` | `es_AR` |
| `CLINIC_NAME`, `CLINIC_ADDRESS`, `CLINIC_CONTACT_PHONE` | Datos reales de la clínica |
| `CRON_SECRET` | Secreto largo aleatorio (para cron-job.org) |

Diagnóstico local (con el mismo token que Render):

```powershell
cd backend
npm run whatsapp:verify-setup
```

---

## 4.1 Webhook en Meta

1. [developers.facebook.com](https://developers.facebook.com) → app **LogoCen-App** → **WhatsApp** → **Configuration**.
2. En **Webhook**, clic **Edit**:

   | Campo | Valor |
   |-------|--------|
   | **Callback URL** | `https://logocen-app.onrender.com/webhooks/whatsapp` |
   | **Verify token** | Mismo que `WHATSAPP_VERIFY_TOKEN` en Render |

3. Clic **Verify and save**. Meta hace un GET; el API debe responder `200` con el challenge.
4. En **Webhook fields**, suscribí **`messages`**.
5. Si Meta pide suscribir la app a la WABA:

   ```powershell
   cd backend
   npm run whatsapp:check-webhook -- TU_WABA_ID
   ```

   (Reemplazá `TU_WABA_ID` por el ID de la cuenta WhatsApp Business.)

### Probar verificación manualmente

Con el verify token correcto (no lo pegues en chats públicos):

```powershell
curl "https://logocen-app.onrender.com/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=TU_VERIFY_TOKEN&hub.challenge=12345"
```

Debe devolver `12345` y status 200.

Token incorrecto → `403` (normal).

---

## 4.2 Cron de recordatorios (cron-job.org)

1. [console.cron-job.org](https://console.cron-job.org) → **Create cronjob**.
2. Configuración:

   | Campo | Valor |
   |-------|--------|
   | **Title** | LogoCen WhatsApp reminders |
   | **URL** | `https://logocen-app.onrender.com/api/internal/whatsapp/reminders/run` |
   | **Schedule** | Cada **10 minutos** (`*/10 * * * *`) |
   | **Request method** | `POST` |
   | **Headers** | `X-Cron-Secret: <tu CRON_SECRET de Render>` |

3. Guardá y ejecutá **Run now** una vez.

Respuesta esperada (JSON):

```json
{ "processed": 0, "sent": 0, "failed": 0, ... }
```

Si `401` → el header no coincide con `CRON_SECRET` en Render.  
Si `503` → falta `CRON_SECRET` en Render.

### Probar desde PowerShell

```powershell
curl.exe -X POST "https://logocen-app.onrender.com/api/internal/whatsapp/reminders/run" `
  -H "X-Cron-Secret: TU_CRON_SECRET"
```

---

## 4.3 CORS (varios orígenes)

Con el fix desplegado en Render, podés usar varias URLs separadas por coma:

```
CORS_ORIGIN=https://www.logocen-admin.com,https://logocen-page.pages.dev
```

Cada una debe incluir `https://`. Sin barra final.

---

## 4.4 Prueba end-to-end

1. En `https://www.logocen-admin.com`, creá un paciente con **celular válido** (formato AR, ej. `54291154021589`).
2. Creá un turno **Agendado** con **≥ 48 h** de anticipación → se programa recordatorio 24 h antes.
3. Creá un turno **< 48 h** → debe quedar **Confirmado** sin WhatsApp.
4. Esperá la ventana de 24 h o, solo en mantenimiento local:

   ```powershell
   cd backend
   npm run whatsapp:reminders
   ```

5. El paciente recibe el mensaje y toca **Sí, confirmo** → en la agenda el turno pasa a **Confirmado** (origen WhatsApp).

### Logs en Render

Render → servicio → **Logs**. Al confirmar por botón deberías ver:

```
[whatsapp webhook] recibido { messageTypes: ['interactive'] }
```

---

## URLs de referencia

| Qué | URL |
|-----|-----|
| Health API | `https://logocen-app.onrender.com/health` |
| Webhook Meta | `https://logocen-app.onrender.com/webhooks/whatsapp` |
| Cron recordatorios | `POST https://logocen-app.onrender.com/api/internal/whatsapp/reminders/run` |
| App admin | `https://www.logocen-admin.com` |

Más detalle técnico: `docs/WHATSAPP-RECORDATORIOS.md`, `docs/WHATSAPP-CONFIG-ESTA-PC.md`.

---

## Siguiente: Paso 5 (post-deploy)

- Cambiar contraseña del admin de prueba.
- Cargar especialistas, honorarios y consultorios reales.
- App Meta en modo **Live** + token permanente (no el de 24 h de API Setup).
- Ver `docs/DEPLOY-PASO-A-PASO.md` → Fase 5.
