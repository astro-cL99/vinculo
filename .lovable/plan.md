## Objetivo

Convertir el formulario de emisión de recetas en una experiencia con autocompletado de medicamentos y validación contra el catálogo real de la **Farmacia Popular (PAC)** de `farmaciapopularonline.cl`, mostrando stock y precio en tiempo real.

## Alcance (acordado)

- Solo farmacia **PAC** (hardcodeada).
- Autocompletado **híbrido**: el catálogo genérico actual se mantiene (no rompe casos fuera de PAC), pero las sugerencias muestran arriba los principios activos cubiertos por PAC con un badge.
- Cuando se elige un principio activo cubierto por PAC, el selector de **Forma Farmacéutica** se **restringe estrictamente** a las formas disponibles en PAC para ese principio.
- Bajo el medicamento aparece un **panel de presentaciones PAC** con todas las marcas/concentraciones, stock (Disponible/Agotado) y precio referencial.
- Stock **Agotado** muestra badge rojo informativo pero no bloquea la prescripción.
- Refresh del catálogo: **diario por cron**. Stock y precio: **consulta en vivo** al expandir el panel.

## Arquitectura

```text
 Extensión (recetas-emit.js)
        │
        │ 1. autocomplete (cacheado, local-first)
        ▼
 GET  /api/public/pac/search?q=...        ← responde en <100ms desde DB
        │
        │ 2. al seleccionar principio activo
        ▼
 GET  /api/public/pac/presentations?principio=...   ← live scrape + merge cache
        │
        ▼
   Panel: presentación · forma · stock · precio
```

### Backend (TanStack server routes bajo `/api/public/pac/*`)

1. **`/api/public/pac/search`** — busca en la tabla cacheada `pac_catalog` por nombre o principio activo. Devuelve principios activos únicos + formas disponibles.
2. **`/api/public/pac/presentations`** — recibe un principio activo, hace fetch en vivo a `farmaciapopularonline.cl/ConsultorPAC?farmacia=PAC` (form POST con el filtro), parsea la tabla HTML y retorna `[{medicamento, principio, forma, stock, precio, requiere_receta}]`. Cachea el resultado 5 min para no martillar el origen.
3. **`/api/public/pac/refresh`** — endpoint llamado por **pg_cron diario** que itera el catálogo completo (lista A-Z), parsea y hace upsert en `pac_catalog`.

Todas las rutas validan input con Zod y no exponen PII. El scraping es server-side (evita CORS y oculta el origen al navegador).

### Base de datos (migración)

Tabla `public.pac_catalog`:
- `medicamento` (texto, ej. "EC PREGABALINA 150MG X30 (CURAE)")
- `principio_activo` (texto normalizado, ej. "PREGABALINA 150 MG")
- `principio_base` (texto, ej. "pregabalina" — para búsqueda)
- `forma_farmaceutica` (texto: CAPSULA, COMPRIMIDO, etc.)
- `stock` (enum: 'disponible' | 'agotado')
- `precio_referencial` (numeric)
- `requiere_receta` (boolean)
- `last_seen_at` (timestamp)
- índices: `principio_base trigram`, `forma_farmaceutica`

RLS: lectura pública anónima (es catálogo público), escritura solo `service_role`.

Cron pg_cron: `0 4 * * *` → llama `/api/public/pac/refresh` con `apikey` anon.

### Frontend (extensión `extension/modules/recetas-emit.js`)

1. Reemplazar el input "Principio activo" por un combobox con dropdown:
   - Al teclear ≥2 chars, fetch a `/api/public/pac/search`.
   - Resultados con badge "PAC" cuando aplique; principios fuera de PAC siguen permitiéndose como texto libre.
2. Al seleccionar un principio activo con cobertura PAC:
   - El select **Forma Farmacéutica** se filtra a las formas devueltas (ej. solo CAPSULA / COMPRIMIDO).
   - Si elige una forma no PAC, se muestra warning "No disponible en PAC".
3. Nuevo bloque debajo del medicamento: **"Disponibilidad en Farmacia Popular"**
   - Tabla compacta con columnas: Medicamento · Forma · Stock · Precio.
   - Badges verde (Disponible) / rojo (Agotado).
   - Total estimado si hay varias unidades prescritas.
4. Estados de carga, error y "fuera de PAC" claramente diferenciados.

## Detalles técnicos

- El sitio PAC es ASP.NET WebForms; el scraping usa `fetch` con el form POST (`__VIEWSTATE`, `__EVENTVALIDATION`) más parser HTML (`cheerio` o regex de tabla — definir al implementar tras inspeccionar el POST real).
- Cache en memoria por proceso (Map con TTL 5min) para `/presentations`, además del cache persistente en `pac_catalog`.
- Normalización: uppercase, sin acentos, `pregabalina 150 mg` ≡ `PREGABALINA 150MG`.
- Errores del origen: si el scrape falla, devolver datos del cache marcados con `stale: true` y mostrar aviso "datos no actualizados".
- Sin secretos nuevos: la página es pública.

## Pasos de implementación

1. Migración: tabla `pac_catalog` + RLS + índices.
2. Server route `/api/public/pac/refresh` con scraper completo + utilidad de parseo.
3. Server route `/api/public/pac/search` (lectura cacheada).
4. Server route `/api/public/pac/presentations` (live + cache).
5. Cron pg_cron diario 04:00 → refresh.
6. UI en `recetas-emit.js`: combobox autocomplete + restricción de forma + panel de disponibilidad.
7. Estilos del panel (badges Disponible/Agotado, tabla compacta) consistentes con el diseño actual de la extensión.
8. Seed inicial: ejecutar refresh una vez manualmente tras desplegar.

## Fuera de alcance (futuras iteraciones)

- Selector de comuna / otras farmacias populares.
- Sugerencia automática de alternativa cuando está agotado.
- Reserva o derivación directa al sistema PAC.
- Historial de precios.
