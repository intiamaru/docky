# Comentarios embebibles (`comments.js`)

Tercer componente de Docky. Deja comentar cualquier elemento marcado de una página, con nombre libre o con una cuenta liviana (email + código, sin contraseña). Mismo backend compartido que el resto de Docky — no es infraestructura aparte.

## Integrar en una página

```html
<script src="https://contenteditor-api.hostingersite.com/comments.js"
        data-api="https://contenteditor-api.hostingersite.com"
        data-page="<slug-de-la-pagina>"></script>
```

A diferencia de `edit.js`, **no se copia el archivo** — se referencia directo desde la API (`GET /comments.js`), una sola fuente de verdad. Solo hace falta:
1. Marcar cada elemento comentable con `data-cm="clave-unica-en-la-pagina"`.
2. Agregar el origen de la página a `ALLOWED_ORIGINS` (igual que para `edit.js`, ver `docs/INTEGRATION.md`).
3. El `page` slug puede ser el mismo que ya usa `edit.js` en esa página, o uno propio — son namespaces independientes (`page_content` vs `comments`, sin choque de claves).

## Cómo funciona

- Cada `[data-cm]` recibe una burbuja 💬 flotante con el conteo de comentarios; click abre un panel con la lista + formulario.
- Sin cuenta: nombre libre + texto, sin fricción.
- Con cuenta: email → código de 6 dígitos por correo (15 min de validez, sin contraseña) → sesión de 180 días guardada en `localStorage` bajo `ce_visitor_token`, **compartida entre todas las páginas que usan la misma API** — un login sirve para comentar en cualquier página dockyficada.
- Si la página también tiene `edit.js` con sesión admin activa (`ce_admin_token_<page>` en localStorage), el panel de comentarios detecta ese token y muestra un enlace "borrar" en cada comentario — integración opcional, no requerida.

## Backend

Mismo servidor que `edit.js` (`server/server.js`), tablas nuevas: `visitor_users`, `login_codes`, `comments`. Envío de código por email: mismo mecanismo que `coursebook-platform` (`nodemailer` + Gmail SMTP, env vars `GMAIL_EMAIL` / `GMAIL_APP_PASSWORD`). **Sin `GMAIL_APP_PASSWORD` configurada, el código se escribe en los logs del servidor en vez de enviarse** — permite probar el flujo completo antes de tener la credencial real; nunca fallar en silencio.

## Endpoints

- `POST /api/auth/request-code` `{email}` → genera código, lo manda (o lo loguea).
- `POST /api/auth/verify-code` `{email, code, name?}` → crea el usuario si es la primera vez, devuelve token de visitante (180 días).
- `GET /api/comments?page=X` → público, lista de comentarios.
- `POST /api/comments` `{page, elementKey, body, authorName?}` + `Authorization` opcional (token de visitante) → si hay token, usa el nombre de la cuenta e ignora `authorName`; si no, `authorName` es obligatorio.
- `DELETE /api/comments/:id` — requiere token admin (el mismo de `edit.js`).

## Pendiente

- `GMAIL_APP_PASSWORD` real (Jorge tiene que generarla en myaccount.google.com/apppasswords) — sin ella el código nunca llega por correo, solo queda en los logs.
- Sin navegador disponible para probar el panel de comentarios visualmente esta sesión — todo verificado por API (ver LEARNINGS.md #7).
