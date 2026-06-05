# Paso 3 — Frontend en Cloudflare Pages

En Cloudflare **no hay carpeta tipo cPanel**. El HTML de prueba está en un proyecto **Workers & Pages → Pages**.

## Dónde está el HTML de prueba

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com)
2. Elegí la cuenta / dominio.
3. Menú izquierdo: **Workers & Pages**
4. Pestaña **Pages** (no Workers)
5. Ahí aparece el proyecto (ej. `logocen`, `logocen-app`, etc.)
6. Clic en el nombre → ves **Deployments** (cada subida es un deploy)

No busques archivos en **DNS** ni en **Overview** del dominio: solo apuntan el dominio al proyecto Pages.

---

## Reemplazar el HTML de prueba por `dist`

### A) Arrastrar archivos en el panel

Solo sirve para HTML/CSS suelto. Si `dist` incluye `.js` en `assets/`, Cloudflare muestra:

> *Este cargador aún no admite proyectos que requieran compilación… use `wrangler deploy`*

**Usá la opción B (Wrangler)** — tu `dist` ya está compilado; Wrangler solo lo sube.

### B) Con Wrangler (recomendado)

1. `frontend/.env.production`:

   ```env
   VITE_API_URL=https://TU-SERVICIO.onrender.com/api
   ```

2. Build + deploy:

   ```powershell
   cd c:\Proyectos\LogoCen-App\frontend
   npm run build
   npx wrangler login
   npx wrangler pages deploy dist --project-name=NOMBRE_DE_TU_PROYECTO
   ```

   - `NOMBRE_DE_TU_PROYECTO` = el nombre que ves en **Workers & Pages → Pages** (ej. `logocen`).
   - Si el proyecto no existe: `npx wrangler pages project create logocen` y después el `deploy`.
   - Al terminar, Wrangler muestra la URL `*.pages.dev` y el deploy queda activo (reemplaza el HTML de prueba).

---

## Conectar el dominio al proyecto Pages

1. Proyecto Pages → **Custom domains**
2. **Set up a domain** → `tudominio.com` o `app.tudominio.com`
3. Cloudflare configura DNS solo si el dominio ya está en la misma cuenta.

---

## Después del deploy

1. **Render** → `CORS_ORIGIN` = URL exacta del front (ej. `https://tudominio.com`), sin `/` final.
2. Abrí la URL en el navegador → login.

---

## Si NO ves ningún proyecto en Pages

Entonces el HTML de prueba puede estar en otro lado (otro hosting). En ese caso:

- **Overview** del dominio → **DNS** → mirá registros **A** o **CNAME** del dominio raíz (`@` o `www`): el destino indica dónde está alojado.

Si solo tenés el dominio en Cloudflare sin Pages, creá un proyecto nuevo:

**Workers & Pages** → **Create** → **Pages** → **Upload your project** → subí `dist`.
