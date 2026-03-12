# Browser Patches — Next Steps

## Estado actual

Todos los patches viven en `/etc/nixos/zeroclaw/patches/` y se aplican en `module.nix` via `rustPlatform.buildRustPackage.patches`.

### Patches activos (aplicados en build)
| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `fix-screenshot-multimodal.patch` | Screenshot base64 → multimodal image block | ✅ Activo, build OK |

### Patches pendientes (generados, NO wired en module.nix aún)
| Archivo | Descripción | Estado |
|---------|-------------|--------|
| `fix-browser-dedup-per-turn.patch` | Mueve `seen_tool_signatures` dentro del loop de iteración | ⚠️ Generado pero en espera — ver nota abajo |

---

## Pendiente crítico: Rebuild + skills-sync

**No se ha corrido `nixos-rebuild switch` todavía.** El binario activo sigue siendo v0.1.7 sin ningún patch.

```bash
sudo nixos-rebuild switch --impure --option eval-cache false --flake /etc/nixos#nixos
systemctl --user restart zeroclaw-gateway
skills-sync
zeroclaw --version  # debe mostrar 0.1.8
```

---

## Bug raíz del click fallido (investigado, no patcheado)

### Problema
`data-zc-ref="@e5"` se inyecta en el DOM vía JS durante el snapshot. Si la página re-renderiza (React, Vue, SPA), los nodos DOM se reemplazan y el atributo desaparece. El click subsiguiente falla con "element not found".

### Causa exacta
En `src/tools/browser.rs`, función `snapshot_script()`:
```js
const ref = '@e' + (++counter);
el.setAttribute('data-zc-ref', ref);  // ← muere en re-render
```

En `parse_selector()` (línea ~2030):
```rust
return SelectorKind::Css(format!(r#"[data-zc-ref=\"{escaped}\"]"#));
```

### Fix planificado: ref_map server-side con XPaths estables

**Archivos a modificar:** `src/tools/browser.rs` (un solo archivo)

**Cambios necesarios (~80-100 líneas):**

#### 1. Agregar ref_map a NativeBrowserState (línea ~1341)
```rust
pub struct NativeBrowserState {
    // ... campos existentes ...
    ref_map: HashMap<String, String>,  // @eN → xpath estable
}
```

#### 2. Cambiar snapshot JS — NO inyectar en DOM, calcular XPath
Reemplazar `el.setAttribute('data-zc-ref', ref)` con una función que genere XPath estable:
```js
function stableXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;
  const tag = el.tagName.toLowerCase();
  const text = (el.innerText||'').trim().replace(/\s+/g,' ').slice(0,80);
  if (text && ['a','button'].includes(tag)) {
    const matches = document.querySelectorAll(tag);
    if ([...matches].filter(c=>(c.innerText||'').trim()===text).length===1)
      return `//${tag}[normalize-space(.)="${text}"]`;
  }
  if (el.name) return `//${tag}[@name="${el.name}"]`;
  // fallback posicional
  const parts = [];
  let node = el;
  while (node && node.parentElement) {
    const sibs = [...node.parentElement.children].filter(c=>c.tagName===node.tagName);
    const idx = sibs.indexOf(node)+1;
    parts.unshift(sibs.length===1 ? node.tagName.toLowerCase() : `${node.tagName.toLowerCase()}[${idx}]`);
    node = node.parentElement;
  }
  return '//'+parts.join('/');
}
```

El snapshot incluye `xpath` en cada nodo del resultado JSON.

#### 3. Poblar ref_map después de cada snapshot
En el handler de `BrowserAction::Snapshot`, parsear el JSON retornado y popular `state.ref_map`.

#### 4. Modificar parse_selector para consultar el map
```rust
// Necesita acceso al ref_map — cambiar firma o hacerlo método de NativeBrowserState
if trimmed.starts_with('@') {
    if let Some(xpath) = self.ref_map.get(trimmed) {
        return SelectorKind::XPath(xpath.clone());
    }
    // fallback al comportamiento actual
    let escaped = css_attr_escape(trimmed);
    return SelectorKind::Css(format!(r#"[data-zc-ref=\"{escaped}\"]"#));
}
```

**Nota:** `parse_selector` actualmente es una free function. Necesita convertirse en método de `NativeBrowserState` o recibir el map como argumento.

---

## Nota sobre fix-browser-dedup-per-turn.patch

Este patch mueve `seen_tool_signatures` de scope de sesión a scope de iteración en `src/agent/loop_.rs` (línea 1203 → dentro del `for iteration in 0..max_iterations`).

**Razón para pausar:** El bug del dedup es un **síntoma** del click fallido, no la causa raíz. Si el click falla porque el ref es stale, el dedup bloquea el retry — pero si el click no falla (post XPath patch), el dedup nunca se activa en condiciones normales.

Evaluar si activarlo después de validar el XPath patch.

---

## Comparación de alternativas investigadas

| | zeroclaw actual | agent-browser | browser-use |
|---|---|---|---|
| Refs | `data-zc-ref` en DOM (volátil) | Accessibility tree (estable) | Vision LLM |
| Runtime | Rust+WebDriver | Rust+Playwright | Python+Playwright |
| Loop | Integrado | CLI externo | Integrado |

El XPath patch converge zeroclaw hacia la estabilidad de agent-browser sin cambiar el stack.

---

## Archivos clave

| Path | Rol |
|------|-----|
| `/etc/nixos/zeroclaw/module.nix` | Build config, lista de patches activos |
| `/etc/nixos/zeroclaw/patches/` | Todos los .patch files |
| `/home/hybridz/Projects/zeroclaw/src/tools/browser.rs` | Snapshot script, parse_selector, NativeBrowserState |
| `/home/hybridz/Projects/zeroclaw/src/agent/loop_.rs` | seen_tool_signatures (dedup patch) |
| `/home/hybridz/Projects/zeroclaw/src/providers/anthropic.rs` | Screenshot multimodal patch |
| `/etc/nixos/zeroclaw/skills/form-filler/SKILL.md` | Guía de browser para el agente |
