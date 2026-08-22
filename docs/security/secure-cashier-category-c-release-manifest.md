# Secure Cashier Category C — Literal Local Release-Freeze Manifest

This is evidence and a future staging recipe only. Nothing is staged, committed, deployed, activated, provisioned, or sent to Firebase production.

## Included runtime and configuration paths

| Literal path | Classification | Authorized release content |
|---|---|---|
| `apphosting.yaml` | CONFIGURATION | Dormant runtime flags, active pepper version identifier, and Secret Manager references only. |
| `firestore.rules` | CONFIGURATION | Accepted restrictive Cashier and Owner lifecycle rules. |
| `src/firebase/admin.ts` | SECURITY_ONLY | Authoritative Admin SDK initialization and application Firestore database selection. |
| `src/app/api/auth/staff-logout/route.ts` | SECURITY_ONLY | Authenticated Cashier logout boundary. |
| `src/app/api/auth/staff-pin-login/route.ts` | SECURITY_ONLY | Distributed request admission and PIN authentication boundary. |
| `src/app/api/cashier/benta-bootstrap/route.ts` | SECURITY_ONLY | Cashier bootstrap route. |
| `src/app/api/cashier/benta-checkout/route.ts` | SECURITY_ONLY | Cashier checkout route. |
| `src/app/api/cashier/benta-receipt/route.ts` | SECURITY_ONLY | Current-shift receipt route. |
| `src/app/api/cashier/benta-shift-open/route.ts` | SECURITY_ONLY | Secure shift initialization route. |
| `src/app/api/cashier/benta-shift-reconciliation/route.ts` | SECURITY_ONLY | Current-shift reconciliation route. |
| `src/app/api/owner/cashiers/route.ts` | SECURITY_ONLY | Owner-authorized Cashier lifecycle endpoint. |
| `src/app/api/owner/cashiers/disable/route.ts` | SECURITY_ONLY | Owner-authorized disable endpoint. |
| `src/app/api/owner/cashiers/remove/route.ts` | SECURITY_ONLY | Owner-authorized removal endpoint. |
| `src/app/api/owner/cashiers/reset-pin/route.ts` | SECURITY_ONLY | Owner-authorized PIN reset endpoint. |
| `src/lib/auth/owner-tenant-authorization.ts` | SECURITY_ONLY | Authoritative Owner/tenant authorization. |
| `src/lib/server/benta-cashier-bootstrap.ts` | SECURITY_ONLY | Authoritative Cashier bootstrap and open-shift reconciliation. |
| `src/lib/server/benta-cashier-checkout.ts` | SECURITY_ONLY | Transactional checkout, idempotency, stock, and financial invariants. |
| `src/lib/server/benta-cashier-shift-open.ts` | SECURITY_ONLY | Transactional shift initialization. |
| `src/lib/server/benta-cashier-shift-receipt.ts` | SECURITY_ONLY | Current-shift receipt and reconciliation authorization. |
| `src/lib/server/cashier-server-authorization.ts` | SECURITY_ONLY | Shared authoritative Cashier authorization. |
| `src/lib/server/owner-cashier-handlers.ts` | SECURITY_ONLY | Owner Cashier lifecycle handlers. |
| `src/lib/server/pin-security.ts` | SECURITY_ONLY | Slow-KDF PIN security and migration. |
| `src/lib/server/rate-limiter.ts` | SECURITY_ONLY | Firestore-backed distributed request and failure throttling. |
| `src/lib/server/secure-cashier-config.ts` | SECURITY_ONLY | Fail-closed server feature configuration. |
| `src/lib/server/secure-cashier-production-preflight.ts` | SECURITY_ONLY | Benta-only production-readiness analysis and scoped collection. |
| `src/lib/server/staff-lifecycle.ts` | SECURITY_ONLY | Cashier lifecycle persistence contract. |
| `src/lib/server/staff-logout-handler.ts` | SECURITY_ONLY | Session-version revocation and logout. |
| `src/lib/server/staff-pin-auth-handler.ts` | SECURITY_ONLY | Enumeration-resistant authentication and custom-token flow. |
| `src/lib/client/owner-cashier-client.ts` | SECURITY_ONLY | Authenticated Owner lifecycle client. |
| `src/lib/client/secure-benta-cashier-client.ts` | SECURITY_ONLY | Authenticated Cashier API client. |
| `src/lib/client/secure-pwa-compatibility.ts` | SECURITY_ONLY | Secure session/PWA compatibility decisions. |
| `src/store/use-secure-cashier-store.ts` | SECURITY_ONLY | Sanitized in-memory Cashier state. |
| `src/store/use-staff-session.ts` | SECURITY_ONLY | Legacy local session retirement and compatibility cleanup. |
| `src/components/auth/staff-login-modal.tsx` | SECURITY_ONLY | Existing Business Code, Username, and four-digit PIN UX wired to the secure endpoint. |
| `src/components/common/secure-pwa-compatibility-guard.tsx` | SECURITY_ONLY | Secure PWA session compatibility guard. |
| `src/components/common/thermal-receipt-preview.tsx` | SECURITY_ONLY | Full authoritative transaction reference rendering; no cost disclosure. |
| `src/components/dashboard/cashier-profile-view.tsx` | SECURITY_ONLY | Isolated Cashier profile/logout surface. |
| `src/components/dashboard/profile-tab.tsx` | SECURITY_ONLY | Secure Cashier profile and logout lifecycle. |
| `src/components/shell/bottom-nav.tsx` | SECURITY_ONLY | Cashier role navigation restriction. |
| `src/hooks/use-inventory.tsx` | SECURITY_ONLY | Blocks direct Cashier Firestore inventory access. |
| `src/hooks/use-shift.tsx` | SECURITY_ONLY | Blocks legacy Cashier shift persistence. |
| `src/hooks/use-sync-status.ts` | SECURITY_ONLY | Avoids direct Cashier synchronization access. |
| `src/hooks/use-user-tenants.tsx` | MIXED_SECURITY_BENTA | Include only: secure Cashier-state import; suppression of Owner/staff tenant queries for Cashiers; empty Cashier tenant-list result. Exclude Owner loading-state optimization, ordering changes, and comment-only churn. |
| `src/app/dashboard/page.tsx` | SECURITY_ONLY | Restricts Cashier dashboard tabs to Benta and profile. |
| `src/app/layout.tsx` | SECURITY_ONLY | Mounts the secure PWA compatibility guard. |
| `src/app/sw.ts` | SECURITY_ONLY | Short-lived network-first authenticated dashboard shell. |
| `src/components/auth/auth-guard.tsx` | MIXED_SECURITY_BENTA | Include only: legacy local Cashier-session purge; signed role resolution; secure Cashier bootstrap; authoritative Owner tenant selection/validation; Cashier route locks; fail-closed loading/error behavior. Exclude payment-instruction deletion and formatting/comment-only churn. |
| `src/components/dashboard/tenant-dashboard.tsx` | MIXED_SECURITY_BENTA | Include only: secure Cashier store/profile imports; replacement of legacy staff-session checks; isolated Cashier Benta/profile rendering; Cashier Owner-report lock. Exclude blank-line-only hunks. |
| `src/components/dashboard/retail/benta-dashboard.tsx` | MIXED_SECURITY_BENTA | Include only: secure Cashier API checkout, idempotency recovery, sanitized receipt, Cash/GCash/Maya restrictions, and authoritative shift state. Exclude catalogue layout, product-management, and Benta consolidation hunks. |
| `src/components/dashboard/shift-gate.tsx` | MIXED_SECURITY_BENTA | Include only the secure Cashier shift-open/recovery branch and authoritative API state. Exclude retained Owner presentation and Benta-only layout changes. |
| `src/components/dashboard/staff-shift-card.tsx` | MIXED_SECURITY_BENTA | Include only secure Cashier reconciliation/logout and API-derived current-shift state. Exclude retained Owner presentation and Benta-only layout changes. |

