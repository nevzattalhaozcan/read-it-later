# Highlight System Reference

> Companion to `AGENTS.md`. Read this when working on text highlighting, notes, or the context menu.

---

## File Location

```
apps/web/src/highlights.ts   ← pure utility, no React/DOM imports at module level
```

---

## The `Highlight` Interface

```typescript
interface Highlight {
  id: string;          // client-generated via generateId()
  text: string;        // the highlighted text (trimmed)
  prefix: string;      // up to 40 chars before the highlight
  suffix: string;      // up to 40 chars after the highlight
  startOffset: number; // absolute char offset in container.textContent
  note: string;        // user annotation (empty string if none)
  createdAt: string;   // ISO date string
}
```

Stored in `Article.highlights[]` in MongoDB (see `docs/ai/data-models.md`).

---

## Public API

### `generateId(): string`
Generates a unique highlight ID. Always use this — never hardcode IDs.

---

### `captureSelectionContext(container, selection)`

**When to call:** After a user makes a text selection in the article content.

```typescript
captureSelectionContext(
  containerEl: HTMLElement,  // articleContentRef.current
  selection: Selection       // window.getSelection()
) → { text, prefix, suffix, startOffset } | null
```

Returns `null` if:
- Selection is collapsed or empty
- Selected text is 1 character or less
- Selection is outside the container

**What `startOffset` means:** Absolute character index in `container.textContent`. This is what makes highlights position-stable — prefix/suffix are just fallbacks.

---

### `isAlreadyHighlighted(highlights, newStartOffset, newText)`

Returns `true` if the new selection is **fully contained** inside an existing highlight. Used to suppress the highlight toolbar when clicking inside an existing highlight.

```typescript
isAlreadyHighlighted(
  highlights: Highlight[],
  newStartOffset: number,
  newText: string
) → boolean
```

---

### `mergeOverlappingHighlights(existingHighlights, newStartOffset, newText)`

When a new highlight overlaps with existing ones, absorb them:

```typescript
mergeOverlappingHighlights(
  existingHighlights: Highlight[],
  newStartOffset: number,
  newText: string
) → {
  remainingHighlights: Highlight[];  // highlights NOT absorbed
  absorbedNote: string;              // combined notes from absorbed highlights
  mergedStart: number;               // union start offset
  mergedEnd: number;                 // union end offset
}
```

**Used in:** The "Add Highlight" handler in App.tsx — before saving, merge overlapping ones so there are no nested/duplicate highlights.

---

### `applyHighlightsToDOM(container, highlights, onClickHighlight)`

**When to call:** In `useEffect` AFTER `dangerouslySetInnerHTML` renders the article content.

```typescript
applyHighlightsToDOM(
  container: HTMLElement,           // articleContentRef.current
  highlights: Highlight[],
  onClickHighlight: (id: string) => void
) → void  // mutates DOM directly
```

**How it works:**
1. For each highlight, calls `findHighlightPosition()` using a 3-strategy fallback:
   - Strategy 0: Exact `startOffset` match (fastest, most reliable)
   - Strategy 1: Normalized prefix+text+suffix context match (flexible whitespace)
   - Strategy 2: Plain regex text search (last resort)
2. Wraps matched text ranges in `<mark class="article-highlight" data-highlight-id="...">` elements
3. Applies `.has-note` class if the highlight has a note
4. Attaches click, mouseenter, mouseleave listeners
5. **Processes in reverse order** to avoid offset drift from DOM mutations

**Fallback for cross-element ranges:** `wrapRangeAcrossElements()` handles cases where `Range.surroundContents()` fails (e.g., selection crosses `<p>` boundaries).

---

## CSS Classes Applied to `<mark>` Elements

| Class | When |
|---|---|
| `article-highlight` | Always |
| `has-note` | Highlight has a non-empty `note` |
| `is-hovered` | Mouse is over any `<mark>` with this `data-highlight-id` |

These classes are used in `apps/web/src/index.css` for visual styling.

---

## Deep Link Flow

URL format: `?article=<articleId>&highlight=<highlightId>`

1. App reads query params on load
2. Sets `selectedArticle` and `targetHighlightId`
3. After highlights are applied to DOM, a `useEffect` watches `targetHighlightId`
4. Scrolls the matching `<mark>` into view and clears `targetHighlightId`

---

## Common Pitfalls

- **Don't call `applyHighlightsToDOM` before content renders.** The container must have `innerHTML` set (via `dangerouslySetInnerHTML`) first.
- **`startOffset` can be undefined** for old highlights saved before the offset system was added. All functions handle this with `if (h.startOffset === undefined)` guards.
- **`surroundContents` throws when crossing element boundaries.** This is expected — the internal fallback handles it.
- **Highlights are stored on the `Article` document.** To update them: `PATCH /api/v1/articles/:id` with `{ highlights: [...] }`.
