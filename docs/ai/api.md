# API Reference

> Companion to `AGENTS.md`. Read this when working on API routes, auth, email, or WebSocket.

---

## File Location

```
apps/api/src/index.ts   ← ALL routes live here (single-file monolith)
apps/api/src/lib/db.ts  ← MongoDB connection
apps/api/src/utils/mailer.ts       ← Email sending
apps/api/src/utils/scraper.ts      ← URL scraping
apps/api/src/utils/emailTemplates.ts ← HTML email renderer
```

---

## Base URL

```
http://localhost:3001   (dev)
https://api.sonra-okurum.com  (prod — check vercel.json for actual domain)
```

---

## Auth Strategy

- Hybrid Strategy: Supports both Firebase ID Tokens and legacy JWTs
- **Firebase Auth:** Main strategy for registration, login, and verification.
- **Legacy JWT:** Supported for backward compatibility. Token payload: `{ userId: string }`.
- `authMiddleware` verifies the token (Firebase first, then legacy JWT) and synchronizes the user with MongoDB using `firebaseUid`.
- `authMiddleware` is applied to all `/api/v1/*` routes except public ones.

---

## Routes Table

### Public (no auth required)

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET` | `/` | — | `text` | Health check |
| `POST` | `/api/v1/auth/register` | `{ email, password, name }` | `{ token, user }` | **DEPRECATED** (Use Firebase SDK on client) |
| `POST` | `/api/v1/auth/login` | `{ email, password }` | `{ token, user }` | **DEPRECATED** (Use Firebase SDK on client) |
| `POST` | `/api/v1/auth/send-otp` | `{ email, purpose }` | `{ success }` | **DEPRECATED** (Firebase handles mail) |
| `POST` | `/api/v1/auth/verify-otp` | `{ email, otp, purpose }` | `{ success }` | **DEPRECATED** |
| `POST` | `/api/v1/auth/reset-password` | `{ email, otp, newPassword }` | `{ success }` | **DEPRECATED** |

### Authenticated (Bearer token required)

| Method | Path | Body | Response | Broadcasts? |
|---|---|---|---|---|
| `GET` | `/api/v1/auth/me` | — | User object (no password) | — |
| `PATCH` | `/api/v1/auth/me` | `{ email?, currentPassword, newPassword? }` | Updated user | — |
| `DELETE` | `/api/v1/auth/me` | — | `{ success }` | REFETCH_ARTICLES + REFETCH_PREFERENCES |
| `DELETE` | `/api/v1/data` | — | `{ success }` | REFETCH_ARTICLES + REFETCH_PREFERENCES |
| `GET` | `/api/v1/articles` | — | `Article[]` (sorted by createdAt desc) | — |
| `POST` | `/api/v1/articles` | `{ url, html? }` | `Article` (201) | REFETCH_ARTICLES |
| `GET` | `/api/v1/check?url=...` | — | `{ exists: boolean }` | — |
| `PATCH` | `/api/v1/articles/:id` | Any Article fields | Updated Article | REFETCH_ARTICLES |
| `DELETE` | `/api/v1/articles/:id` | — | `{ success }` | REFETCH_ARTICLES |
| `GET` | `/api/v1/preferences` | — | UserPreferences or defaults | — |
| `PATCH` | `/api/v1/preferences` | `{ lang?, theme?, fontSizeIdx?, widthIdx? }` | Updated prefs | REFETCH_PREFERENCES |
| `POST` | `/api/v1/translate` | `{ text, target: 'tr'\|'en' }` | `{ translatedText, target, source }` | — |

---

## WebSocket

- **Path:** `ws://localhost:3001/ws`
- **Direction:** Server → Client only (broadcast)
- **Messages:**
  - `{ type: 'REFETCH_ARTICLES' }` — client calls `fetchArticles()`
  - `{ type: 'REFETCH_PREFERENCES' }` — client calls `fetchPreferences()`
- **Reconnect:** Client auto-reconnects every 5 seconds on disconnect
- **Rule:** Call `broadcast(...)` after EVERY mutation in the API

---

## Rate Limiting (in-memory, single-process)

| Limit | Default | Env Var |
|---|---|---|
| OTP send interval per email | 60 seconds | `OTP_EMAIL_INTERVAL_MS` |
| OTP sends per email per hour | 5 | `OTP_EMAIL_PER_HOUR` |
| OTP sends per IP per hour | 20 | `OTP_IP_PER_HOUR` |
| Verify attempts per email per hour | 10 | `VERIFY_ATTEMPTS_PER_HOUR` |

> **Warning:** Rate limits are in-memory. They reset on server restart and don't work across multiple instances.

---

**Firebase Flow:**
1. Client registers/logs in via Firebase SDK.
2. Firebase sends verification link/reset link.
3. Client sends ID Token to API.
4. API verifies token via `admin.auth().verifyIdToken(token)`.
5. API syncs `firebaseUid` and `emailVerified` with local MongoDB `User` doc.

**Legacy Flow:** (Deprecated)
1. Register →  save user →  generate OTP  →  sendEmail() in background
2. Verify  →  findOne({ email, code, purpose:'verify' }) → mark used → set emailVerified=true

- Email transporter is initialized at **server startup** (pre-warmed)
- If no SMTP env vars → falls back to Ethereal test account (logs preview URL)
- `sendEmail()` returns `{ info, preview }` — preview is only set for Ethereal

---

## Scraper

```typescript
scrapeUrl(url: string, providedHtml?: string): Promise<ScrapedData>
```

- If `providedHtml` is passed (from Chrome extension), skips the fetch
- Uses Cheerio for metadata (title, description, cover image, favicon)
- Uses Mozilla Readability for article content
- **Anti-bot fallback:** Detects Cloudflare blocks and retries via `https://r.jina.ai/{url}`
- Reading time: `ceil(wordCount / 225)` minutes, minimum 1

---

## Adding a New Route

1. Decide: public (on `app`) or protected (on `api`)?
2. Add the route handler in `apps/api/src/index.ts`
3. If it mutates data → call `broadcast({ type: 'REFETCH_ARTICLES' })` or `broadcast({ type: 'REFETCH_PREFERENCES' })`
4. If it uses a new model field → add to schema first (see `docs/ai/data-models.md`)
5. Update this file's Routes Table