No included runtime path is classified `MIXED_SECURITY_IOS`.

## Included security tests and tooling paths

| Literal path | Classification | Authorized release content |
|---|---|---|
| `package.json` | SECURITY_TOOLING | Adds the `@firebase/rules-unit-testing` and `firebase-tools` development dependencies required by the accepted Rules tests and loopback Emulator runner. Release atomically with `pnpm-lock.yaml`. |
| `pnpm-lock.yaml` | SECURITY_TOOLING | Reproducible resolution for the two security-tooling dependencies and their transitive graph. Release atomically with `package.json`. |
| `scripts/run-secure-cashier-emulator-regressions.ps1` | SECURITY_TOOLING | Loopback-only demo-project Emulator runner. |
| `scripts/secure-cashier-production-preflight.ts` | SECURITY_TOOLING | Explicitly authorized production-read-only preflight entry point; default invocation refuses before Admin SDK loading. |
| `docs/security/secure-cashier-category-c-release-manifest.md` | SECURITY_TOOLING | This literal release boundary and future staging recipe. |
| `cypress/e2e/secure-benta-cashier.cy.ts` | SECURITY_TEST | Secure Cashier client journey coverage. |
| `cypress/e2e/staff-access-security-phase-1.cy.ts` | SECURITY_TEST | Phase 1 browser regression coverage. |
| `test/benta-cashier-bootstrap-route.test.ts` | SECURITY_TEST | Bootstrap route coverage. |
| `test/benta-cashier-bootstrap.emulator.test.ts` | SECURITY_TEST | Bootstrap Emulator coverage. |
| `test/benta-cashier-bootstrap.test.ts` | SECURITY_TEST | Bootstrap unit coverage. |
| `test/benta-cashier-checkout-route.test.ts` | SECURITY_TEST | Checkout route coverage. |
| `test/benta-cashier-checkout.emulator.test.ts` | SECURITY_TEST | Checkout transactional Emulator coverage. |
| `test/benta-cashier-checkout.test.ts` | SECURITY_TEST | Checkout unit coverage. |
| `test/benta-cashier-shift-open-route.test.ts` | SECURITY_TEST | Shift-open route coverage. |
| `test/benta-cashier-shift-open.emulator.test.ts` | SECURITY_TEST | Shift-open Emulator coverage. |
| `test/benta-cashier-shift-open.test.ts` | SECURITY_TEST | Shift-open unit coverage. |
| `test/benta-cashier-shift-receipt-route.test.ts` | SECURITY_TEST | Receipt route coverage. |
| `test/benta-cashier-shift-receipt.emulator.test.ts` | SECURITY_TEST | Receipt and reconciliation Emulator coverage. |
| `test/benta-cashier-shift-receipt.test.ts` | SECURITY_TEST | Receipt and reconciliation unit coverage. |
| `test/firestore-rules.emulator.test.ts` | SECURITY_TEST | Restrictive Firestore Rules regression coverage. |
| `test/owner-cashier-lifecycle.emulator.test.ts` | SECURITY_TEST | Owner lifecycle Emulator coverage. |
| `test/owner-cashier-lifecycle.test.ts` | SECURITY_TEST | Owner lifecycle unit coverage. |
| `test/owner-cashier-routes.test.ts` | SECURITY_TEST | Owner lifecycle route coverage. |
| `test/owner-tenant-authorization.emulator.test.ts` | SECURITY_TEST | Owner authorization Emulator coverage. |
| `test/owner-tenant-authorization.test.ts` | SECURITY_TEST | Owner authorization unit coverage. |
| `test/secure-benta-cashier-client.test.ts` | SECURITY_TEST | Secure client coverage. |
| `test/secure-cashier-activation.test.ts` | SECURITY_TEST | Dormant activation contract coverage. |
| `test/secure-cashier-production-preflight.test.ts` | SECURITY_TEST | Benta-only, tenant-scoped, refusal, and smoke-readiness behavioral coverage. |
| `test/secure-pwa-compatibility.test.ts` | SECURITY_TEST | PWA compatibility coverage. |
| `test/staff-auth-rate-limiter.test.ts` | SECURITY_TEST | Distributed failure throttling coverage. |
| `test/staff-logout-handler.test.ts` | SECURITY_TEST | Logout handler coverage. |
| `test/staff-logout-route.test.ts` | SECURITY_TEST | Logout route coverage. |
| `test/staff-logout.emulator.test.ts` | SECURITY_TEST | Logout Emulator coverage. |
| `test/staff-pin-auth-integration.test.ts` | SECURITY_TEST | PIN authentication integration coverage. |
| `test/staff-request-admission.test.ts` | SECURITY_TEST | Distributed request-admission coverage. |
| `test/staff-security-behavioral.test.ts` | SECURITY_TEST | Phase 1 authentication behavior coverage. |

