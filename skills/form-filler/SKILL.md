---
name: form-filler
description: Extrae preguntas de forms web y prepara respuestas para postulaciones. Usar cuando Enrique dice "Llena esta postulación: LINK".
---

# Form Filler

Automatiza la extracción de preguntas de forms de postulación y prepara respuestas. Nunca envía - solo prepara.

## Flujo de Trabajo

1. **Extract**: Abre el form en browser, extrae TODAS las preguntas (usa respuestas temporales si es necesario para navegar entre páginas)
2. **Store**: Guarda preguntas en `~/.zeroclaw/workspace/postulaciones/<slug>.md`
3. **Prepare**: Lanza agente para generar respuestas basadas en perfil
4. **Report**: Muestra respuestas a Enrique - NUNCA ENVÍA

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

## Reglas Críticas

- **NUNCA ENVIAR** - solo preparar respuestas
- **Cualquier error** → detenerse y reportar a Enrique inmediatamente
- **Navegación** - usar respuestas temporales ("test", "N/A") para avanzar páginas si es necesario
- **Persistencia** - todas las preguntas quedan en `~/.zeroclaw/workspace/postulaciones/`

## Browser - Uso Correcto

- Después de `browser screenshot`, la imagen llega **directamente en la respuesta** como bloque visual — no busques el archivo en disco ni uses `image_info`
- Después de `browser open` o `browser click` que falle, tomar snapshot **antes** de reintentar — los refs cambian con cada nueva sesión
- Si un clic falla dos veces con el mismo ref, tomar snapshot nuevo y usar el ref actualizado
- **No reabrir el browser** si ya hay una sesión activa — usa `browser snapshot` para obtener refs frescos

## Estructura de Archivos

```
~/.zeroclaw/workspace/postulaciones/
├── google-swe-2024.md      # Preguntas extraídas
├── meta-swe-2024.md
└── ...
```

Cada archivo MD contiene:
- URL original
- Fecha de extracción
- Lista de preguntas con tipos (texto, select, multiple, etc.)
- Respuestas preparadas (si aplica)
