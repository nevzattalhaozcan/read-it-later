# Web App Reference

> Companion to `AGENTS.md`. Read this when working on `App.tsx`, UI state, or any web-side feature.

---

## Architecture Warning

`apps/web/src/App.tsx` is a **~2100-line monolithic React component**. There is intentionally no router — all view switching is done with `if/else` conditions.

**Mobile Layout Patterns:**
- **Sidebar:** Hidden on screens < `lg` (1024px).
- **Bottom Navigation:** Fixed to bottom on screens < `lg` for core filters.
- **Header:** Simplified on mobile with a togglable search bar and "Add URL" popover.
- **Reader View:** Navigation bar adapts to smaller screens. Article actions menu expands horizontally to the left for a cleaner, integrated look.
- **Glassmorphism:** Most sticky/fixed UI elements use `.glass` utility for premium aesthetics, though the article actions menu uses a more integrated solid background style.

---

## View Rendering Logic

```
if (!token)
  if (pendingVerificationToken)
    → <VerificationWall> (Link verification screen, blocks app access)
  else
    → <AuthView>         (login / register / forgot password)
else if (isSettingsOpen)
  → <SettingsView>
else if (selectedArticle)
  → <ArticleReaderView>
else
  → <ArticleListView>    (sidebar [lg only] + responsive header + article grid + bottom nav [mobile only])
```

> **Critical:** Any confirm modal, toast, or overlay that must be visible regardless of view must be rendered in **both** the list view and reader view branches.

---

## API Base URLs (constructed at runtime)

```typescript
const API_BASE  = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
const API_URL   = `${API_BASE}/api/v1/articles`;
const PREFS_URL = `${API_BASE}/api/v1/preferences`;
const AUTH_URL  = `${API_BASE}/api/v1/auth`;
const WS_URL    = `${API_BASE.replace(/^https?/, m => m === 'https' ? 'wss' : 'ws')}/ws`;
```

---

## State Inventory

All state lives in the `App` component. Key state variables:

### Auth & User
| State | Type | Purpose |
|---|---|---|
| `token` | `string \| null` | Firebase ID Token (persisted in localStorage) |
| `user` | `{ id, email, name?, emailVerified? } \| null` | Logged-in user synced from MongoDB |
| `pendingVerificationToken` | `string \| null` | Firebase ID Token held while waiting for link verification |
| `authMode` | `'login' \| 'register'` | Auth form mode toggle |
| `authForm` | `{ email, password, name }` | Auth form controlled inputs |
| `authError` | `string \| null` | Auth form error message |
| `forgotError` | `string \| null` | Forgot password error (separate from authError!) |
| `forgotOpen` | `boolean` | Forgot password panel visibility |
| `forgotStep` | `null` | **DEPRECATED** (Firebase handles reset flow) |
| `registerEmail` | `string` | Email captured at register/login, used for verify screen |

### Articles & Navigation
| State | Type | Purpose |
|---|---|---|
| `articles` | `Article[]` | Full list fetched from API |
| `selectedArticle` | `Article \| null` | Currently open article |
| `activeFilter` | `{ type, value? }` | Sidebar navigation filter |
| `searchQuery` | `string` | Full-text search input |
| `expandedArticles` | `string[]` | IDs of cards with expanded metadata |

### Highlighting & Notes
| State | Type | Purpose |
|---|---|---|
| `highlightToolbar` | `{x, y, text, prefix, suffix, startOffset} \| null` | Floating highlight action bar |
| `noteText` | `string` | Note textarea content |
| `activeHighlightPopover` | `{id, x, y} \| null` | Click-to-view popover on a highlight |
| `contextMenu` | `{x, y, text, highlightId?} \| null` | Right-click context menu |
| `translationPopover` | `{x, y, sourceText, translatedText?, loading, error?} \| null` | Translate result |
| `highlightKey` | `number` | Incremented to force re-render of highlights |
| `targetHighlightId` | `string \| null` | Deep-link highlight to scroll to |

### UI & Settings
| State | Type | Purpose |
|---|---|---|
| `toasts` | `Toast[]` | Active toast notifications |
| `confirmModal` | `{ message, onConfirm, confirmLabel? } \| null` | Generic confirm dialog |
| `isSettingsOpen` | `boolean` | Settings page visibility |
| `activeMenuId` | `string \| null` | Which article card's "⋯" menu is open |
| `lang` | `'tr' \| 'en'` | UI language |
| `theme` | `'light' \| 'dark' \| 'sepia'` | Color theme |
| `fontSizeIdx` | `0–4` | Article reader font size index |
| `widthIdx` | `0–2` | Article reader column width index |
| `isSearchActive` | `boolean` | Search bar expanded state |
| `isAddUrlActive` | `boolean` | Add URL bar expanded state |
| `isLibraryOpen` | `boolean` | Mobile library (folders/tags) view open state |
| `isArticleMenuOpen` | `boolean` | Reader view side menu open state |

---

## Key Handlers & Utilities

### `showToast(message, type?)`
Shows a toast notification. `type` = `'success'` | `'error'` | `'info'`. Auto-dismisses in 4 seconds.

### `confirm(message, onConfirm, confirmLabel?)`
Sets `confirmModal` state — renders a modal. Must call `setConfirmModal(null)` inside `onConfirm`.

### `updateArticle(id, updates)`
PATCH to API + optimistically updates both `articles` array and `selectedArticle`.

### `fetchArticles()` / `fetchPreferences()` / `fetchUser()`
Plain fetch calls. Called on token mount and triggered by WebSocket messages.

### `handleLogout()`
Clears localStorage token, resets all auth/article state.

### Auth Handlers (Firebase)
- `onAuthStateChanged` — Global listener. Auto-syncs `token` and `pendingVerificationToken`.
- `handleLogin(e)` — `signInWithEmailAndPassword`. If unverified, sets `pendingVerificationToken`.
- `handleRegister(e)` — `createUserWithEmailAndPassword`. Sends verification email.
- `handleVerifyCode()` — `fbUser.reload()`. Checks if `emailVerified` is now true.
- `handleResendVerify()` — `sendEmailVerification` (Firebase link).
- `handleRequestReset()` — `sendPasswordResetEmail` (Firebase link).

---

## Adding a New Feature (web-side checklist)

1. Add state variable(s) if needed
2. Add handler function
3. Add i18n keys to `i18n.ts` (both `tr` and `en`)
4. Add UI in the appropriate view branch
5. If it's a modal/overlay → ensure it's in BOTH `ArticleListView` and `ArticleReaderView` branches
6. If it calls the API → use `getHeaders()` for auth headers

---

## Refs

| Ref | Purpose |
|---|---|
| `articleContentRef` | Points to article content div — used by highlights system |
| `searchInputRef` | Auto-focus search input |
| `addUrlInputRef` | Auto-focus URL input |
| `searchContainerRef` | Click-outside detection for search bar |
| `addUrlContainerRef` | Click-outside detection for URL bar |
| `deepLinkApplied` | Prevents double-application of deep link on article open |
| `prefsLoaded` | Guards preferences sync effect from running before first load |
| `lastSyncedPrefs` | Tracks last synced prefs to avoid redundant PATCH calls |