## Literal exclusions from the current dirty worktree

The following changed paths are intentionally outside this security release boundary:

| Literal changed path | Exclusion classification | Reason |
|---|---|---|
| `next.config.ts` | PROTECTED_CONFIGURATION | Protected pre-existing variance; exact SHA-256 must remain unchanged. |
| `cypress/e2e/catalogue-reconciliation.cy.ts` | BENTA_CONSOLIDATION_ONLY | Catalogue reconciliation coverage outside the security boundary. |
| `cypress/e2e/ios-install-prompt.cy.ts` | IOS_ONLY | iOS prompt coverage. |
| `cypress/e2e/production-health-pass2.cy.ts` | UNRELATED_PACKAGE_B | Existing production-health work. |
| `cypress/e2e/sprint-2-package-b.cy.ts` | UNRELATED_PACKAGE_B | Existing Package B coverage. |
| `src/app/[moduleId]/onboarding/page.tsx` | ONBOARDING_ONLY | Existing onboarding work. |
| `src/app/[moduleId]/page.tsx` | BENTA_CONSOLIDATION_ONLY | Existing module/catalogue consolidation work. |
| `src/app/about/page.tsx` | MARKETING_CRO_ONLY | Existing marketing page work. |
| `src/app/faq/page.tsx` | MARKETING_CRO_ONLY | Existing marketing page work. |
| `src/app/modules/page.tsx` | MARKETING_CRO_ONLY | Existing module-marketing work. |
| `src/app/page.tsx` | MARKETING_CRO_ONLY | Existing landing-page work. |
| `src/components/admin/admin-tenant-details.tsx` | BENTA_CONSOLIDATION_ONLY | Existing administrative catalogue work. |
| `src/components/common/ios-install-prompt.tsx` | IOS_ONLY | Protected iOS install-prompt implementation. |
| `src/components/dashboard/app-marketplace.tsx` | BENTA_CONSOLIDATION_ONLY | Existing marketplace/catalogue work. |
| `src/components/marketing/app-suite-carousel.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/business-finder.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/features.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/how-it-works.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/pricing-cta.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/problem-first.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/marketing/register-sheet.tsx` | MARKETING_CRO_ONLY | Existing registration/CRO work. |
| `src/components/marketing/social-proof-bar.tsx` | MARKETING_CRO_ONLY | Existing marketing component work. |
| `src/components/onboarding/onboarding-wizard.tsx` | ONBOARDING_ONLY | Existing onboarding work. |
| `src/components/onboarding/steps/business-info.tsx` | ONBOARDING_ONLY | Existing onboarding work. |
| `src/firebase/firestore/onboarding-actions.ts` | ONBOARDING_ONLY | Existing onboarding persistence work. |
| `src/firebase/index.ts` | UNRELATED_FORMATTING | Whitespace-only working-tree variance. |
| `src/lib/app-data.ts` | BENTA_CONSOLIDATION_ONLY | Existing module/catalogue definitions. |
| `src/lib/schemas/onboarding.ts` | ONBOARDING_ONLY | Existing onboarding schema work. |
| `src/store/use-tenant-store.ts` | BENTA_CONSOLIDATION_ONLY | Existing Benta business-profile state. |
| `test/benta-snap-consolidation.test.ts` | BENTA_CONSOLIDATION_ONLY | Consolidation regression evidence outside the security release. |

