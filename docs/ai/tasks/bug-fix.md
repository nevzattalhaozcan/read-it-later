# Bug Fix Task Template

> Use this template when fixing a bug. Fill in before touching code.

---

## Bug Report

**Symptom:**
<!-- What the user sees. Be specific: "When I click X, Y happens instead of Z" -->

**Reproduction Steps:**
1.
2.
3.

**Expected behavior:**

**Actual behavior:**

**Environment:** (dev / prod / both)

---

## Investigation

**Suspected area(s):**
- [ ] Web (`App.tsx` state / handler / render)
- [ ] API (route logic / middleware)
- [ ] Database (schema / query)
- [ ] Highlight system (`highlights.ts`)
- [ ] WebSocket sync
- [ ] Email / OTP flow

**Files to check first:**

<!-- List the files most likely to contain the bug based on the symptom -->

---

## Root Cause

<!-- Fill in after investigation -->

**File:** `apps/...`
**Line(s):**
**Explanation:**

---

## Fix

**What changed and why:**

<!-- Describe the change. Don't just say "fixed the bug" — explain the mechanism. -->

---

## Verification

- [ ] Reproduced the bug before fixing
- [ ] Verified fix resolves the symptom
- [ ] Checked for regressions in related areas:
  - [ ] Did anything else call the same function/route?
  - [ ] Does the fix affect other view branches? (list/reader)
  - [ ] WebSocket broadcasts still working?
- [ ] If schema changed: Mongoose strict mode respected?
- [ ] If new user-visible text: i18n keys added?
- [ ] **MANDATORY:** `npm run build:web` passes (if touching apps/web)
- [ ] **MANDATORY:** No unused variables or imports left behind

---

## Known Gotchas for This Area

*(Fill in from the relevant `docs/ai/*.md` file after reading it)*
