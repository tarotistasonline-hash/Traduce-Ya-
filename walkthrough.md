# Security Summary

**Reviewed Files**: 17
**Issues Resolved**: 10

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Hardcoded Unlock & Admin Codes | `src/utils/licenseManager.ts` | 14 | Customer activation codes (`PRIVATE_CUSTOMER_CODES`) and admin/creator codes (`CREATOR_CODES`) were embedded in browser JavaScript. | High | Fixed | Removed all hardcoded codes from the frontend; moved verification to `POST /api/activate-code` using environment variables (`CUSTOMER_ACTIVATION_CODES`), scrypt-hashed admin passwords, and HMAC-signed `TY1-...` customer codes. |
| URL Parameter License & Admin Bypass | `src/utils/licenseManager.ts` | 72, 276 | Visiting `?pro=true`, `?unlocked=true`, `?pago=exitoso`, `?creator=true`, or `?admin=true` automatically unlocked Pro or elevated the visitor to Creator/Admin. | High | Fixed | Removed all client-side query flag unlocks. Replaced with `verifyUrlReturnUnlock()`, which strips legacy flags and validates only `?code=` or Mercado Pago `?payment_id=`/`?collection_id=` parameters against the server. |
| Unauthenticated 1-Click Admin Promotion | `src/components/SettingsModal.tsx`, `src/components/PaywallModal.tsx` | 331, 504 | Any visitor could click a button to activate Creator/Admin mode, gain unlimited usage, and view private codes. | High | Fixed | Replaced 1-click self-promotion with verified admin login (Google Sign-In restricted to `tarotistasonline@gmail.com` or first-run scrypt password setup/login) backed by signed HMAC session tokens (`Bearer`). |
| Unauthenticated Private Feedback Inbox | `server.ts`, `api/index.ts`, `src/components/FeedbackViewerModal.tsx` | 326, 717, 43 | `GET /api/feedback` returned all saved messages, user emails/WhatsApp contacts, and Mercado Pago operation numbers without checking authentication, and Settings exposed the inbox button to everyone. | High | Fixed | Added `requireAdmin` middleware verifying the signed admin `Bearer` token on `GET /api/feedback`, hid the inbox button unless authenticated, and sent the `Authorization` header from `FeedbackViewerModal`. |
| Browser Storage Admin Trust | `src/utils/licenseManager.ts` | 7 | Admin/creator privilege was stored in `localStorage` (`traductor_ya_creator_mode_v1`), allowing any local edit or script to grant admin UI access. | Medium | Fixed | Admin session tokens are now kept strictly in JS memory (`inMemoryAdminToken`) and verified server-side on every protected request; analytics exclusion (`traductor_ya_analytics_optout_v1`) is decoupled and never grants Pro or Admin access. |
| Missing Rate Limiting & Oversized Payloads | `server.ts`, `api/index.ts`, `api/_security.ts` | 340, 328, 285 | Public AI translation, audio, TTS, payment verification, code activation, feedback, and visit endpoints lacked sliding-window IP rate limits, and JSON limits were set to `25mb`. | Medium | Fixed | Added per-IP sliding-window rate limits across auth, activation, Mercado Pago verification, AI endpoints (exempting verified Pro/Admin sessions and custom visitor keys), feedback, and visits; lowered JSON body limit to `8mb` and capped audio/text sizes. |
| Visitor Counter Manipulation | `server.ts`, `api/index.ts` | 522, 144 | `POST /api/visits` previously allowed clients to submit `clientReportedTotal` or spoofed fallback payloads to alter visitor counts. | Medium | Fixed | Removed `clientReportedTotal` processing and stripped untrusted fields from fallback proxy requests so visitor counts only increment monotonically (`+1`) on the server. |
| API Proxy Path & Header Hardening | `api/index.ts`, `server.ts`, `vercel.json` | 34, 37, 1 | Rewrite query path `?__path`, CORS/origin handling, default `X-Powered-By` headers, and missing security headers exposed unnecessary attack surface. | Medium | Fixed | Added strict `sanitizeFallbackApiPath` validation, blocked fallback proxying for `/api/admin*` and `/api/activate-code`, added `sameOriginGuard` on mutations and sensitive reads, disabled `X-Powered-By`, and added `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`, and HSTS headers. |
| Unvalidated External URLs & API Keys | `src/components/PaywallModal.tsx`, `src/App.tsx`, `src/components/AudioDiagnosticModal.tsx`, `src/components/PWAInstallButton.tsx` | 293, 951, 843, 107 | Editable payment URLs/emails, `window.location.href` anchors, and visitor Gemini API keys lacked scheme/format validation. | Medium | Fixed | Added `src/utils/urlSecurity.ts` (`sanitizeExternalUrl`, `sanitizeEmail`, `isValidGeminiApiKeyFormat`) and server-side `validateCustomGeminiKey` to reject unsafe URL schemes and malformed API keys. |
| Sensitive Auth Metadata in Error Logs | `src/firebase.ts` | 41 | Firestore error handling serialized `auth.currentUser` UID, email, emailVerified, and provider metadata into console errors and thrown exceptions. | Low | Fixed | Removed `authInfo` serialization from `FirestoreErrorInfo` and `handleFirestoreError`. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| Admin Authentication | `api/_security.ts`, `server.ts`, `api/index.ts` | Verifies Firebase Google ID tokens against Google Identity Toolkit (`tarotistasonline@gmail.com` with verified email) or scrypt-hashed/env passcodes using constant-time comparison, issuing HMAC-SHA256 tokens. |
| Firestore Access Control | `firestore.rules` | Enforces default-deny catch-all (`allow read, write: if false`), restricts list/delete on `stats` to verified `tarotistasonline@gmail.com`, and enforces schema and strict `+1` monotonic increments on `/stats/visitors`. |
| Server-Side Secrets | `server.ts`, `api/index.ts`, `.env.example` | Server Gemini key, Mercado Pago token, `ADMIN_PASSCODE`, and `CUSTOMER_ACTIVATION_CODES` are read exclusively from `process.env` and never returned to the browser. |
| Safe Error Handling | `server.ts`, `api/index.ts` | Upstream SDK and server exceptions return sanitized Spanish status messages (`429`, `503`, `500`) without leaking raw stack traces or internal responses. |

