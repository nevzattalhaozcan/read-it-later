# Architecture Decisions

> Companion to `AGENTS.md`. Documents *why* things are the way they are. Read this before proposing structural changes.

---

## ADR-001: Single-File Monoliths for App.tsx and index.ts

**Decision:** All web state/view logic lives in `App.tsx`. All API routes live in `index.ts`.

**Rationale:** The app started as a rapid prototype. Splitting into many files adds indirection without benefit at this scale. Both files are ~500–2100 lines but fully navigable with search.

**Consequence:** New features get added inline. Extraction into separate components/route files should be done as a deliberate refactor, not incidentally.

---

## ADR-002: No React Router

**Decision:** Views switch with `if/else` conditionals, not a router.

**Rationale:** The app has very few distinct views (auth, list, reader, settings). React Router would add complexity without benefit. The URL is used only for deep-linking to articles/highlights via query params (`?article=&highlight=`).

**Consequence:** No `<Link>` or `useNavigate`. URL manipulation happens via `window.history` or `window.location` directly.

---

## ADR-003: Zustand Store Exists But Is Not Used

**Decision:** `apps/web/src/store/useArticleStore.ts` (Zustand) was created but never wired up. `App.tsx` uses `useState`.

**Rationale:** State centralization into Zustand was planned but never completed. App.tsx state management works correctly so migration was deprioritized.

**Consequence:** Do NOT use the Zustand store in new features. If migrating, it should be a single complete migration, not partial.

---

## ADR-004: WebSocket for Real-Time Sync

**Decision:** A plain `ws` WebSocket server on the same port as the HTTP API, triggered after every mutation.

**Rationale:** Simple alternative to polling. The web app automatically re-fetches when it receives a broadcast message.

**Consequence:** No room support — all connected clients see all updates. Fine for a single-user app. The server only broadcasts, never sends targeted messages.

---

## ADR-005: Highlights Stored on Article Document

**Decision:** Highlights are stored as an embedded array in the `Article` document, not a separate collection.

**Rationale:** Simplicity. Highlights are always fetched together with the article, never queried independently. No joins needed.

**Consequence:** PATCH the entire `highlights` array to update highlights. No atomic per-highlight operations. Fine for typical usage patterns (< 50 highlights per article).

---

## ADR-006: Non-Blocking Email Sending in Auth Routes

**Decision:** In `/auth/register` and related routes, OTP emails are sent in the background (`.catch()` pattern, not `await`).

**Rationale:** Ethereal test account creation can take 3–10 seconds. Blocking registration on email delivery caused 502 timeouts in production.

**Consequence:** Registration is fast (< 500ms). Email delivery is best-effort. If email fails, it's logged but doesn't fail the registration.

---

## ADR-007: Chrome Extension Has No Build Step

**Decision:** `apps/extension/popup.js` is plain JavaScript, no bundler.

**Rationale:** The extension is a thin client — it just reads the current page URL and sends it to the API. No framework needed.

**Consequence:** No TypeScript, no imports, no bundling. Keep it simple.

---

## ADR-008: Single `.env` at Repo Root

**Decision:** One `.env` file at the monorepo root, shared by both apps.

**Rationale:** Simpler than per-app `.env` files. The web app reads `VITE_*` vars via Vite. The API reads server vars directly. They don't overlap.

**Consequence:** `dotenv.config({ path: '../../.env' })` — the relative path from `apps/api/src/` to the root. Don't change this.

---

## Tech Debt Log

| Issue | Impact | Notes |
|---|---|---|
| `App.tsx` is 2100+ lines | Medium | Planned refactor into smaller components |
| Zustand store unused | Low | Migrate or delete |
| Rate limiting is in-memory | Medium | Won't survive restarts or multi-instance deploy |
| No test suite | High | Manual testing only |
| `useArticleStore.ts` empty | Low | Remove or implement |
