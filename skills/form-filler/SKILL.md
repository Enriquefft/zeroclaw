---
name: form-filler
description: Extrae preguntas de forms web y prepara respuestas para postulaciones. Usar cuando Enrique dice "Llena esta postulación: LINK".
---

# Form Filler

Automatiza la extracción de preguntas de forms de postulación y prepara respuestas. Nunca envía - solo prepara.

## Flujo de Trabajo

1. **Login** (si hay página de login): `form-filler login <url>` → usa credenciales con browser fill
2. **Extract**: Navega cada sección, usa `browser get_text` para labels + `browser snapshot -i` para refs
3. **Store**: Guarda preguntas en `~/.zeroclaw/workspace/postulaciones/<slug>.md`
4. **Prepare**: Lanza agente para generar respuestas basadas en perfil
5. **Report**: Muestra respuestas a Enrique - NUNCA ENVÍA

### Eficiencia en extracción
- Para cada sección: **1 click + 1 wait + 1 get_text + 1 snapshot -i** = 4 iteraciones máximo
- Si el snapshot muestra solo "Añadir nuevo registro" → anotar como "sección dinámica (agregar registros)" y pasar a la siguiente
- NO hacer click en "Añadir nuevo registro" durante la extracción — solo documentar que existe

### Extracción eficiente de formularios
- Para ver labels + campos: usar `browser get_text "section.the-content"` (~12KB) en vez de `browser snapshot` (~28KB)
- Si no existe un selector específico, usar `browser get_text "form"` o `browser get_text "main"`
- Para obtener refs interactivos: usar `browser snapshot -i` después del get_text
- NO anotar opciones de dropdowns verbatim — solo anotar que es un dropdown y el número de opciones
- Combinar: get_text para labels → snapshot -i para refs → fill/click con los refs
- **Flujo por sección:** click menú → wait networkidle → get_text "selector" → snapshot -i → anotar → siguiente

## CLI Reference

### form-filler extract <url>
Abre el form en browser y extrae todas las preguntas. Guarda en MD.

```bash
form-filler extract "https://forms.gle/..."
```

Output: JSON con preguntas extraídas y path al archivo MD.

### form-filler list
Lista todas las postulaciones procesadas.

```bash
form-filler list
```

### form-filler show <slug>
Muestra las preguntas de una postulación específica.

```bash
form-filler show google-swe-2024
```

### form-filler prepare <slug>
Prepara respuestas para las preguntas (no las envía).

```bash
form-filler prepare google-swe-2024
```

### form-filler login <url>
Busca credenciales en Bitwarden para el URL y las guarda en el auth vault de agent-browser.

```bash
form-filler login "https://becas.example.com/login"
```

Requiere `BW_SESSION` en env o en `~/.zeroclaw/workspace/.bw-session`. Si el vault está bloqueado:
```bash
bw unlock --raw > ~/.zeroclaw/workspace/.bw-session
```

Output: JSON con `{ok, slug, username, has_totp, totp?, instructions}`. La contraseña NO aparece en el output — ya está guardada en el auth vault.

Después de login, el agente ejecuta:
```bash
agent-browser auth login <slug>
```

### form-filler cookies bridge [--domain <domain>]
Importa cookies de kiro-browser al agent-browser (para Google OAuth u otros sitios con login externo).

```bash
form-filler cookies bridge --domain google.com
```

**Requisito:** kiro-browser debe estar cerrado. El usuario debe haber hecho login manualmente en kiro-browser antes.

Output: JSON con `{ok, imported_count, domains}`.

### form-filler cookies clear
Limpia todas las cookies del agent-browser.

```bash
form-filler cookies clear
```

## Autenticación

### Login con Bitwarden (email/password)
Para sitios con formulario de login estándar (email + contraseña):

1. El agente detecta que la URL requiere login (ve un formulario de login o redirect a login)
2. Ejecuta `form-filler login <url>` — busca credenciales en Bitwarden (output incluye username + password)
3. Navega al URL de login con `browser navigate`
4. Toma `browser snapshot -i` para identificar los campos de usuario/email y contraseña
5. Usa `browser fill @eN "username"` y `browser fill @eM "password"` con los valores del paso 2
6. Busca el botón/link de submit en el snapshot del paso 4 y usa `browser click @eSubmit`
7. `browser wait --load networkidle` — esperar a que la página navegue después del submit
8. Toma `browser snapshot -i` para verificar que el login fue exitoso (la URL debería cambiar)
9. Si hay TOTP, el código aparece en el output del paso 2 — ingresarlo con `browser fill`
10. Procede con la extracción del formulario

