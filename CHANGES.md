## 2026-06-23 — V1 Decimal Strip (Task #1)

- **What**: n8n Escape Output node ထဲ trailing-zero decimal strip regex ထည့်
- **Where**: workflow `iC2L4vfEoB3urfXz` → Escape Output node (JS code 2 lines → 8 lines)
- **Risk**: 🟢 Low (n8n node only, no Next.js touch)
- **Verified**: Burmese product list query + CONFIRM flow + sale post + daily revenue query — all clean numbers, no `.၀၀`
- **Receipt verified**: INV-20260622-00061 = 25,000 ကျပ်
- **Rollback**: n8n editor History → restore previous version
- **Verified by**: Saii (laptop browser)

## 2026-06-23 — Task #2: body.lang Format Normalization

- **What**: n8n Normalize node Stage 4 ထဲ short-code → long-code mapping ထည့် (`my` → `my-MM`, `en` → `en-US`, `th` → `th-TH`)
- **Where**: workflow `iC2L4vfEoB3urfXz` → Normalize node (Stage 4, 3 lines added)
- **Risk**: 🟢 Low (Stage 0/1/2/3 untouched; fallback path preserved)
- **Fixes latent bug**: ChatBubble sends short codes; Normalize expected long codes; sticky lang never activated; Stage 2 wordMap (ဟုတ်ကဲ့→yes) erased Burmese chars → text detection fell back to English. Confirmation flow could flip language mid-conversation.
- **Verified**: Full patched code applied via paste-ready block; tested by Saii (laptop browser)
- **Rollback**: n8n editor History → restore previous version
- **Verified by**: Saii

## 2026-06-23 — Task A: ChatBubble Page Navigation (NAV tag)

- **What**: ChatBubble.tsx v3 → v3.1; NAV:{"path":"/route"} tag support added
- **Where (frontend)**: `/opt/erp1/src/components/ai/ChatBubble.tsx`
  - `useRouter` import from next/navigation
  - `parseNavBlock` + `NAV_WHITELIST` (18 routes) + `isPathAllowed` validator
  - `router.push(navPath)` with 600ms delay after assistant reply set
  - NAV tag stripped from message display (alongside CONFIRM)
  - File size: 50,660 → 54,120 bytes (1,543 → 1,633 lines)
- **Where (n8n agent)**: System prompt v4 → v5 — NAV emit rules block added
  - Whitelisted routes listed for agent
  - Rules: NAV last line only, data queries → no NAV, CONFIRM+NAV → CONFIRM wins
- **Risk**: 🟡 Medium (ChatBubble production touch + n8n prompt update)
- **Mitigations**:
  - Client-side whitelist rejects unknown/external paths (no XSS via NAV)
  - CONFIRM precedence preserved (DB write safety)
  - Backward compatible (replies without NAV tag work normally)
- **Verified**: Burmese navigation + data query + sale receipt deep-link + multi-page
- **Rollback (ChatBubble)**: `cp src/components/ai/ChatBubble.tsx.bak.before-nav-task-20260623-0005 src/components/ai/ChatBubble.tsx && ./deploy_vad.sh`
- **Rollback (n8n)**: editor History → previous version restore
- **Verified by**: Saii

## 2026-06-23 — Task A hotfix: subpath corrections

- **Issue**: Agent emitted /reports and /finance (parent paths) → 404 (only /reports/sales, /finance/{ar,ap,bank-accounts} exist as actual pages)
- **Fix**: n8n system prompt — replaced whitelist list with build-verified exact subpaths; added 3 examples for reports/finance subpaths; added CRITICAL warning
- **Root cause**: Discovery phase used `ls src/app/` (directory listing) instead of Next.js build output (authoritative route list)
- **No code change** — whitelist regex already accepted subpaths correctly
- **Verified by**: Saii

## 2026-06-23 — Task B: JWT Auto-Refresh Fix

- **What**: `src/lib/supabase.ts` — explicit `AUTH_OPTIONS` (autoRefreshToken: true, persistSession: true, detectSessionInUrl: true) applied to all 3 createBrowserClient calls
- **Where**: `/opt/erp1/src/lib/supabase.ts` (50 → ~60 lines)
- **Risk**: 🟢 Low (single config object, Supabase official recommended settings)
- **Fixes**: `PGRST303: JWT expired` error appearing on pages after tab idle / laptop sleep / 1h+ admin sessions
- **Root cause**: `createBrowserClient` was called without auth config; defaults varied across @supabase/ssr versions, leading to inconsistent refresh behavior
- **Architecture note**: Admin uses Supabase Auth (1h JWT); staff uses custom localStorage session (8h). Fix targets admin JWT refresh path
- **Verified (immediate)**: Login + navigation works post-deploy
- **Verified (real)**: Tab-idle 1h+ then resume — no JWT error
- **Rollback**: `cp src/lib/supabase.ts.bak.before-jwt-fix-<TS> src/lib/supabase.ts && ./deploy_vad.sh`
- **Verified by**: Saii

## 2026-06-23 — Task C: Defensive JWT → PIN Lock Fallback

- **What**: AppLayout.tsx — added 2 useEffects (auth listener + periodic health check) that trigger PIN lock UI when admin JWT auth fails, instead of letting raw "JWT expired" errors surface on pages
- **Where**: `/opt/erp1/src/components/layout/AppLayout.tsx` (428 → 530 lines, +102 lines)
- **Risk**: 🟡 Medium (global integration in root layout)
- **Architecture**:
  - Layer 1: `auth.onAuthStateChange` listener — fires immediately on SIGNED_OUT / TOKEN_REFRESHED-failed events
  - Layer 2: Periodic JWT health check — every 60s + on tab visibility change (catches wake-from-sleep, background→foreground edge cases)
  - Both layers call existing `lockNow()` → reuses entire PIN unlock flow
  - Staff session (localStorage 8h) honored — admin auth failures don't lock staff users
