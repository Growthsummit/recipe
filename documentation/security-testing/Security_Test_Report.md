# RecipeHub Security Test Report

Execution date: 2026-11-07  
Target: `http://localhost:5000/api` and configured Turso database  
Overall result: **Blocked. 0 passed, 0 failed, 14 not run.**

The security test runner is prepared at `backend/test/securityRequirements.test.js`. Before running it, the schema must be migrated and both the API and Turso must be reachable. The documented idempotent initializer was attempted. An authorized network retry timed out connecting to the configured Turso host. No test accounts or data were created, and no API test is claimed as passed or failed.

| Test ID | Test case | Expected result | Actual result | Status |
|---|---|---|---|---|
| SEC-01 | Guest calls protected profile endpoint | HTTP 401 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-02 | User reads own profile | HTTP 200 with own account ID | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-03 | User reads another user's private profile | HTTP 403 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-04 | User creates a recipe | HTTP 201 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-05 | User edits another user's recipe | HTTP 403 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-06 | Administrator manages a recipe | HTTP 200 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-07 | Administrator opens restricted security settings | HTTP 403 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-08 | Security Administrator changes a role permission and backend enforces it | Permission update succeeds; denied action returns HTTP 403 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-09 | Ordinary user promotes themself | HTTP 403 | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-10 | Invalid and expired authentication tokens | HTTP 401 for both | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-11 | Excessive failed sign-ins | Subsequent sign-in is blocked with `ACCOUNT_LOCKED` | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-12 | User exports personal data | HTTP 200 with user data | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-13 | User corrects profile information | HTTP 200 with updated profile | Not run. Database migration/API unavailable. | BLOCKED |
| SEC-14 | User deletes account | HTTP 200; subsequent authenticated request returns HTTP 401 | Not run. Database migration/API unavailable. | BLOCKED |

Frontend and portal production builds succeeded. Backend JavaScript syntax checks succeeded. These checks do not substitute for the 14 API tests.

To finish verification, restore Turso connectivity, run `npm run init-db` and `npm run seed` from `backend`, start the backend, and run `node test/securityRequirements.test.js`. The runner writes actual results to this report and removes its temporary test accounts while restoring security settings.

