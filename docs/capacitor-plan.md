# Capacitor Mobile App Plan — sonra-okurum

> Wrap the existing React/Vite web app in native iOS & Android shells using Capacitor.
> Goal: ship to App Store + Play Store with minimal code changes.

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js** ≥ 18 | Already have |
| **Xcode** ≥ 15 (iOS) | Mac only — needed for iOS simulator + builds |
| **Android Studio** (Android) | Needed for Android emulator + builds |
| **CocoaPods** (iOS) | `sudo gem install cocoapods` or `brew install cocoapods` |
| **Apple Developer Account** ($99/yr) | Required for App Store submission |
| **Google Play Developer Account** ($25 one-time) | Required for Play Store submission |

---

## 2. Installation & Init

All commands run from `apps/web/`:

```bash
# Install Capacitor core + CLI
npm install @capacitor/core
npm install -D @capacitor/cli

# Initialize Capacitor
npx cap init "sonra okurum" "com.sonraokurum.app" --web-dir dist

# Add platforms
npm install @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

This creates:
```
apps/web/
├── ios/                 ← Xcode project (native shell)
├── android/             ← Android Studio project (native shell)
├── capacitor.config.ts  ← Capacitor configuration
└── ...existing files
```

---

## 3. Capacitor Configuration

### `apps/web/capacitor.config.ts`

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sonraokurum.app',
  appName: 'sonra okurum',
  webDir: 'dist',
  server: {
    // Production: load from bundled files (default)
    // Dev: uncomment below to use live reload
    // url: 'http://192.168.x.x:5173',
    // cleartext: true,
  },
  ios: {
    contentInset: 'automatic', // handle safe areas
  },
  android: {
    // Allow mixed content for dev
    // allowMixedContent: true,
  },
};

export default config;
```

---

## 4. Vite Config Changes

### Problem: `base: '/sonra-okurum/'`

The current `vite.config.ts` sets `base: '/sonra-okurum/'` which is for Vercel sub-path deployment. Capacitor loads files from the local filesystem, so it needs `base: '/'`.

### Solution: Environment-aware base path

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  // Capacitor loads from local fs, needs '/'
  // Vercel needs '/sonra-okurum/'
  base: mode === 'capacitor' ? '/' : '/sonra-okurum/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  }
}))
```

Then build for mobile with:
```bash
npx vite build --mode capacitor
```

---

## 5. Code Changes Required

### 5.1 API Base URL

**Current** (line 362 in App.tsx):
```ts
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
```

**Problem:** On mobile, there's no Vite dev proxy. The app runs on-device, so API calls to relative paths (`/api/...`) will fail. The app must always use the **absolute production API URL**.

**Fix:** Set `VITE_API_URL` in a `.env.capacitor` or `.env.production` file pointing to your deployed API (e.g., `https://your-api.vercel.app`). Since the current code already reads `VITE_API_URL`, this should work out of the box — just make sure the env var is set when building for mobile.

```env
# apps/web/.env.capacitor (new file)
VITE_API_URL=https://your-deployed-api-url.vercel.app
VITE_API_KEY=6bc58ddc...
```

### 5.2 WebSocket URL

**Current** (around line 437 in App.tsx): The WebSocket URL is likely derived from `API_BASE` or hardcoded. On mobile it must point to `wss://your-deployed-api-url`.

**Action:** Verify how `WS_URL` is constructed and ensure it resolves to the absolute production WebSocket endpoint when running in Capacitor.

### 5.3 Safe Area Insets (CSS)

Mobile devices have notches, rounded corners, and home indicators. The app needs to respect safe areas.

**Add to `index.html`:**
```html
<meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

**Add to `index.css`:**
```css
/* Safe area support for Capacitor */
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

> [!WARNING]
> The `env(safe-area-inset-*)` values are 0 on web, so this won't affect the Vercel deployment.

### 5.4 Status Bar

```bash
npm install @capacitor/status-bar
```

```ts
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

// Call on app mount
if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Dark }); // or Style.Light based on theme
  StatusBar.setBackgroundColor({ color: '#0f172a' }); // match your dark bg
}
```

### 5.5 Platform Detection Helper

Create a simple helper to detect Capacitor environment:

```ts
import { Capacitor } from '@capacitor/core';

export const isNative = () => Capacitor.isNativePlatform();
export const isIOS = () => Capacitor.getPlatform() === 'ios';
export const isAndroid = () => Capacitor.getPlatform() === 'android';
export const isWeb = () => Capacitor.getPlatform() === 'web';
```

This lets you conditionally adjust behavior (e.g., hide "install Chrome extension" prompts on mobile).

### 5.6 Clipboard API

**Current** (line 919 in App.tsx):
```ts
await navigator.clipboard.writeText(value);
```

This may not work reliably on all mobile WebViews. Use the Capacitor Clipboard plugin:

```bash
npm install @capacitor/clipboard
```

```ts
import { Clipboard } from '@capacitor/clipboard';
import { Capacitor } from '@capacitor/core';

async function copyToClipboard(value: string) {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: value });
  } else {
    await navigator.clipboard.writeText(value);
  }
}
```

### 5.7 External Links

Any `window.open()` or `<a target="_blank">` calls should use the Capacitor Browser plugin to open in an in-app browser:

```bash
npm install @capacitor/browser
```

```ts
import { Browser } from '@capacitor/browser';

// Instead of window.open(url)
await Browser.open({ url });
```

---

