# Styling Reference

> Companion to `AGENTS.md`. Read this when working on UI appearance, theming, or CSS.

---

## CSS File

```
apps/web/src/index.css   ← global styles, Tailwind directives, custom properties
```

---

## Theming System

Theme is controlled by the `data-theme` attribute on the `<html>` element.

```typescript
// Set in App.tsx:
document.documentElement.setAttribute('data-theme', theme);

// Possible values:
'light' | 'dark' | 'sepia'
```

**Use CSS custom properties for theme-aware colors:**

```css
/* In index.css — define per theme: */
[data-theme='light'] { --bg: #ffffff; --text: #0f172a; }
[data-theme='dark']  { --bg: #0f172a; --text: #f8fafc; }
[data-theme='sepia'] { --bg: #fdf6e3; --text: #3b2f2f; }
```

---

## Article Reader Sizing

Two user-controlled CSS custom properties, set via JavaScript:

```typescript
// Font size index (0–4, maps to CSS values)
document.documentElement.style.setProperty('--article-font-idx', String(fontSizeIdx));

// Column width index (0–2)
document.documentElement.style.setProperty('--article-width-idx', String(widthIdx));
```

---

## Highlight CSS Classes

Applied to `<mark>` elements by `applyHighlightsToDOM()`:

| Class | When Applied |
|---|---|
| `article-highlight` | Always |
| `has-note` | Highlight has a note |
| `is-hovered` | Mouse is over any `<mark>` with same `data-highlight-id` |

---

## Tailwind CSS

Tailwind is used for all utility classes. The project uses standard Tailwind config.

**Dark mode:** Tailwind `dark:` variant works in tandem with `[data-theme='dark']`. Use `dark:` for Tailwind classes and CSS custom properties for complex theme-dependent logic.

**Do not use TailwindCSS `@apply` for new component styles** — write utility classes inline on the JSX elements.

---

## Icon Library

**Lucide React** — all icons imported from `lucide-react`.

```typescript
import { Trash2, Star, Archive } from 'lucide-react';
// Usage:
<Trash2 size={16} className="text-red-500" />
```

Find available icons at: https://lucide.dev/icons/

---

## Common UI Patterns

### Toast notification
```typescript
showToast('Message here', 'success'); // | 'error' | 'info'
```

### Confirm dialog
```typescript
setConfirmModal({
  message: t.permanentlyDelete,
  confirmLabel: t.delete,  // optional
  onConfirm: async () => {
    // do the action
    setConfirmModal(null); // always close at the end
  }
});
```

### Tooltip button
```tsx
<TooltipButton tooltip={t.delete} onClick={handleDelete}>
  <Trash2 size={16} />
</TooltipButton>
```

---

## Mobile Design & Glassmorphism

The app uses a mobile-first design system with premium visual effects:

**1. Glassmorphism Utility**
Use the `.glass` class for any sticky or fixed navigation elements:
```css
.glass {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
}
```

**2. Dynamic Viewport Units**
Always use `min-h-100dvh` for full-screen layouts to ensure compatibility with mobile browser address bars.

**3. Safe Area Padding**
Use the `.safe-pb` utility for mobile navigation bars to prevent overlap with the OS home indicator:
```css
.safe-pb {
  padding-bottom: calc(var(--safe-area-bottom) + 80px);
}
```

**4. Design Tokens**
- `--glass-bg`: Theme-aware background for glass elements.
- `--glass-border`: Subtle border for depth in glass elements.
- `--safe-area-bottom`: `env(safe-area-inset-bottom)` fallback.
