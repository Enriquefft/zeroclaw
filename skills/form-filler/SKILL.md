---
name: form-filler
description: Extrae preguntas de forms web y prepara respuestas para postulaciones. Usar cuando Enrique dice "Llena esta postulación: LINK".
---

# Form Filler

Automatiza la extracción de preguntas de forms de postulación y prepara respuestas. Nunca envía - solo prepara.

## Flujo de Trabajo

1. **Login** (si hay página de login): `form-filler login <url>` → `agent-browser auth login <slug>`
2. **Extract**: Abre el form en browser, extrae TODAS las preguntas (usa respuestas temporales si es necesario para navegar entre páginas)
3. **Store**: Guarda preguntas en `~/.zeroclaw/workspace/postulaciones/<slug>.md`
4. **Prepare**: Lanza agente para generar respuestas basadas en perfil
5. **Report**: Muestra respuestas a Enrique - NUNCA ENVÍA

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
2. Ejecuta `form-filler login <url>` — busca credenciales en Bitwarden, las guarda en auth vault
3. Ejecuta `agent-browser auth login <slug>` — rellena y envía el formulario de login
4. Toma snapshot para verificar que el login fue exitoso
5. Si hay TOTP, el código aparece en el output del paso 2 — ingresarlo manualmente con `browser fill`
6. Procede con la extracción del formulario

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
- `browser snapshot -i` — captura SOLO elementos interactivos (SIEMPRE usar `-i` para ahorrar tokens)
- `browser click @eN` — click en elemento
- `browser type @eN "texto"` — escribe texto (append)
- `browser fill @eN "texto"` — limpia campo + escribe (preferir para inputs de form)
- `browser navigate "url"` — navegar a URL

### Reglas del Browser
- **NUNCA usar `browser screenshot`** — las imágenes explotan el context window. Usar SOLO snapshots
- **Siempre usar `-i` (interactive)** — reduce drásticamente el tamaño del snapshot
- **Siempre tomar snapshot antes de interactuar** — los refs `@eN` son del snapshot actual
- **Después de click que navega** — tomar nuevo snapshot (los refs anteriores ya no sirven)
- **Para forms multi-página** — usar respuestas temporales para avanzar, extraer preguntas de cada página
- **Si un click falla** — tomar nuevo snapshot, buscar el elemento actualizado

### Evitar "duplicate tool call"
El runtime bloquea llamadas idénticas en el mismo turno. **Siempre variar los parámetros** entre snapshots consecutivos:
- Primer snapshot: `browser snapshot -i`
- Segundo snapshot: `browser snapshot -c` (compact)
- Tercer snapshot: `browser snapshot -i -d 10` (con depth)
- Cuarto snapshot: `browser snapshot -c -d 8`
- Alternar entre `-i`, `-c`, `-i -d N`, `-c -d N` para cada snapshot nuevo

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
