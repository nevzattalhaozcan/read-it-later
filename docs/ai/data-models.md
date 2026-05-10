# Data Models Reference

> Companion to `AGENTS.md`. Read this when adding fields, querying, or creating new models.

---

## ⚠️ Strict Mode Warning

**Mongoose strict mode is ON by default.** Any field you pass to `.save()` or `.findOneAndUpdate()` that is NOT declared in the schema is silently stripped. **Always add the field to the schema first, then use it.**

---

## Article

**File:** `apps/api/src/models/Article.ts`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `owner` | `ObjectId` → User | ✅ | — | Indexed. User-scoped queries always filter by this |
| `url` | `String` | ✅ | — | Unique per owner (compound index: `{owner, url}`) |
| `title` | `String` | ✅ | — | |
| `description` | `String` | — | — | Excerpt / OG description |
| `content` | `String` | — | — | Full HTML content from Readability |
| `textContent` | `String` | — | — | Plain text version (used for search, reading time) |
| `byline` | `String` | — | — | Author name |
| `siteName` | `String` | — | — | Publication name |
| `favicon` | `String` | — | — | Resolved absolute URL |
| `coverImage` | `String` | — | — | OG image URL |
| `tags` | `[String]` | — | `[]` | User-defined tags |
| `folder` | `String` | — | `'Inbox'` | User-defined folder name |
| `isRead` | `Boolean` | — | `false` | |
| `isFavorite` | `Boolean` | — | `false` | |
| `isArchived` | `Boolean` | — | `false` | |
| `readingTimeMinutes` | `Number` | — | — | Calculated at scrape time: `ceil(words / 225)` |
| `highlights` | `[HighlightSubdoc]` | — | `[]` | See sub-schema below |
| `createdAt` | `Date` | — | `Date.now` | Also managed by `timestamps: true` |
| `updatedAt` | `Date` | — | `Date.now` | Also managed by `timestamps: true` |

### Highlight Sub-schema

Embedded in `Article.highlights[]`:

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `id` | `String` | ✅ | — | Client-generated (see `generateId()` in highlights.ts) |
| `text` | `String` | ✅ | — | The highlighted text |
| `prefix` | `String` | — | `''` | 40 chars before highlight (context) |
| `suffix` | `String` | — | `''` | 40 chars after highlight (context) |
| `startOffset` | `Number` | — | — | Absolute char offset in article `textContent` |
| `note` | `String` | — | `''` | User's annotation |
| `createdAt` | `Date` | — | `Date.now` | |

---

## User

**File:** `apps/api/src/models/User.ts`

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `email` | `String` | ✅ | — | Unique, lowercase, trimmed |
| `password` | `String` | ✅ | — | bcrypt-hashed (auto via pre-save hook) |
| `name` | `String` | — | — | Display name |
| `emailVerified` | `Boolean` | — | `false` | Set to `true` after OTP verification |
| `createdAt` | `Date` | — | `Date.now` | Also managed by `timestamps: true` |

**Pre-save hook:** Hashes `password` with bcrypt (10 rounds) before saving if modified.

**Instance method:** `user.comparePassword(candidate)` → `Promise<boolean>`

---

## EmailOTP

**File:** `apps/api/src/models/EmailOTP.ts`

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | `String` | ✅ | Lowercase, trimmed |
| `code` | `String` | ✅ | 6-digit numeric string |
| `purpose` | `String` | ✅ | `'verify'` or `'reset'` |
| `used` | `Boolean` | — | Default `false`. Marked `true` after successful verify |
| `expiresAt` | `Date` | ✅ | Set to 10 minutes from creation time |

**TTL Index:** `{ expiresAt: 1, expireAfterSeconds: 0 }` — MongoDB auto-deletes expired docs.

---

## UserPreferences

**File:** `apps/api/src/models/UserPreferences.ts`

| Field | Type | Enum / Range | Default |
|---|---|---|---|
| `userId` | `ObjectId` → User | — | Required, unique |
| `lang` | `String` | `'tr'`, `'en'` | `'tr'` |
| `theme` | `String` | `'light'`, `'dark'`, `'sepia'` | `'light'` |
| `fontSizeIdx` | `Number` | 0–4 | `2` |
| `widthIdx` | `Number` | 0–2 | `1` |

**Upsert pattern:** `findOneAndUpdate({ userId }, { $set: body }, { new: true, upsert: true })`

---

## Adding a New Model Field

```
1. Add to schema in apps/api/src/models/<Model>.ts
2. If it has a default, set it in the schema (not in application code)
3. If it needs an index, add ArticleSchema.index({...}) at the bottom
4. Update this file (docs/ai/data-models.md)
5. Update the Article interface in apps/web/src/App.tsx if it's on Article
```
