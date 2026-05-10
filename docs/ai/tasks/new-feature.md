# New Feature Task Template

> Use this template when starting a new feature. Fill in each section before writing any code.

---

## Feature Brief

**What does this feature do?**
<!-- One paragraph. What problem does it solve? What does the user experience? -->

**Which app(s) does it touch?**
- [ ] Web (`apps/web/`)
- [ ] API (`apps/api/`)
- [ ] Extension (`apps/extension/`)

---

## Affected Files

Before writing code, identify which files you will touch:

**API side:**
- [ ] `apps/api/src/index.ts` (new route?)
- [ ] `apps/api/src/models/<Model>.ts` (new field?)
- [ ] Other: ___

**Web side:**
- [ ] `apps/web/src/App.tsx` (state + UI)
- [ ] `apps/web/src/i18n.ts` (new strings?)
- [ ] `apps/web/src/highlights.ts` (highlight changes?)
- [ ] Other: ___

---

## Pre-Flight Checklist

### Data Layer (if touching API or database)
- [ ] Read `docs/ai/data-models.md` — identify if a new schema field is needed
- [ ] **If new field needed:** Added to Mongoose schema BEFORE using it in routes
- [ ] New route added to `docs/ai/api.md` Routes Table
- [ ] Route calls `broadcast(...)` if it mutates data

### Web Layer
- [ ] Read `docs/ai/web-app.md` — identify which view branch(es) are affected
- [ ] State variable(s) added to `App.tsx`
- [ ] Handler function added to `App.tsx`
- [ ] If modal/overlay: rendered in BOTH list view AND reader view branches
- [ ] Uses `getHeaders()` for authenticated API calls

### i18n
- [ ] Read `docs/ai/i18n.md`
- [ ] All new user-visible strings added to BOTH `tr` and `en` in `i18n.ts`
- [ ] Key list in `docs/ai/i18n.md` updated

### Styling
- [ ] Icons from `lucide-react` only
- [ ] Theme-aware colors use CSS custom properties, not hardcoded hex
- [ ] No TailwindCSS `@apply` for new styles

---

## Implementation Notes

<!-- Any non-obvious decisions, edge cases, or things to watch out for -->

---

---

## Verification (MANDATORY)

- [ ] `npm run build:web` passes (if touching apps/web)
- [ ] No missing i18n keys
- [ ] No unused variables or imports
- [ ] Mobile layout tested (if touching UI)

---

## Docs to Update After Implementation

- [ ] `docs/ai/api.md` (if new route)
- [ ] `docs/ai/data-models.md` (if new field)
- [ ] `docs/ai/web-app.md` (if new state)
- [ ] `docs/ai/i18n.md` (if new keys)
- [ ] `docs/ai/architecture.md` (if architectural decision made)
