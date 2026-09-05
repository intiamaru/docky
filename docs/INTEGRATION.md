# Cómo dockyficar una página

Esto es lo que el skill `docky-fy` automatiza. Documentado acá para que el skill (y cualquiera leyendo el repo) tenga la receta exacta.

## Requisitos de la página objetivo

- HTML estático, servido desde un dominio/subdominio propio en Hostinger (cuenta `u187157113`).
- Estructura con un `<main>` que contenga bloques `<section id="algo">` — cada `<section>` con `id` es una unidad borrable. Si la página no usa `<section>`, hay que decidir el contenedor equivalente y ajustar el selector `main section[id]` en `edit.js` (o envolver el contenido en secciones antes de dockyficar).
- El `<body>` debe terminar en `</body>` limpio para insertar el `<script>` antes de cerrarlo.

## Pasos

1. **Elegir un `page` slug único** para esta página — no puede repetirse con ningún otro slug ya usado en `page_content` (los slugs existentes son globales a la API compartida). Convención: nombre corto y descriptivo, ej. `"dolencias"`, `"atlas-sueno"`.

2. **Agregar el origen a CORS** de la API compartida: leer las env vars actuales (masked) y volver a mandar el set completo con `hosting_replaceNode_jsEnvironmentVariablesV1` sobre `contenteditor-api.hostingersite.com`, agregando el nuevo origen a `ALLOWED_ORIGINS` (separado por coma). **Es un full-replace** — mandar TODAS las vars existentes, no solo la nueva.

3. **Instrumentar el HTML**:
   - Cada párrafo de prosa y cada nota/callout que deba ser editable: agregar `data-ek="clave-unica-en-la-pagina"`.
   - Cada encabezado (`h1`, `h2`, `h3`): agregar `data-ek="..."` directo si el encabezado es texto plano; si tiene un prefijo estructural (ej. un número de sección tipo `<span class="num">01</span>`), envolver SOLO el texto editable en un `<span data-ek="...">`, dejando el prefijo afuera.
   - No se necesita marcar las secciones para que sean borrables — cualquier `<section id="...">` dentro de `<main>` ya es borrable automáticamente (el borrado usa el `id` existente como clave, con el prefijo `sec:`).
   - Agregar antes de `</body>`:
     ```html
     <script src="<ruta-a>/edit.js?v=N" data-api="https://contenteditor-api.hostingersite.com" data-page="<slug-elegido>"></script>
     ```
     Copiar `client/edit.js` de este repo tal cual (no reescribir) — es genérico, no necesita cambios por página. Incrementar `N` solo cuando `edit.js` mismo cambie.

3. **Desplegar** la página (`hosting_deployStaticWithsite` o el flujo que corresponda al hosting de esa página).

4. **Purgar caché** del dominio recién desplegado (`hosting_clearWebsiteCacheV1`) — ver `LEARNINGS.md` #1, esto no es opcional.

5. **Verificar por API** (no asumir que "se ve bien" alcanza):
   - `POST /api/login` con la contraseña real → debe dar 401 con una mal y 200 con la correcta.
   - `GET /api/content?page=<slug>` → debe responder `{}` (página nueva, sin ediciones todavía) o el contenido ya guardado.
   - Un ciclo de prueba real: `PUT` un valor de prueba autenticado → `GET` confirma que se guardó → `PUT` de vuelta el valor original → `GET` confirma que quedó igual que antes de la prueba. Nunca dejar un valor de prueba pisando contenido real.
   - Si hay navegador disponible en la sesión: probar el flujo real de click (abrir candado, login, click en párrafo, guardar, click afuera cancela, borrar sección, deshacer). Si NO hay navegador disponible, decirlo explícitamente al usuario — no reportar el feature como "probado" sin esa verificación visual.

## Qué NO tocar por defecto

- No crear una base de datos ni una API nueva por cada página — la API es compartida (ver README, "Multi-tenant por diseño"). Solo se crea infraestructura nueva si el usuario lo pide explícitamente para un caso aislado.
- No reescribir `client/edit.js` por página — cualquier bug o mejora se arregla UNA vez acá y se repropaga a todas las páginas dockyficadas (copiar el archivo actualizado + redeploy + purga de caché en cada una).