- **UX outcome**: User never sees raw JWT errors. Any admin auth failure → PIN keypad UI with graceful re-entry (PIN unlock or admin "0000" bypass)
- **Defense in depth**: Combines with Task B (autoRefreshToken) — Task B prevents expiry, Task C catches edge cases when prevention fails
- **Verified**: Manual signout via DevTools → PIN lock UI ✓; JWT expiry simulation → PIN lock ✓; staff session isolation ✓; PIN unlock with 0000 admin bypass ✓
- **Rollback**: `cp src/components/layout/AppLayout.tsx.bak.20260621-0621 src/components/layout/AppLayout.tsx && ./deploy_vad.sh`
- **Verified by**: Saii

## 2026-06-23 — Sprint D1: rpc_create_contact + rpc_create_product

- **What**: ၂ Supabase RPCs အသစ် + /api/ai/execute whitelist + n8n system prompt examples
- **Where (DB)**: Supabase — rpc_create_contact (uuid, text, text, text, text, numeric, integer), rpc_create_product (uuid, text, text, text, numeric, numeric, numeric, numeric); both SECURITY DEFINER, both with RAISE EXCEPTION validation matching rpc_record_sale pattern
- **Where (API)**: `/opt/erp1/src/app/api/ai/execute/route.ts` v2 → v3 (203 → 239 lines, +36)
  - RPC_REGISTRY ထဲ ၂ entries ထပ်ထည့်
  - translateError ထဲ Burmese messages for new error patterns (duplicate, validation)
- **Where (n8n)**: System prompt v5 → v6 — CREATE OPERATIONS block (၂ tools + examples + NAV chain rules)
- **Risk**: 🟡 Medium (database schema change + API + n8n)
- **Architecture**:
  - SECURITY DEFINER pattern matches existing 6 RPCs
  - Soft duplicate detection (same name + same type + not deleted → reject)
  - SKU auto-generation: `AUTO-YYYYMMDD-XXXX` (4-char hex random, retry on collision)
  - contact_type strict enum: 'customer' or 'supplier' only
  - Both RPCs return `{success, *_id, *_name, ...}` JSONB for ChatBubble compatibility
- **NAV chain**: After success — agent emits NAV to landing page (`/customers`, `/suppliers`, `/admin/products`)
- **Verified**: Burmese voice add customer/supplier/product, duplicate detection, SKU auto-gen, success NAV
- **Rollback (DB)**: `DROP FUNCTION rpc_create_contact, rpc_create_product;`
- **Rollback (API)**: `cp src/app/api/ai/execute/route.ts.bak.20260621-0330 src/app/api/ai/execute/route.ts && ./deploy_vad.sh`
- **Rollback (n8n)**: editor History → previous version restore
- **Verified by**: Saii

## 2026-06-25 — Sprint D1 hotfix: contact_type case mismatch

- **Issue**: AI-added contacts (rpc_create_contact) stored contact_type as lowercase ('customer'/'supplier'), but /customers and /suppliers UI pages filter by exact-match capitalized 'Customer'/'Supplier'. Result: voice-added contacts invisible in UI even after refresh; edit also impossible.
- **Root cause**: rpc_create_contact normalized to lowercase via INITCAP() missing. UI uses `.eq('contact_type','Customer')` (case-sensitive), not `.ilike()`.
- **Fix 1 (data migration)**: `UPDATE contacts SET contact_type=INITCAP(contact_type) WHERE contact_type IN ('customer','supplier')` for company 38e7b287-...
- **Fix 2 (RPC update)**: rpc_create_contact now stores INITCAP value ('Customer'/'Supplier'); validation still accepts lowercase from agent
- **Risk**: 🟢 Low (SQL only, no code change, no rebuild needed)
- **Verified**: AI-added contacts visible in /customers and /suppliers after migration; new voice add appears immediately
- **Rollback (RPC)**: Restore previous rpc_create_contact (without INITCAP)
- **Rollback (data)**: Not needed — UI works with both, but lowercase ones were invisible
- **Verified by**: Saii

## 2026-06-25 — Tier 1 fixes: Receipt nav + Post-sale chain

- **Issue #1 (HIGH)**: After sale, "ဘောက်ချာ ပြ" hallucinated trans_no as "TR-000064" instead of using actual INV-... from history. Receipt page errored "Receipt data မရှိပါ".
- **Issue #2 (HIGH)**: Multi-step voice ("ရောင်း + ဘောက်ချာ တစ်ခါတည်း") executed sale correctly but never followed up with NAV to receipt page. User had to ask again.
- **Where**: n8n system prompt v6 → v6.1
  - RECEIPT NAVIGATION section: rewritten with ABSOLUTE RULE (INV- prefix only), step-by-step extraction algorithm, WRONG vs CORRECT examples
  - POST-SALE NAV CHAIN section (new): explicit Turn 1/2/3 flow when user requests sale + receipt in one message
- **Risk**: 🟢 Low (n8n system prompt only — no code, no rebuild)
- **Verified**: 4 test scenarios — receipt after sale, multi-step chain, no-sale defensive, explicit INV
- **Rollback**: n8n editor → History → previous version restore
- **Verified by**: Saii
