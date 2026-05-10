# AGENTS.md — sonra-okurum

> **Read this file first.** It is the single source of truth for AI agents working on this codebase.
> After reading this file, consult the relevant `docs/ai/*.md` file before touching any code.

---

## What Is This Project?

**sonra-okurum** is a read-it-later web application (like Pocket/Instapaper) with text highlighting, notes, article organization, and a Chrome extension for quick saves. Users authenticate, save URLs, read articles in a clean reader view, and annotate with highlights and notes.

**Live:** Deployed on Vercel (web) + Vercel Serverless (API).

---

## Stack (one-liner per tech)

| Layer | Tech |
|---|---|
| Monorepo | npm workspaces (`apps/web`, `apps/api`) |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Hono on Node.js (`@hono/node-server`) |
| Database | MongoDB Atlas via Mongoose |
| Auth | JWT (30-day expiry) + OTP email verification |
| Email | Nodemailer (SMTP or Ethereal test fallback) |
| Real-time | WebSocket (`ws`) — broadcast-only, no rooms |
| Extension | Plain JS Chrome extension (`apps/extension/`) |

---

## Dev Commands

```bash
# Start everything (recommended)
npm run dev                        # web :5173 + api :3001 concurrently

# Individual
npm run dev -w apps/web            # Vite dev server only
npm run dev -w apps/api            # tsx watch only

# Build
npm run build                      # builds both
npm run build:web
npm run build:api

# Lint (web only)
npm run lint
```

---

## Environment

Single `.env` at **repo root**. API loads it with `dotenv.config({ path: '../../.env' })`.

```
MONGODB_URI=mongodb+srv://...
PORT=3001
CLIENT_ORIGIN=http://localhost:5173
JWT_SECRET=<secret>
API_SECRET=<secret>

# Email (optional — falls back to Ethereal test account if missing)
EMAIL_SMTP_HOST=
EMAIL_SMTP_PORT=
EMAIL_SMTP_USER=
EMAIL_SMTP_PASS=
EMAIL_FROM=
APP_NAME=sonra-okurum

# Rate limits (optional)
OTP_EMAIL_INTERVAL_MS=60000
OTP_EMAIL_PER_HOUR=5
OTP_IP_PER_HOUR=20
VERIFY_ATTEMPTS_PER_HOUR=10
```

---

## Architecture in 60 Seconds

```
apps/
├── web/src/
│   ├── App.tsx          ← MONOLITH: all state, all views, all handlers in ONE component
│   ├── highlights.ts    ← pure utility, no React deps
│   ├── i18n.ts          ← flat translation objects (tr + en)
│   ├── policies.ts      ← legal text (ToS, Privacy)
│   └── index.css        ← Tailwind + CSS custom properties for theming
│
├── api/src/
│   ├── index.ts         ← MONOLITH: all Hono routes + WebSocket server
│   ├── models/          ← Mongoose schemas (Article, User, EmailOTP, UserPreferences)
│   ├── utils/           ← scraper.ts, mailer.ts, emailTemplates.ts
│   └── lib/db.ts        ← MongoDB connection with promise pooling
│
└── extension/           ← popup.html + popup.js (plain JS, no build step)
```

**Routing pattern (web):** No React Router. Views switch with `if/else` conditions:
```
not authenticated → <AuthView>
authenticated + !selectedArticle + !isSettingsOpen → <ArticleListView>
authenticated + selectedArticle → <ArticleReaderView>
authenticated + isSettingsOpen → <SettingsView>
```

---

## Critical Rules & Gotchas

> **STOP.** Read these before writing any code.

1. **Mongoose strict mode is ON.** Any field not declared in the schema is silently dropped on save. Always add new fields to the schema (`apps/api/src/models/`) BEFORE using them.

2. **App.tsx is a 2000+ line monolith.** Do not add new top-level components alongside it — extend within the existing file until a proper refactor is planned.

3. **i18n is required for ALL user-visible strings.** Add keys to BOTH `tr` and `en` objects in `apps/web/src/i18n.ts`. Access via `const t = translations[lang]`.

4. **WebSocket is broadcast-only.** After any mutation in the API, call `broadcast({ type: 'REFETCH_ARTICLES' })` or `broadcast({ type: 'REFETCH_PREFERENCES' })`. The web client will re-fetch automatically.

5. **Confirm modal must be in BOTH render branches.** The article list view and reader view are separate conditional branches. Any modal/overlay must be rendered in both.

6. **`useArticleStore.ts` (Zustand) exists but is NOT used.** App.tsx manages articles with local `useState`. Don't use the Zustand store without a deliberate refactor decision.

7. **DB connection is pre-initialized at startup** (`connectDB()` called in `index.ts` bottom). Individual routes still call `await connectDB()` for safety, but connection is already warm.

8. **Email sending in register routes is non-blocking** (`.catch()` not `await`). Don't revert this — it was a deliberate perf fix.

9. **Scraper fallback:** When a URL is blocked by Cloudflare, the scraper falls back to `r.jina.ai`. Don't remove this.

10. **Extension has no build step** — `popup.js` is plain JS, directly referenced in `popup.html`.

---

## Commit Convention

```
type(scope): short description

Types: feat | fix | perf | refactor | style | docs | chore | test
Scope: api | web | ext | db | auth | highlight | i18n | email
```

Examples:
- `feat(web): add reading progress indicator`
- `fix(api): handle null byline in scraper`
- `perf(api): make email sending non-blocking`

---

## AI Docs Index

Before touching a subsystem, read the relevant doc:

| Task | Read This |
|---|---|
| API routes / auth / email | `docs/ai/api.md` |
| Web state / views / handlers | `docs/ai/web-app.md` |
| Database schemas | `docs/ai/data-models.md` |
| Highlighting / notes | `docs/ai/highlight-system.md` |
| Translations | `docs/ai/i18n.md` |
| Theming / CSS | `docs/ai/styling.md` |
| Architecture decisions | `docs/ai/architecture.md` |
| **Starting a new feature** | `docs/ai/tasks/new-feature.md` |
| **Fixing a bug** | `docs/ai/tasks/bug-fix.md` |
| **Debugging** | `docs/ai/tasks/debug.md` |
