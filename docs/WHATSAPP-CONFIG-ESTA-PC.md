# WhatsApp — armar `backend/.env` en esta PC

Estructura en Meta (resumen):

```text
Portfolio: Logocen Consultorios Medicos
├── LogoCen-App                    → token, app secret, webhook
└── LogoCen Consultorios Medicos Recordatorio (WABA)
    ├── Número test (+1 555…)      → no usar en producción
    └── Número real 221 201-4638   → Phone number ID: 1167212263137112
```

## Paso 1 — Crear el archivo

```powershell
cd C:\Proyectos\LogoCen-App\backend
copy .env.example .env
```

## Paso 2 — Base de datos y JWT (desde la otra PC o Neon)

Copiá de la PC que funcionaba o del panel Neon:

```env
DATABASE_URL="..."
DIRECT_URL="..."
JWT_SECRET="..."
JWT_EXPIRES_IN="365d"
PORT=4000
CORS_ORIGIN="http://localhost:5173"
CRON_SECRET="..."
```

## Paso 3 — Meta: LogoCen-App + cuenta Recordatorio

1. [developers.facebook.com](https://developers.facebook.com) → **LogoCen-App**.
2. **WhatsApp** → **API Setup**.
3. Arriba debe figurar la cuenta **LogoCen Consultorios Medicos Recordatorio** (no una WABA vieja).

### Token (obligatorio, nuevo en esta PC)

- En API Setup → **Generate access token** (o token permanente del usuario del sistema).
- Pegar en:

```env
WHATSAPP_ACCESS_TOKEN="EAA..."
```

Si el Phone number ID da error pero el ID es correcto, casi siempre es **token viejo** o de otra WABA.

### Phone number ID del 221

En el bloque del número **221 201-4638** (no el test):

```env
WHATSAPP_PHONE_NUMBER_ID=1167212263137112
```

### WABA ID (opcional, para verificar)

En Business Settings / configuración de la cuenta WhatsApp → copiá el ID numérico de la cuenta **Recordatorio**:

```env
WHATSAPP_WABA_ID=NUMERO_LARGO_WABA
```

### App y webhook

```env
WHATSAPP_ENABLED=true
WHATSAPP_APP_SECRET=...          # LogoCen-App → Configuración → Básica → Secreto
WHATSAPP_VERIFY_TOKEN=...        # misma frase en Meta → Webhook
WHATSAPP_API_VERSION=v21.0
```

## Paso 4 — Plantillas y centro (como en la otra PC)

Nombre **exacto** de la plantilla activa en la WABA **Recordatorio**:

```env
WHATSAPP_REMINDER_TEMPLATE_24H_NAME=recordatorio_turno_24h_contacto
WHATSAPP_REMINDER_TEMPLATE_LANGUAGE=es_AR
WHATSAPP_REMINDER_TEMPLATE_NAME=recordatorio_turno_v3

CLINIC_NAME="LogoCen"
CLINIC_ADDRESS="Calle 520 N°11323"
CLINIC_CONTACT_PHONE="221 201-4638"
```

## Paso 5 — Verificar todo

```powershell
cd backend
npm run whatsapp:verify-setup
```

Debe marcar ✓ en token, ✓ Phone number ID (221), y listar los dos números de la WABA.

## Paso 6 — Prueba de envío

Modo desarrollo: agregar celular del paciente en API Setup → **To**.

```powershell
npm run whatsapp:real-test
```

## Errores frecuentes

| Error | Qué hacer |
|-------|-----------|
| Object ID … does not exist | Token nuevo desde LogoCen-App con WABA Recordatorio; o `WHATSAPP_WABA_ID` + verify-setup |
| Recipient not in allowed list | Agregar teléfono del paciente en API Setup (modo prueba) |
| Authentication Error | Regenerar `WHATSAPP_ACCESS_TOKEN` |