## Future security-only staging strategy

1. Use a separate clean release worktree based on the independently approved release base; do not clean, reset, restore, or discard this source worktree.
2. Copy only the literal `SECURITY_ONLY`, `CONFIGURATION`, `SECURITY_TEST`, and `SECURITY_TOOLING` content listed above.
3. For each `MIXED_SECURITY_BENTA` path, construct a security-only patch containing exactly the authorized hunk descriptions in this manifest. Do not stage the source file wholesale.
4. Apply `package.json` and `pnpm-lock.yaml` as one atomic security-tooling boundary. The package diff must contain exactly the `@firebase/rules-unit-testing` and `firebase-tools` development dependencies, and the lockfile must resolve both. Never stage either file without the other.
5. Compare the resulting staged-name list and staged diff against every literal included and excluded path above, then rerun the complete security gate. Independent Security QA remains required before any commit or cutover decision.

## Prepared App Hosting source contract

Non-secret runtime declarations:

- `STAFF_PIN_PEPPER_ACTIVE_VERSION=v1`
- `BENTA_CASHIER_CHECKOUT_ENABLED=false`
- `BENTA_CASHIER_IP_THROTTLE_ENABLED=false`

Secret references, without values:

- `STAFF_PIN_PEPPER_V1` references Secret Manager name `STAFF_PIN_PEPPER_V1`
- `RATE_LIMIT_HMAC_SECRET` references Secret Manager name `RATE_LIMIT_HMAC_SECRET`

The source declarations do not create secrets, grant access, or change a running backend. A later explicitly authorized provisioning and rollout step must create approved secret values, grant the App Hosting backend access, reconcile any console overrides, validate the trusted forwarding topology, and only then decide whether either dormant feature flag may change.
