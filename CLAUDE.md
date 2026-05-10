# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run both web and API together (recommended)
npm run dev

# Run individually
npm run dev -w apps/web    # Vite dev server on :5173
npm run dev -w apps/api    # tsx watch on :3001

# Build
npm run build              # builds both
npm run build:web
npm run build:api

# Lint (web only)
npm run lint

# Start compiled API
npm run start -w apps/api
```

## Environment

Single `.env` at repo root. The API loads it with `dotenv.config({ path: '../../.env' })`.

```
MONGODB_URI=mongodb+srv://...
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
API_SECRET=dev-secret-key   # also used as VITE_API_KEY fallback on the web
```

Web reads `VITE_API_KEY` (falls back to `'dev-secret-key'`) and sends it as `X-API-KEY` header on every request.

## Architecture

**Monorepo:** npm workspaces — `apps/web` (React/Vite) and `apps/api` (Hono/Node).

### API (`apps/api/src/`)
- `index.ts` — single file: Hono app, all routes, WebSocket server
- `models/Article.ts` — Mongoose schema. **Mongoose strict mode is on**: any field not declared in the schema is silently stripped on save. Always add new fields here before using them.
- `utils/scraper.ts` — fetches URL, extracts metadata with Cheerio, extracts readable content with Mozilla Readability
- `lib/db.ts` — MongoDB connection (called lazily on each request)
- WebSocket on `/ws` broadcasts `{ type: 'REFETCH_ARTICLES' }` after every mutation; the web client reconnects automatically on disconnect

### Web (`apps/web/src/`)
- **`App.tsx` is a single large component** — all state, all view logic, all handlers. There is no router in use despite `react-router-dom` being installed; views switch conditionally (`if (selectedArticle) return <ArticleReader />`).
- **`useArticleStore.ts` (Zustand) is defined but not used** — App.tsx manages articles with local `useState`.
- `i18n.ts` — flat translation objects for `tr` and `en`. Add keys to both locales when adding any user-visible string. Accessed via `const t = translations[lang]`.
- Theme — CSS custom properties controlled by `data-theme` attribute on `<html>` (values: `light`, `dark`, `sepia`).

### Highlight System (`apps/web/src/highlights.ts`)
Pure utility module, no React dependencies.

- **`captureSelectionContext`** — converts a browser `Selection` to `{ text, prefix, suffix, startOffset }` where `startOffset` is the absolute character offset within the article container's `textContent`.
- **`applyHighlightsToDOM`** — called in `useEffect` after `dangerouslySetInnerHTML` renders; walks text nodes and wraps matches in `<mark class="article-highlight" data-highlight-id="...">`.
- **`isAlreadyHighlighted`** — returns true when a new selection is fully inside an existing highlight (suppresses the toolbar).
- **`mergeOverlappingHighlights`** — absorbs any existing highlights that overlap (partially or fully) with the new selection, returning the union bounds (`mergedStart`, `mergedEnd`) and combined notes from absorbed highlights.
- `CONTEXT_LENGTH = 40` — exported constant; used in App.tsx when computing prefix/suffix for merged highlights.

### Confirm Modal
The article reader (`if (selectedArticle)`) and the list view are two separate render branches. Any confirm modal must be rendered in **both** branches — it currently exists at the bottom of each.
