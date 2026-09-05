# Docky

Convierte una página estática plana en una página con edición inline protegida por contraseña — sin CMS pesado, sin base de datos por sitio. Un candado 🔒 flotante, contraseña de admin, click en un párrafo o título para editarlo, botón 🗑 para borrar una sección entera, todo persistido y visible para cualquier visitante.

Nació como una solución puntual para dos páginas de evidencia sobre QiGong (`qigong-evidencia.hostingersite.com`) y se generalizó para reusarse en cualquier página propia futura, vía el skill `docky-fy` (`~/.claude/skills/docky-fy/SKILL.md`).

## Cómo está armado

```
docky/
  server/        API compartida (Node/Express + MySQL) — UNA sola instancia sirve a todas las páginas "dockyficadas"
  client/edit.js Script cliente reusable, sin dependencias — se referencia tal cual desde cada página
  docs/          Cómo integrar una página nueva
  LEARNINGS.md   Gotchas encontrados operando esto en Hostinger — leer antes de tocar el deploy
```

**Multi-tenant por diseño**: la API no es "una API por sitio". Es una sola API (`contenteditor-api.hostingersite.com`), con una tabla `page_content(page_slug, field_key, value)`. Cada página dockyficada usa un `page_slug` propio (ej. `"dolencias"`, `"salud-mental"`) y su origen debe agregarse a `ALLOWED_ORIGINS` en el servidor. Una sola contraseña de admin sirve para todas las páginas por ahora — es intencional (simplicidad > multi-usuario), se puede evolucionar más adelante.

## Despliegue actual (referencia)

- API: `https://contenteditor-api.hostingersite.com` (Node.js app en Hostinger, cuenta `u187157113`)
- Base de datos: MySQL `u187157113_content_editor` (aislada — no comparte nada con otras bases de datos de otros proyectos)
- Páginas dockyficadas hasta ahora: `qigong-evidencia.hostingersite.com/dolencias/`, `qigong-evidencia.hostingersite.com/salud-mental/`

## Cómo usar esto día a día

No se usa este repo directamente para dockyficar una página — se invoca el skill:

```
please docky-fy this page <url o ruta local>
```

El skill lee este repo como fuente de verdad (la versión más reciente de `client/edit.js`, la URL de la API compartida, y los gotchas de `LEARNINGS.md`), instrumenta la página objetivo, y la despliega.

Si cambiás `server/server.js` o `client/edit.js` acá, el cambio no se aplica solo — hay que redesplegar la API (si tocaste el servidor) y/o volver a copiar `client/edit.js` en cada página ya dockyficada y redesplegar esa página (con purga de caché, ver LEARNINGS.md).
