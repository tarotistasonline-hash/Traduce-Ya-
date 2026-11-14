# Security Specification: VisitorStats Firestore Rules

## 1. Data Invariants
1. Only the singleton document `/stats/global` may be read (`get`) or mutated; collection `list` queries are strictly forbidden (`allow list: if false`).
2. `statsId` must match `^[a-zA-Z0-9_-]+$`, be `<= 128` chars, and equal `'global'`.
3. `totalVisits`, `todayVisits`, and `uniqueVisitors` must always be integers `>= 1` and monotonic: each `update` can increment `totalVisits` by **exactly 1**, `uniqueVisitors` by `0` or `1`, and `todayVisits` by `+1` (same day) or reset to `1` (new day).
4. `today` must always be a 10-character `YYYY-MM-DD` date string.
5. `updatedAt` must always equal `request.time` (server-enforced timestamp).
6. No PII (`email`, `phone`, `ip`, `address`, `name`) is ever stored in `/stats/global`.
7. No shadow/ghost keys may be injected on `create` or `update` (`hasAll` + `hasOnly` + `affectedKeys().hasOnly`).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Arbitrary Document ID Poisoning**: Write to `/stats/other_doc` or `/stats/` + 1500-char ID -> Denied (`statsId == 'global'` and `isValidId`).
2. **Collection Scraping (`list`)**: `getDocs(collection(db, 'stats'))` -> Denied (`allow list: if false`).
3. **Ghost / Shadow Field Injection on Create**: Create `/stats/global` with `{ ..., isAdmin: true }` -> Denied (`keys().hasOnly`).
4. **Ghost / Shadow Field Injection on Update**: Update `/stats/global` adding `{ extraField: 'hack' }` -> Denied (`affectedKeys().hasOnly` & `keys().hasOnly`).
5. **Counter Inflation Attack**: Update `totalVisits` from `40` to `999999` -> Denied (`incoming().totalVisits == existing().totalVisits + 1`).
6. **Counter Reset / Decrement Attack**: Update `totalVisits` from `40` to `0` -> Denied (`incoming().totalVisits == existing().totalVisits + 1`).
7. **Unique Visitor Spoofing**: Update `uniqueVisitors` by `+50` in a single request -> Denied (`incoming().uniqueVisitors <= existing().uniqueVisitors + 1`).
8. **Type Poisoning**: Update `totalVisits` to `"100"` (string) or `true` (boolean) -> Denied (`is int`).
9. **String Size Exhaustion (DoW)**: Set `today` to a 10KB string -> Denied (`size() == 10` and regex check).
10. **Client-Forged Timestamp**: Set `updatedAt` to a past/future client timestamp instead of `request.time` -> Denied (`updatedAt == request.time`).
11. **Delete Attack**: Delete `/stats/global` -> Denied (`allow delete: if false`).
12. **Unlisted Collection Access**: Read or write `/users/123` or `/admins/123` -> Denied (top-level `match /{document=**} { allow read, write: if false; }`).