**IMPORTANTE**: Los campos de login varían entre sitios (textbox, input[type=email], links como submit, etc.). Siempre usar snapshot para identificar los campos correctos — no asumir la estructura.

### Google OAuth (cookie bridge)
Para sitios que usan "Sign in with Google" u otro OAuth externo:

1. El agente detecta que el sitio requiere Google OAuth
2. Indica a Enrique: "Este sitio usa Google OAuth. Abre kiro-browser, haz login, y cierra kiro-browser"
3. Enrique abre kiro-browser, hace login en el sitio manualmente, cierra kiro-browser
4. El agente ejecuta `form-filler cookies bridge --domain <dominio-del-sitio>`
5. Navega al sitio — las cookies de sesión permiten acceso sin re-login
6. Procede con la extracción del formulario

### Vault bloqueado
Si `form-filler login` devuelve error de vault bloqueado:
1. Reportar a Enrique: "Tu vault de Bitwarden está bloqueado"
2. Enrique ejecuta: `bw unlock --raw > ~/.zeroclaw/workspace/.bw-session`
3. Reintentar `form-filler login`

**REGLA DE SEGURIDAD: NUNCA registrar contraseñas, tokens, o cookies en archivos MD ni en logs.**

## Browser (agent-browser)

El browser usa **agent-browser** (Playwright accessibility tree). Los refs vienen de `browser snapshot` como `@eN`.

### Comandos Clave
- `browser snapshot` — captura completa (labels + interactivos, ~28KB). Usar SOLO si get_text no muestra labels.
- `browser snapshot -i` — SOLO elementos interactivos (~5KB). Usar para navegación y para obtener refs después de get_text.
- `browser snapshot -c` — modo compacto (sin nodos vacíos). Usar como variante para evitar dedup.
- `browser click @eN` — click en elemento
- `browser fill @eN "texto"` — limpia campo + escribe (preferir para inputs de form)
- `browser navigate "url"` — navegar a URL
- `browser wait --load networkidle` — esperar a que la página termine de cargar (preferido después de navegación)
- `browser wait 2000` — esperar milisegundos (alternativa si networkidle no aplica)
- `browser wait --load load` / `browser wait --load domcontentloaded` — variantes para evitar dedup
- `browser get_text "selector"` — extraer texto visible de un selector CSS (ej: `"body"`, `"section.the-content"`)

### Reglas del Browser
- **NUNCA usar `browser screenshot`** — las imágenes explotan el context window. Usar SOLO snapshots
- **Para extraer preguntas**: usar `browser get_text "selector"` para labels + `browser snapshot -i` para refs
- **Para navegar/hacer clicks**: usar `browser snapshot -i` — más rápido y pequeño
- **Después de click que navega** — `browser wait --load networkidle` y luego tomar nuevo snapshot
- **Si necesitas un segundo wait en el mismo turno** — variar la forma: `wait 2000` → `wait --load load` → `wait --load domcontentloaded`
- **Para forms multi-página** — usar get_text + snapshot -i por sección (NO snapshot completo)
- **Si un click falla** — tomar nuevo snapshot, buscar el elemento actualizado

### Evitar "duplicate tool call"
El runtime bloquea llamadas idénticas en el mismo turno. **Variar los parámetros:**
- Snapshots: `browser snapshot` → `browser snapshot -c` → `browser snapshot -i` → `browser snapshot -i -d 10`
- Waits: `browser wait --load networkidle` → `browser wait 2000` → `browser wait --load load` → `browser wait --load domcontentloaded`

## Reglas Críticas

- **NUNCA ENVIAR** - solo preparar respuestas
- **Cualquier error** → detenerse y reportar a Enrique inmediatamente
- **Navegación** - usar respuestas temporales ("test", "N/A") para avanzar páginas si es necesario
- **Persistencia** - todas las preguntas quedan en `~/.zeroclaw/workspace/postulaciones/`

## Estructura de Archivos

```
~/.zeroclaw/workspace/postulaciones/
├── cientifica-ai-battle.md     # Preguntas extraídas + respuestas
├── google-swe-2024.md
└── ...

~/.zeroclaw/workspace/form-filler-cookies/
├── google-com-1710288000000.json   # Cookie exports (referencia)
└── ...
```

Cada archivo `.md` contiene:
- URL original
- Fecha de extracción
- Lista de preguntas con tipos (texto, select, multiple, etc.)
- Respuestas preparadas basadas en perfil
- Campos faltantes marcados con ⚠️