## 6. Build & Run Workflow

```bash
# 1. Build the web app for Capacitor
cd apps/web
npx vite build --mode capacitor

# 2. Copy web assets into native projects
npx cap sync

# 3. Open in IDE
npx cap open ios        # opens Xcode
npx cap open android    # opens Android Studio

# 4. Run on simulator/device from within the IDE
```

### Live Reload (Development)

For faster dev iteration, point Capacitor at your Vite dev server:

```bash
# 1. Start Vite dev server (make sure it binds to 0.0.0.0)
npx vite --host

# 2. Update capacitor.config.ts:
#    server.url = 'http://<YOUR_LOCAL_IP>:5173'

# 3. Sync and run
npx cap sync
npx cap run ios  # or android
```

> [!NOTE]
> Remember to remove `server.url` from `capacitor.config.ts` before making production builds.

---

## 7. App Icons & Splash Screen

The current logo is at `apps/web/public/logo.png` (463KB). You'll need platform-specific sizes:

```bash
npm install -D @capacitor/assets
```

Then place source images:
```
apps/web/resources/
├── icon-only.png          ← 1024×1024, no transparency (iOS), or with (Android)
├── icon-foreground.png    ← 1024×1024, adaptive icon foreground (Android)
├── icon-background.png    ← 1024×1024, adaptive icon background (Android)
└── splash.png             ← 2732×2732, centered logo on solid bg
```

Generate all sizes:
```bash
npx capacitor-assets generate
```

---

## 8. What WON'T Work (and Alternatives)

| Web Feature | Issue on Mobile | Solution |
|---|---|---|
| Vite proxy (`/api`) | No dev server on device | Always use absolute API URL |
| `navigator.clipboard` | Inconsistent WebView support | `@capacitor/clipboard` plugin |
| `window.open()` | Opens in external browser | `@capacitor/browser` plugin |
| Google Fonts `<link>` | Requires network on first load | Bundle fonts or accept first-load dependency |
| Chrome Extension prompts | N/A on mobile | Hide with `isNative()` check |
| WebSocket `ws://` | May be blocked on iOS | Ensure `wss://` (TLS) is used |

---

## 9. Optional Native Enhancements (Future)

These are not required for v1 but would significantly improve the mobile experience:

| Feature | Plugin | Effort |
|---|---|---|
| **Push Notifications** | `@capacitor/push-notifications` + Firebase | Medium |
| **Share Target** (receive shared URLs) | `@capacitor/share` / `capacitor-receive-intent` | Medium |
| **Biometric Auth** (Face ID / fingerprint) | `capacitor-native-biometric` | Low |
| **Haptic Feedback** | `@capacitor/haptics` | Trivial |
| **Offline Storage** | `@capacitor/preferences` (replaces localStorage) | Low |
| **App Badge** (unread count) | `@capacitor/badge` | Trivial |
| **Deep Linking** | `@capacitor/app` | Medium |
| **Splash Screen** | `@capacitor/splash-screen` | Trivial |

---

## 10. Store Submission Checklist

### iOS (App Store)
- [ ] Apple Developer Program enrollment ($99/yr)
- [ ] App icons (all sizes via `capacitor-assets`)
- [ ] App Store screenshots (6.7", 6.5", 5.5" iPhone + iPad if universal)
- [ ] Privacy policy URL (you have `policies.ts` — host it)
- [ ] App Store description, keywords, category
- [ ] Xcode → Archive → Upload to App Store Connect
- [ ] TestFlight beta testing (recommended before public release)

### Android (Play Store)
- [ ] Google Play Developer account ($25 one-time)
- [ ] Signed APK/AAB (Android Studio → Build → Generate Signed Bundle)
- [ ] Feature graphic (1024×500)
- [ ] Screenshots (phone + tablet)
- [ ] Privacy policy URL
- [ ] Play Store listing content
- [ ] Internal testing track (recommended before production)

---

## 11. Monorepo Integration

The `ios/` and `android/` folders will live inside `apps/web/`. Add them to `.gitignore` if you prefer not to track native projects (regeneratable), or commit them if you customize native code.

**Recommended npm scripts** (add to `apps/web/package.json`):

```json
{
  "scripts": {
    "build:mobile": "vite build --mode capacitor",
    "cap:sync": "cap sync",
    "cap:ios": "cap open ios",
    "cap:android": "cap open android",
    "mobile:ios": "npm run build:mobile && cap sync && cap open ios",
    "mobile:android": "npm run build:mobile && cap sync && cap open android"
  }
}
```

---

## 12. Estimated Effort

| Phase | Time |
|---|---|
| Setup + basic running app | ~2 hours |
| Fix API URL / WebSocket / base path | ~1 hour |
| Safe areas + status bar | ~1 hour |
| Clipboard / Browser plugins | ~30 min |
| App icons + splash screen | ~1 hour |
| Testing on simulators | ~2 hours |
| Store submission prep | ~4 hours |
| **Total to first store build** | **~1-2 days** |

---

## Summary

The core idea is simple: **build your Vite app → copy into native shell → run**. The main code changes are:

1. Make `base` path conditional (`/` for mobile, `/sonra-okurum/` for Vercel)
2. Ensure `VITE_API_URL` points to production API in mobile builds
3. Add CSS safe area insets
4. Swap a few browser APIs for Capacitor plugins (clipboard, external links)
5. Hide web-only UI (extension prompts) on native

Everything else — your React components, styling, state management, i18n — works as-is.
