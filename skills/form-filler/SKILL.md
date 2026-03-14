---
name: form-filler
description: Extrae preguntas de forms web y prepara respuestas para postulaciones. Usar cuando Enrique dice "Llena esta postulación: LINK".
---

# Form Filler

Extracción de preguntas y preparación de respuestas para postulaciones via el tool `form_filler`. Nunca envía - solo prepara.

**IMPORTANTE: Usar SOLO el tool `form_filler` con argumento `args`. NUNCA ejecutar shell, bun run, ni CLI manuales.**

## Flujo de Trabajo

1. **Detect auth**: Al llegar al sitio, si ves Login y Signup/Register juntos → **siempre intentar login primero**. Ejecutar `form_filler` con args `login <url>` para buscar credenciales en Bitwarden. Si no hay credenciales → reportar a Enrique y esperar instrucciones (NO crear cuenta sin permiso).
2. **Login**: Si hay credenciales, hacer login con browser fill. Verificar con snapshot que el login fue exitoso.
3. **Extract**: Navega cada sección, usa `browser get_text` para labels + `browser snapshot -i` para refs
4. **Store**: Guarda preguntas en `~/.zeroclaw/workspace/postulaciones/<slug>.md`
5. **Prepare**: Lanza agente para generar respuestas basadas en perfil
6. **Report**: Muestra respuestas a Enrique - NUNCA ENVÍA

### Distinguir signup vs formulario real
- Si los campos extraídos son solo nombre, email, password → es un formulario de **registro/signup**, NO la postulación real
- La postulación real tiene preguntas sobre experiencia, motivación, ensayos, etc.
- **NUNCA reportar un signup form como la postulación** — el formulario real está detrás del login

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

## Tool: form_filler

Usa el tool `form_filler` para todas las operaciones. El argumento `args` es el subcomando + argumentos.

### Subcomandos

| Subcomando | Ejemplo de args | Descripción |
|-----------|----------------|-------------|
| `extract <url>` | `extract "https://forms.gle/..."` | Crea archivo MD para la postulación |
| `list` | `list` | Lista todas las postulaciones |
| `show <slug>` | `show google-swe-2024` | Muestra preguntas de una postulación |
| `prepare <slug>` | `prepare google-swe-2024` | Prepara respuestas (lanza agente) |
| `login <url>` | `login "https://becas.example.com"` | Busca credenciales en Bitwarden |
| `cookies bridge` | `cookies bridge --domain google.com` | Importa cookies de kiro-browser |
| `cookies clear` | `cookies clear` | Limpia cookies del agent-browser |

### login
Requiere `BW_SESSION` en env o en `~/.zeroclaw/workspace/.bw-session`. Si el vault está bloqueado, reportar a Enrique.

Output: JSON con `{ok, slug, username, password, has_totp, totp?}`.

### cookies bridge
**Requisito:** kiro-browser debe estar cerrado. El usuario debe haber hecho login manualmente antes.

## Autenticación

### Login con Bitwarden (email/password)
Para sitios con formulario de login estándar (email + contraseña):

1. El agente detecta que la URL requiere login (ve un formulario de login o redirect a login)
2. Ejecuta `form_filler` con args `login <url>` — busca credenciales en Bitwarden (output incluye username + password)
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
4. El agente ejecuta `form_filler` con args `cookies bridge --domain <dominio-del-sitio>`
5. Navega al sitio — las cookies de sesión permiten acceso sin re-login
6. Procede con la extracción del formulario

### Vault bloqueado
Si `form_filler login` devuelve error de vault bloqueado:
1. Reportar a Enrique: "Tu vault de Bitwarden está bloqueado"
2. Enrique ejecuta: `bw unlock --raw > ~/.zeroclaw/workspace/.bw-session`
3. Reintentar `form_filler` con args `login <url>`

**REGLA DE SEGURIDAD: NUNCA registrar contraseñas, tokens, o cookies en archivos MD ni en logs.**

## Browser (agent-browser)

El browser usa **agent-browser** (Playwright accessibility tree). Los refs vienen de `browser snapshot` como `@eN`.

### Comandos Clave
- `browser snapshot` — captura completa (labels + interactivos, ~28KB). Usar SOLO si get_text no muestra labels.
- `browser snapshot -i` — SOLO elementos interactivos (~5KB). Usar para navegación y para obtener refs después de get_text.
- `browser snapshot -c` — modo compacto (sin nodos vacíos)
- `browser click @eN` — click en elemento
- `browser fill @eN "texto"` — limpia campo + escribe (preferir para inputs de form)
- `browser navigate "url"` — navegar a URL
- `browser wait --load networkidle` — esperar a que la página termine de cargar (preferido después de navegación)
- `browser wait 2000` — esperar milisegundos (alternativa si networkidle no aplica)
- `browser get_text "selector"` — extraer texto visible de un selector CSS (ej: `"body"`, `"section.the-content"`)

### Reglas del Browser
- **NUNCA usar `browser screenshot`** — las imágenes explotan el context window. Usar SOLO snapshots
- **Para extraer preguntas**: usar `browser get_text "selector"` para labels + `browser snapshot -i` para refs
- **Para navegar/hacer clicks**: usar `browser snapshot -i` — más rápido y pequeño
- **Después de click que navega** — `browser wait --load networkidle` y luego tomar nuevo snapshot
- **Para forms multi-página** — usar get_text + snapshot -i por sección (NO snapshot completo)
- **Si un click falla** — tomar nuevo snapshot, buscar el elemento actualizado

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