### Dependency Audit Note
Running `bun audit` reports 4 transitive dependency advisories inside third-party packages (`@grpc/grpc-js@1.9.16` nested under `firebase` Node compat layers—not bundled in the browser app or used by Express routes—and `glob@11.1.0` / `minimatch` nested under build/lint dev dependencies `vite-plugin-pwa` and `eslint`). None of these code paths process untrusted user input at runtime, and `vite-plugin-pwa@2.x` is retained intentionally for Vite 8 compatibility.

---

## PoC Verification

### 1. Unauthenticated Admin Inbox & Code Generator Access
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Authentication Check on Admin Endpoints |
| Impact | High |
| Affected File | `server.ts:583`, `api/index.ts:717`, `api/index.ts:278` |
| Test Scenario | `GET /api/feedback` and `POST /api/admin/codes` without an `Authorization: Bearer` admin token |

#### How It Was Fixed
Added `requireAdmin` middleware calling `isVerifiedAdminRequest(req)`, which verifies the HMAC-SHA256 signature, role (`admin`), and expiration timestamp of the `Bearer` token before executing the route handler.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | Unauthenticated `GET /api/feedback` arrives at `server.ts:583` | Enters `requireAdmin` |
| 2 | `requireAdmin` calls `isVerifiedAdminRequest(req)` (`api/_security.ts:144`) | `extractBearerToken(req)` returns `null` |
| 3 | `verifySessionToken(null, 'admin')` returns `null` | Guard rejects request |
| 4 | Middleware returns HTTP `401` (`{"error":"Se requiere sesión verificada de administradora."}`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Private feedback messages, buyer contacts, and admin code generation are inaccessible without a server-signed admin session token.

---

### 2. Legacy Activation & URL Query Privilege Bypass
#### Summary
| Field | Value |
|---|---|
| Issue Type | Hardcoded Client Codes & Query Parameter Escalation |
| Impact | High |
| Affected File | `src/utils/licenseManager.ts:323`, `api/index.ts:287`, `server.ts:296` |
| Test Scenario | `POST /api/activate-code` with legacy codes (`TYPRO-8472`, `CREADOR`) and browser URL query `?pro=true&creator=true` |

#### How It Was Fixed
Removed all static code arrays and `?pro=true`/`?creator=true` client-side checks. Activation now executes strictly server-side against `CUSTOMER_ACTIVATION_CODES`, scrypt admin hashes, and HMAC-signed `TY1-...` codes.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/activate-code` receives `{"code":"TYPRO-8472"}` or `{"code":"CREADOR"}` | Enters IP rate limiter (`checkRateLimit`) |
| 2 | Server compares against `ADMIN_PASSCODE`, `CUSTOMER_ACTIVATION_CODES`, `customer_codes.json`, and `verifySignedCustomerCode` | No match found (`false`) |
| 3 | Route returns HTTP `401` (`{"ok":false,"error":"Código inválido o vencido..."}`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Legacy hardcoded bypass strings and URL flags no longer unlock Pro or Admin access.

---

### 3. Cross-Origin State-Changing Requests
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Cross-Origin Request Guard |
| Impact | Medium |
| Affected File | `server.ts:42`, `api/index.ts:57`, `api/_security.ts:246` |
| Test Scenario | `POST /api/translate` sent with `Origin: https://evil.example` |

#### How It Was Fixed
Added `sameOriginGuard` middleware on `/api` for all HTTP mutations and sensitive admin/feedback reads, comparing the request `Origin` host against the active `Host` / `X-Forwarded-Host` header.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/translate` with `Origin: https://evil.example` enters `/api` guard (`server.ts:42`) | Routed to `sameOriginGuard` |
| 2 | `originUrl.host` (`evil.example`) mismatches `expectedHost` (`localhost:3000`) (`api/_security.ts:266`) | Origin check fails |
| 3 | Middleware immediately returns HTTP `403` (`{"error":"Solicitud bloqueada por origen cruzado no autorizado."}`) | **Handled Safely** |

#### Conclusion
**Fix Verified** - Third-party origins are blocked from invoking state-changing API routes or sensitive reads.

---

### 4. Malformed Custom API Key, Oversized Text & Invalid Audio Payloads
#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Input Validation & Payload Caps |
| Impact | Medium |
| Affected File | `api/_security.ts:319`, `api/_security.ts:349`, `api/_security.ts:370` |
| Test Scenario | `POST /api/translate` with `x-gemini-api-key: not-a-valid-key`, `text` of 3500 characters, and `POST /api/translate-audio` with `<script>alert(1)</script>` |

#### How It Was Fixed
Added strict format validation (`/^AIza[0-9A-Za-z_-]{20,100}$/`) for custom Gemini keys, 3000-character limits on translation text, tone allowlisting, and base64 + MIME allowlist + 7MB size checks on audio payloads.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/translate` with `x-gemini-api-key: not-a-valid-key` calls `resolveAiClient(req)` | Fails `validateCustomGeminiKey` -> HTTP `400` |
| 2 | `POST /api/translate` with 3500-char text reaches `validateTranslateBody(req.body)` | Exceeds 3000-char limit -> HTTP `400` |
| 3 | `POST /api/translate-audio` with `<script>alert(1)</script>` reaches `validateAudioPayload` | Fails base64 regex -> HTTP `400` (`Formato de audio inválido.`) |

#### Conclusion
**Fix Verified** - Malformed API keys, oversized inputs, and invalid audio payloads are rejected cleanly with HTTP `400` before reaching the AI SDK.

---

### 5. Visitor Counter Spoofing & Missing Response Security Headers
#### Summary
| Field | Value |
|---|---|
| Issue Type | Untrusted Client Counter Input & Missing Security Headers |
| Impact | Medium |
| Affected File | `server.ts:522`, `api/_security.ts:233`, `vercel.json:1` |
| Test Scenario | `POST /api/visits` with `{"isCreator": true, "clientReportedTotal": 9999999}` and `GET /api/status` header check |

#### How It Was Fixed
Removed `clientReportedTotal` from server visit handling and fallback proxying, disabled `X-Powered-By`, and applied standard security response headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control`).

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `POST /api/visits` receives `clientReportedTotal: 9999999` (`server.ts:529`) | Field is ignored; response returns actual server total (`39`) |
| 2 | `GET /api/status` passes through `securityHeadersMiddleware` (`api/_security.ts:233`) | Strips `X-Powered-By` and sets `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and `X-DNS-Prefetch-Control: off` |

#### Conclusion
**Fix Verified** - Client-supplied totals cannot inflate visitor statistics and responses include hardened security headers.
