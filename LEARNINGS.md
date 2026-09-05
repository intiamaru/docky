# Aprendizajes

Gotchas reales encontrados construyendo y operando Docky sobre Hostinger. Cada uno costó tiempo de debugging — leer antes de repetir el proceso.

## 1. El CDN de Hostinger cachea `.js` estático 7 días — un redeploy silencioso no basta

`cache-control: public, max-age=604800` en archivos estáticos servidos por el CDN de Hostinger (hcdn). Redesplegar `edit.js` no invalida el caché de los edge nodes automáticamente — un `curl` inmediatamente después del deploy puede pegarle a un edge que todavía no cacheó (mostrando el cambio como si ya estuviera "live"), mientras otros edges (y el navegador real del usuario) siguen sirviendo la versión vieja durante días.

**Siempre, después de desplegar una página o el `edit.js` compartido:**
1. Llamar `hosting_clearWebsiteCacheV1` (purga cache de servidor + CDN) sobre el dominio recién desplegado.
2. Además, versionar el script en el HTML: `<script src="assets/edit.js?v=N">` — incrementar `N` cada vez que cambia `edit.js`. Esto fuerza una URL nueva que ningún edge tiene cacheada, sin depender de que la purga haya llegado a todos los edges a tiempo.
3. Verificar con `curl -s -D - <url> | grep x-hcdn-cache-status` — debe decir `MISS` (no `HIT`) para confirmar que se sirvió contenido fresco, no cacheado.

No confiar en un solo `curl` de verificación post-deploy sin cache-busting: puede mentir (pegarle a un edge fresco) mientras el resto del mundo ve la versión vieja.

## 2. Bases de datos nuevas en Hostinger no permiten conexión remota por defecto

`hosting_createAccountDatabaseV1` crea la base, pero el usuario MySQL no tiene ningún host remoto habilitado — una app Node corriendo en otro proceso/servidor del mismo hosting falla con `Access denied for user '...'@'<ip>' (using password: YES)`, un mensaje que parece "contraseña incorrecta" pero en realidad es "host no permitido".

**Fix:** llamar `hosting_createDatabaseRemoteConnectionV1` con `ip: "%"` (o la IP específica si se conoce) inmediatamente después de crear la base, antes de asumir que las credenciales están mal.

## 3. Cancelar un editor con "click afuera" — el listener no puede registrarse en el mismo tick

Si el click que ABRE el editor (contenteditable + toolbar) también dispara un listener de "click afuera" registrado durante ese mismo evento, el listener puede recibir ESE MISMO click (porque sigue burbujeando hacia `document`) y cerrar el editor al instante — parece que "no pasa nada" al abrir.

**Fix:** diferir el registro del listener con `setTimeout(fn, 0)`, y usar `mousedown` (no `click`) en fase de captura para detectar el click afuera antes de que el propio botón Guardar/Cancelar dispare su handler.

## 4. Un botón posicionado `position:absolute` DENTRO de un contenedor con padding puede quedar invisible

El primer intento del botón 🗑 de borrar sección lo agregaba como hijo del `<section>` con `position:absolute;top:10px;right:10px`. Como la sección tiene padding propio (y la tarjeta visible vive en un `<div>` hijo con su propio padding/sombra), el botón terminaba flotando en el hueco de padding ARRIBA de la tarjeta visible — técnicamente presente en el DOM, invisible en la práctica.

**Fix:** no anidar el botón dentro del elemento a controlar. Agregarlo a `document.body`, y posicionarlo con `getBoundingClientRect()` del elemento objetivo + `window.scrollY/scrollX`, igual que ya se hacía para la barra de herramientas Guardar/Cancelar. Recalcular en `scroll`/`resize`.

## 5. CORS: el origen exacto tiene que estar en `ALLOWED_ORIGINS`, sin barra final

`https://qigong-evidencia.hostingersite.com` (sin `/` al final) — el header `Origin` que manda el navegador nunca lleva path ni barra final. Si `ALLOWED_ORIGINS` no matchea carácter por carácter, el preflight `OPTIONS` responde sin `Access-Control-Allow-Origin` y el navegador bloquea todo silenciosamente (sin error visible en el response de `curl`, porque `curl` no aplica CORS — solo se ve roto en un navegador real).

## 6. Sin navegador disponible en esta sesión — verificar por API, ser honesto sobre el límite

Esta sesión no tuvo acceso a Chrome (`mcp__chrome-devtools`) para probar clicks reales. Todo se verificó por API directa (curl: login, guardar, leer, revertir) y por lectura del HTML/JS servido. Es una verificación real pero parcial — no reemplaza un click real en un navegador. Cuando esto pase: decirlo explícitamente al usuario en vez de asumir que "probé el flujo" cubre la interacción visual.
