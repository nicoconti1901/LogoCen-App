# Deploy LogoCen — paso a paso

Guía para producción con:

| Componente | Proveedor sugerido | Plan |
|------------|-------------------|------|
| Base de datos | [Neon](https://neon.tech) | Free (inicio) |
| API (backend) | [Render](https://render.com) | Web Service ~USD 7/mes (siempre encendido) |
| Frontend (React) | Tu dominio / hosting estático | Free o lo que ya pagaste |
| Cron WhatsApp | [cron-job.org](https://cron-job.org) | Free |
| Mensajes WhatsApp | Meta Business | Pago por uso (ya configurado) |

**Orden:** hacé los pasos en secuencia. No saltees Neon ni el API antes de apuntar el front.

---

## Fase 0 — Antes de empezar (checklist)

- [ ] Dominio propio (ej. `logocen.com`) con acceso al panel DNS.
- [ ] Cuenta en [Neon](https://console.neon.tech).
- [ ] Cuenta en [Render](https://dashboard.render.com) (tarjeta para plan de pago del API).
- [ ] App Meta / WhatsApp con token, `PHONE_NUMBER_ID`, plantilla `recordatorio_turno_24hs_contacto` aprobada.
- [ ] Repositorio en GitHub/GitLab (Render despliega desde Git) — rama `DetallesFinalesPreDeploy` o `main`.
- [ ] Anotá estos subdominios (podés cambiar los nombres):
  - `app.tudominio.com` → frontend (SPA)
  - `api.tudominio.com` → backend

---

## Fase 1 — Base de datos (Neon)

### 1.1 Crear proyecto

1. En Neon: **New Project** → región cercana (ej. `AWS US East` o la más cercana a Argentina).
2. Copiá dos connection strings:
   - **Pooled** (host con `-pooler`) → `DATABASE_URL` en producción.
   - **Direct** (sin pooler) → `DIRECT_URL` (solo migraciones).

### 1.2 Variables que vas a usar

```env
DATABASE_URL="postgresql://...@ep-xxx-pooler....neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://...@ep-xxx....neon.tech/neondb?sslmode=require"
```

### 1.3 Aplicar migraciones (desde tu PC, una vez)

En la carpeta `backend`, con `.env` apuntando a Neon (`DIRECT_URL` y `DATABASE_URL`):

```powershell
cd backend
npx prisma migrate deploy
npm run db:seed
```

El seed crea el usuario admin inicial (ver `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` en `.env` o valores por defecto del seed).

**Verificación:** en Neon → Tables, deben aparecer `User`, `Patient`, `Appointment`, etc.

---

## Fase 2 — Backend en Render

### 2.1 Nuevo Web Service

1. Render → **New +** → **Web Service**.
2. Conectá el repo de LogoCen-App.
3. Configuración:

| Campo | Valor |
|-------|--------|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start` |
| Instance type | Starter (o superior; **no** Free si querés WhatsApp estable) |

### 2.2 Variables de entorno en Render

Copiá desde `backend/.env.example` y completá en el panel **Environment**:

| Variable | Ejemplo / nota |
|----------|----------------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Render inyecta `PORT`; puede quedar igual) |
| `DATABASE_URL` | Neon **pooled** |
| `DIRECT_URL` | Neon **direct** (por si corrés migraciones desde Render) |
| `JWT_SECRET` | Cadena larga aleatoria (32+ caracteres) |
| `JWT_EXPIRES_IN` | `365d` |
| `CORS_ORIGIN` | `https://app.tudominio.com` (URL exacta del front, sin barra final) |
| `TZ` | `America/Argentina/Buenos_Aires` |
| `CRON_SECRET` | Secreto largo aleatorio (para cron-job.org) |
| `WHATSAPP_ENABLED` | `true` |
| `WHATSAPP_PHONE_NUMBER_ID` | De Meta |
| `WHATSAPP_ACCESS_TOKEN` | Token sistema (no caduca en 24 h) |
| `WHATSAPP_VERIFY_TOKEN` | El que definas para el webhook |
| `WHATSAPP_APP_SECRET` | De la app Meta |
| `WHATSAPP_REMINDER_TEMPLATE_24H_NAME` | `recordatorio_turno_24hs_contacto` |
| `WHATSAPP_REMINDER_TEMPLATE_LANGUAGE` | `es_AR` |
| `CLINIC_NAME` | Nombre del centro |
| `CLINIC_ADDRESS` | Dirección real |
| `CLINIC_CONTACT_PHONE` | WhatsApp del centro (wa.me) |

### 2.3 Dominio custom del API

1. Render → tu servicio → **Settings** → **Custom Domain** → `api.tudominio.com`.
2. En el DNS de tu dominio, registro **CNAME** `api` → el host que indica Render.
3. Esperá SSL activo (Let's Encrypt automático).

### 2.4 Verificar que el API responde

```text
GET https://api.tudominio.com/health
→ {"ok":true}
```

Login de prueba:

```text
POST https://api.tudominio.com/api/auth/login
Content-Type: application/json
{"email":"...","password":"..."}
```

### 2.5 Disco `uploads/` (fotos y documentos)

Render guarda archivos en disco del contenedor. **Pueden perderse al redeploy.** Para el inicio (pocos archivos) suele alcanzar; más adelante conviene S3/R2.

---

## Fase 3 — Frontend en tu dominio

### 3.1 Build local

```powershell
cd frontend
```

Creá `frontend/.env.production` (no se sube a Git si está en .gitignore; usá el example):

```env
VITE_API_URL=https://api.tudominio.com/api
```

```powershell
npm install
npm run build
```

La carpeta `frontend/dist/` es lo que subís al hosting.

### 3.2 Subir al hosting

**Opción A — Subdominio `app.tudominio.com` (recomendado)**

- Subí **todo el contenido** de `dist/` a la carpeta del subdominio (public_html/app o similar).
- El repo incluye `public/.htaccess` para Apache (rutas de React Router).

**Opción B — Misma raíz que el HTML actual**

- Si la landing está en `www` y la app en `/app`, en `vite.config.ts` habría que setear `base: '/app/'` y rebuild (avisá si necesitás esto).

### 3.3 DNS del front

- **CNAME** `app` → servidor de tu hosting, **o**
- Registros que indique tu proveedor (DonWeb, Hostinger, Cloudflare, etc.).

### 3.4 Probar

1. Abrí `https://app.tudominio.com`.
2. Login con el admin del seed.
3. Agenda, pacientes, un turno de prueba.

Si ves error de CORS: revisá que `CORS_ORIGIN` en Render sea **exactamente** la URL del front (https, sin `/` al final).

---

## Fase 4 — WhatsApp en producción

### 4.1 Webhook en Meta

1. [developers.facebook.com](https://developers.facebook.com) → tu app → WhatsApp → Configuration.
2. **Callback URL:** `https://api.tudominio.com/webhooks/whatsapp`
3. **Verify token:** mismo valor que `WHATSAPP_VERIFY_TOKEN`.
4. Suscripción: **messages**.
5. Guardá. Meta hace GET de verificación; el API debe estar en línea.

Verificación local del token (opcional):

```powershell
cd backend
npm run whatsapp:check-webhook
```

### 4.2 Cron de recordatorios (cada 10–15 min)

En [cron-job.org](https://console.cron-job.org):

| Campo | Valor |
|-------|--------|
| URL | `https://api.tudominio.com/api/internal/whatsapp/reminders/run` |
| Método | POST |
| Header | `X-Cron-Secret: <tu CRON_SECRET>` |
| Frecuencia | Cada 10 minutos |

### 4.3 Prueba end-to-end

1. Paciente con **celular válido** (formato de la app).
2. Turno en ≥ 48 h, estado Agendado.
3. Esperar ventana 24 h o forzar con script (solo en mantenimiento):

   ```powershell
   npm run whatsapp:real-test
   ```

4. Paciente toca «Sí, confirmo» → turno pasa a Confirmado en la agenda.

Más detalle: `docs/WHATSAPP-RECORDATORIOS.md`, `docs/WHATSAPP-CONFIG-ESTA-PC.md`.

---

## Fase 5 — Post-deploy

- [ ] Cambiar contraseña del admin de prueba.
- [ ] Cargar especialistas reales, honorarios, consultorios.
- [ ] Actualizar `CLINIC_ADDRESS` y teléfonos.
- [ ] Backup: Neon permite branches; considerá export periódico.
- [ ] Monitoreo: alertas de Render si el servicio cae.

---

## Resumen de URLs

| Qué | URL |
|-----|-----|
| App | `https://app.tudominio.com` |
| API | `https://api.tudominio.com` |
| Health | `https://api.tudominio.com/health` |
| Webhook Meta | `https://api.tudominio.com/webhooks/whatsapp` |
| Cron | `POST https://api.tudominio.com/api/internal/whatsapp/reminders/run` |

---

## Siguiente paso ahora

**Empezá por la Fase 1 (Neon).** Cuando tengas `DATABASE_URL` y `DIRECT_URL`, seguimos con migraciones y Render (Fase 2). Si me pasás el dominio real (ej. `logocen.com.ar`), adapto los ejemplos de DNS y `CORS_ORIGIN`.
