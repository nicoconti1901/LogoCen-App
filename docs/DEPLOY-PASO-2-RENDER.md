# Paso 2 — API en Render (checklist)

Repo: `https://github.com/nicoconti1901/LogoCen-App.git`

## Antes de crear el servicio

1. Subí a GitHub la rama que vas a desplegar (ej. `DetallesFinalesPreDeploy` o `Deploy`):

   ```powershell
   cd c:\Proyectos\LogoCen-App
   git add docs/DEPLOY-PASO-A-PASO.md docs/DEPLOY-PASO-2-RENDER.md render.yaml frontend/public/.htaccess frontend/.env.production.example
   git commit -m "Docs y config para deploy en Render"
   git push origin DetallesFinalesPreDeploy
   ```

2. Tené a mano el `backend/.env` local (Neon + WhatsApp ya probados). **No lo subas a Git.**

---

## 2.1 Crear Web Service

1. [dashboard.render.com](https://dashboard.render.com) → **New +** → **Web Service**.
2. Conectá GitHub → repo **LogoCen-App**.
3. Elegí la rama (`DetallesFinalesPreDeploy` o la que uses).
4. Completá:

| Campo | Valor |
|-------|--------|
| **Name** | `logocen-api` (o el que quieras) |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm run start` |
| **Instance type** | **Starter** (~USD 7/mes). Evitá Free (duerme; WhatsApp falla). |

5. **Create Web Service** (todavía puede fallar hasta cargar env vars).

---

## 2.2 Variables de entorno

En el servicio → **Environment** → **Add Environment Variable**.

Copiá los valores desde tu `backend/.env` local. Generá **nuevos** secretos para producción (`JWT_SECRET`, `CRON_SECRET`) si los de dev son débiles.

### Obligatorias

| Variable | Valor |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon **Pooled** (con `-pooler`) |
| `DIRECT_URL` | Neon **Direct** (sin pooler) |
| `JWT_SECRET` | Mín. 32 caracteres aleatorios |
| `JWT_EXPIRES_IN` | `365d` |
| `CORS_ORIGIN` | URL del front sin `/` final. Ej. `https://app.logocen.com` o temporalmente la URL que uses en el Paso 3 |
| `TZ` | `America/Argentina/Buenos_Aires` |

### WhatsApp (si ya funciona en local)

| Variable | Valor |
|----------|--------|
| `WHATSAPP_ENABLED` | `true` |
| `WHATSAPP_PHONE_NUMBER_ID` | Igual que local |
| `WHATSAPP_ACCESS_TOKEN` | Token de sistema Meta |
| `WHATSAPP_VERIFY_TOKEN` | El que uses en el webhook |
| `WHATSAPP_APP_SECRET` | App Secret Meta |
| `WHATSAPP_REMINDER_TEMPLATE_24H_NAME` | `recordatorio_turno_24hs_contacto` |
| `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE` | `es_AR` |
| `CLINIC_NAME` | Nombre del centro |
| `CLINIC_ADDRESS` | Dirección real |
| `CLINIC_CONTACT_PHONE` | Tel. centro (wa.me) |
| `CRON_SECRET` | Secreto largo (cron-job.org en Paso 4) |

### Opcionales

| Variable | Nota |
|----------|------|
| `WHATSAPP_WABA_ID` | Solo diagnóstico |
| `WHATSAPP_API_VERSION` | `v21.0` (default) |

**No hace falta** definir `PORT`: Render lo inyecta solo.

Guardá → Render redeploya automáticamente.

---

## 2.3 Primer deploy

1. **Logs** → esperá `Build successful` y `API en http://localhost:XXXX` (el puerto lo pone Render).
2. Abrí la URL que Render asigna: `https://logocen-api.onrender.com` (el nombre puede variar).

### Probar

```text
GET https://TU-SERVICIO.onrender.com/health
```

Respuesta esperada: `{"ok":true}`

Login (admin del seed en Neon):

```text
POST https://TU-SERVICIO.onrender.com/api/auth/login
Content-Type: application/json

{"email":"admin@clinica.com","password":"Admin123!"}
```

(Ajustá email/password si cambiaste el seed.)

---

## 2.4 Dominio `api.tudominio.com` (cuando tengas DNS)

1. Render → servicio → **Settings** → **Custom Domains** → Add `api.tudominio.com`.
2. En tu proveedor de dominio, **CNAME**:
   - Nombre: `api`
   - Valor: el que muestra Render (ej. `logocen-api.onrender.com`)
3. Esperá certificado SSL (unos minutos).
4. Probá de nuevo: `https://api.tudominio.com/health`

---

## Errores frecuentes

| Síntoma | Causa | Solución |
|---------|--------|----------|
| Build falla en `tsc` | Código viejo en GitHub | Push de la rama actual |
| Crash al iniciar | Falta `DATABASE_URL` o `JWT_SECRET` | Revisar Environment |
| `JWT_SECRET` min 16 | Secreto corto | Valor más largo |
| Login 401 | Admin distinto al seed | Email/password del seed |
| CORS en el navegador | `CORS_ORIGIN` no coincide con el front | Misma URL exacta (https, sin barra final) |

---

## Siguiente: Paso 3

Cuando `/health` responda OK, anotá la URL del API (Render o custom) y seguí con el front en `docs/DEPLOY-PASO-A-PASO.md` → Fase 3.

```env
VITE_API_URL=https://api.tudominio.com/api
```
