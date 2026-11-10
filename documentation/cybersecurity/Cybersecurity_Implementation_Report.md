# RecipeHub Cybersecurity Implementation Report

## Scope and architecture

RecipeHub uses a React/Vite client, an Express API and a Turso (libSQL) database. The main app remains at `http://localhost:5173`. The Security Administrator interface is a distinct React/Vite application in `security-portal`, configured for `http://localhost:5174`. Both use the existing API and account store. No AI controls were added, and nothing was deployed. The pre-existing browser demonstration ledger remains outside server authorization. The later Sepolia integration and its limits are documented in `documentation/blockchain/`.

The API uses shared authentication, role and permission middleware, request validation, parameterized SQL, rate limiting, Helmet and a CORS allowlist. A bearer token is verified, then the account and role are reloaded from the database. Effective permissions are checked on the server for protected endpoints. The UI does not grant access.

## Data classification

The classification register in `documentation/spreadsheets/RecipeHub_Data_Classification.xlsx` records 29 data assets and maps each to its source, access, reason and protection. It covers public recipes and reviews, private account and interaction data, confidential identifiers and security records, restricted credentials and permission controls, plus Sepolia proof records, the off-chain wallet association and short-lived wallet challenges. The existing browser-side demonstration ledger remains classified as confidential and is not authoritative for access decisions. Private keys are not stored or used.

## Role-based access and permissions

The four roles are Guest, User, Administrator and Security Administrator. Role defaults are declared in `backend/src/config/roles.js`. `role_permissions` stores editable role permission switches; `user_permissions` stores per-user grants. The shared authorization middleware checks the effective permission on each route, and recipe/review handlers enforce ownership. Role changes cannot target the actor's own account. Assigning or changing the Security Administrator role is restricted to an existing Security Administrator. A catalog allowlist prevents arbitrary permission grants.

Important changes are written to `audit_logs`. Sensitive administration, permission changes, account role/status changes and account events are audited. Passwords, hashes and tokens are excluded. Login audit records use an email hash for failed-attempt grouping rather than storing the submitted address. Audit filters support user, event and date ranges.

The detailed actor/module matrix is in `documentation/spreadsheets/RecipeHub_Role_Permission_Matrix.xlsx`. The ingredients row notes that there is no separate ingredient administration endpoint; ingredient data is accessed through recipe content.

## Separate security portal

`security-portal` is a separate Vite project, with its own package manifest, origin and production build. Its login calls the existing `/auth/login` endpoint. It checks role for presentation, while every admin API route also enforces the role and permission on the server. The portal includes dashboard statistics, user and role controls, role permission editing, enforced security settings, audit filters and the classification register.

Security settings exposed in the portal are connected to backend behavior: password minimum/letter/number rules, failed-login threshold, lockout duration and token expiry. The settings endpoint accepts only validated configuration keys. CORS examples include both local app origins.

## GDPR and privacy controls

The assessment is in `documentation/spreadsheets/RecipeHub_GDPR_Compliance.xlsx`. It records accurate implementation statuses and outstanding operator decisions. The signed-in profile includes a privacy notice, optional analytics and marketing preference controls, JSON data export and password-confirmed account deletion. Profile data can be corrected through the existing profile endpoint. Optional preferences are recorded, but this project does not run analytics or marketing processing.

Deletion removes user preferences, consent records, favourites, ratings, reviews, history, permissions and authored recipes in a database transaction. Related security audit records are anonymised to support accountability. Retention periods and backup expiry still require an operator policy. Restriction, objection and breach-response workflows are not implemented. Lawful basis, controller contact details and jurisdiction-specific notice text require review by the service operator; the workbook does not claim legal compliance.

## Database changes

The idempotent initializer adds `role_permissions`, `login_security`, `security_settings` and `user_consents`, seeds default role permissions and six enforced security settings, and redacts legacy failed-login email metadata. It preserves existing tables and rows. The complete schema is created only after `npm run init-db` can reach Turso.

## API additions

- `GET /api/admin/security/dashboard`
- `GET` and `PUT /api/admin/security/settings`
- `GET` and `PUT /api/admin/role-permissions`
- `GET /api/admin/data-classification`
- Existing admin user, role, permission and audit endpoints now enforce explicit backend permissions.
- `GET /api/users/me/export`
- `GET` and `PUT /api/users/me/consents`
- Password-confirmed `DELETE /api/users/me`

## Verification and limitations

Both production builds completed successfully: the main frontend and the separate portal. Backend JavaScript syntax checks succeeded. The idempotent Turso migration was attempted, including an authorized network retry, but the configured database connection timed out. Therefore the 14 database-backed security test cases remain blocked and are listed as not run in `documentation/security-testing/Security_Test_Report.md`. The live schema, permission enforcement and privacy transactions need verification after connectivity returns. No test is reported as passing without execution.

No new packages were installed. The portal declares React, React DOM, Vite and the React Vite plugin, reusing the versions already present in the main frontend for its build. To run it in a clean environment, run `npm install` in `security-portal`.

## Run instructions

1. Configure a reachable Turso URL and auth token, a strong JWT secret, and distinct strong bootstrap admin passwords in ignored `backend/.env`. Never place these values in source control.
2. From `backend`, run `npm install`, `npm run init-db`, and `npm run seed`.
3. Start the API with `npm run dev`.
4. In a separate terminal, install and start `frontend` with `npm install` and `npm run dev`.
5. In another terminal, install and start `security-portal` with `npm install` and `npm run dev`.
6. Include `http://localhost:5173` and `http://localhost:5174` in `CORS_ORIGIN`.
7. Provision the first Security Administrator through the protected bootstrap seed configuration in ignored `backend/.env`, then run the seed command. Do not publish or reuse bootstrap credentials. Rotate them through a secure account administration process after first use.
8. With API and Turso reachable, run `node test/securityRequirements.test.js` from `backend` and review its generated report.


