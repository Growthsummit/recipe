# RecipeBox (RecipeHub)

React single-page application (faithful to the original 393 × 852 Figma design) with a
real **Node.js + Express + Turso** backend. The UI was **not redesigned**: the colours,
geometry, navigation and components are exactly as before - only the data layer was
replaced. Simulated/mock data and `localStorage` favourites are now backed by the API
and the Turso (libSQL) cloud database.

---

## 1. Project structure

```
recipebox/
├── backend/                     # Express + Turso API
│   ├── src/
│   │   ├── config/              # env, database (libSQL client), roles/permissions
│   │   ├── controllers/         # auth, recipe, category, interaction, admin
│   │   ├── middleware/          # authenticate, authorize, validate, errorHandler, rateLimiters
│   │   ├── routes/              # express routers, mounted under /api
│   │   ├── services/            # SQL data access (user, recipe, category, interaction, audit)
│   │   ├── utils/               # errors, password (bcrypt), tokens (JWT), slug, pagination
│   │   ├── validators/          # Zod schemas for every request
│   │   ├── app.js               # express app (helmet, cors, json limit, routes)
│   │   └── server.js            # http entry point
│   ├── scripts/
│   │   ├── initializeDatabase.js  # CREATE TABLE/INDEX IF NOT EXISTS (safe, non-destructive)
│   │   ├── seedData.js            # 8 categories + the 14 original recipes
│   │   └── seedDatabase.js        # idempotent seed (never overwrites rows)
│   ├── test/api.test.js         # 84-assertion live API test suite
│   ├── .env                     # real credentials (git-ignored)
│   ├── .env.example             # placeholders only
│   └── package.json
│
├── frontend/                    # React app (Vite) - unchanged design
│   ├── src/
│   │   ├── services/api.js      # single reusable API client (all backend calls)
│   │   ├── state/AppContext.js  # session + API-backed favourites + client RBAC actor
│   │   ├── screens/             # Home, Search, RecipeDetails, Favourites, Profile, Auth, MyRecipes, RecipeForm
│   │   ├── components/  admin/  security/  blockchain/  data/
│   │   └── App.js  MobileApp.js  main.jsx  styles.css
│   ├── public/                  # recipe images + governance/ai JSON served to the app
│   ├── scripts/fetch-assets.js  # downloads the original Figma photos (CommonJS)
│   ├── index.html               # Vite entry
│   ├── vite.config.mjs          # Vite config (ESM so scripts/fetch-assets.js stays CommonJS)
│   ├── .env / .env.example      # VITE_API_URL
│   ├── .gitignore
│   └── package.json
│
├── ml/                          # assignment ML pipeline (unchanged; not part of this phase)
├── governance/                  # governance workbook + builder (unchanged)
├── .gitignore
└── README.md
```

### What was already present vs. what was added
- **Already present:** the whole React UI, hash routing, the admin console, the client-side
  RBAC matrix, the browser blockchain ledger, and the ML/governance artefacts.
- **Added:** the entire `backend/` directory, the frontend `src/services/api.js` client,
  the auth/recipe-CRUD screens needed to exercise the API, and the CRA → Vite migration.
- **Rewired:** Home / Search / RecipeDetails / Favourites / Profile now read and write real
  data instead of mock data and `localStorage`.

---

## 2. Prerequisites

- **Node.js 18+** (backend `engines.node >= 18`)
- A **Turso** database and an auth token (`turso db tokens create <database>`)
- npm

---

## 3. Install

```powershell
# from the project root (c:\Users\DELL\Downloads\recipebox)
cd backend
npm install

cd ..\frontend
npm install
```

### Backend dependencies
`@libsql/client`, `bcryptjs`, `cors`, `dotenv`, `express`, `express-rate-limit`, `helmet`,
`jsonwebtoken`, `zod` (+ `nodemon` for dev).

### Frontend dependencies
`react`, `react-dom` (+ `vite`, `@vitejs/plugin-react` for dev/build).

---

## 4. Environment variables

### `backend/.env` (git-ignored - never commit)
```
PORT=5000
NODE_ENV=development

TURSO_DATABASE_URL=libsql://recipedb-growthsummit.aws-ap-south-1.turso.io
TURSO_AUTH_TOKEN=<your-turso-auth-token>

JWT_SECRET=<a long random string>
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
CORS_ORIGIN=http://localhost:3000,http://localhost:5173,http://localhost:5174

SEED_ADMIN_NAME=RecipeBox Admin
SEED_ADMIN_EMAIL=admin@recipebox.local
SEED_ADMIN_PASSWORD=<unique strong bootstrap password>

SEED_SECURITY_NAME=RecipeBox Security
SEED_SECURITY_EMAIL=security@recipebox.local
SEED_SECURITY_PASSWORD=<different unique strong bootstrap password>

RESEND_API_KEY=<Resend API key for sending password-reset emails>
EMAIL_FROM=RecipeBox <verified-sender@your-domain.example>
FRONTEND_URL=http://localhost:5173
```

`backend/.env.example` contains the same keys with **placeholders only**. Never use a
sample or shared password. Store bootstrap secrets only in the ignored `backend/.env`.
Credentials are
read exclusively from `process.env` via `src/config/env.js` - nothing is hardcoded.
Admin-triggered password resets require a Resend API key and a verified sender. Reset links expire after 30 minutes and can be used once.

### Frontend `.env`
```
VITE_API_URL=http://localhost:5000/api
```

---

## 5. Turso configuration

1. The database URL must look like `libsql://<name>-<org>.aws-<region>.turso.io`.
2. Create a token with `turso db tokens create <database>` and paste it into
   `TURSO_AUTH_TOKEN`. The token is **never** returned by the API and **never** logged.
3. All access goes through `src/config/database.js`, which creates a single
   `@libsql/client` connection used by every service.

---

## 6. Database initialisation

```powershell
cd backend
npm run init-db    # creates the 13 tables + indexes (CREATE ... IF NOT EXISTS; drops nothing)
npm run seed       # optional: 8 categories + 14 original recipes + seed accounts (idempotent)
```

`init-db` is safe to re-run and **never deletes existing data**. It creates the RBAC,
login-security, security-settings and consent tables and seeds the default role
permission catalog. `seed` skips rows that already exist, so it never overwrites edits.

### Tables (17)
| # | Table | Purpose |
|---|---|---|
| 1 | `users` | Accounts, bcrypt `password_hash`, role (`user`/`admin`/`security_admin`), active flag |
| 2 | `categories` | Recipe categories (Pasta, Pizza, Healthy, …) - unique slug + name |
| 3 | `recipes` | Core content: title, description, category, author, image, time, difficulty, servings, dietary, instructions, status, views, cached rating |
| 4 | `ingredients` | Normalised master list of ingredient names (unique) |
| 5 | `recipe_ingredients` | Join table recipe↔ingredient with `display_text`, quantity, unit, position; unique per (recipe, ingredient) |
| 6 | `favourites` | One row per (user, recipe) - unique pair prevents duplicates |
| 7 | `ratings` | One 1–5 score per (user, recipe) - unique pair, so re-rating updates |
| 8 | `reviews` | Written feedback (multiple per user allowed) with soft-hide flag |
| 9 | `cooking_history` | "I cooked this" log (cooked_at, servings, notes) |
| 10 | `user_preferences` | One row per user: dietary prefs, theme, language, units, notifications |
| 11 | `audit_logs` | Who did what / when; stores **no** passwords, tokens or secrets |
| 12 | `user_permissions` | Extra per-user permissions granted by a Security Administrator |
| 13 | `role_permissions` | Editable role-to-permission settings enforced by API middleware |
| 14 | `login_security` | Hashed login identifiers, failed counts and lockout expiry |
| 15 | `security_settings` | Backend-enforced password, lockout and token lifetime settings |
| 16 | `user_consents` | Optional consent choices and policy version |
| 17 | `blockchain_records` | Existing persistence placeholder; no blockchain feature is active |

Indexes cover recipe category/author/published/title/time, the ingredient join, favourites,
ratings, reviews, cooking history, audit logs, permissions and the ledger. Blockchain tables
also hold wallet challenges/links and Sepolia proof references; legacy demonstration-ledger
rows are retained.

---

## 7. Running the app

Two terminals.

```powershell
# Terminal 1 - backend (http://localhost:5000)
cd backend
npm run dev          # nodemon; use `npm start` for a plain node run
```

```powershell
# Terminal 2 - frontend (http://localhost:5173)
cd c:\Users\DELL\Downloads\recipebox\frontend
npm run dev
```

Health check: <http://localhost:5000/api/health> →
`{"success":true,"data":{"status":"ok","database":"connected"}}`.

The frontend dev server proxies nothing - it calls the API directly using `VITE_API_URL`.
The backend CORS list must include both `http://localhost:5173` and
`http://localhost:5174`.

```powershell
# Terminal 3 - separate Security Administrator portal
cd C:\Users\DELL\Downloads\recipebox\security-portal
npm install
npm run dev
```

The security portal runs at `http://localhost:5174` and uses the same API at port 5000.
It is a separate Vite application and is prepared to use a distinct production domain.
Set `VITE_API_URL` in `security-portal/.env` when the API origin changes.

Create the first Security Administrator by setting a strong, unique
`SEED_SECURITY_EMAIL` and `SEED_SECURITY_PASSWORD` in ignored `backend/.env`, then run
`npm run seed` in `backend`. Keep the file private. Do not commit it or paste the password
into documentation or chat. The portal accepts only this role; the backend checks the
role from the database on every protected request.

### Security and privacy endpoints

- `GET /api/admin/security/dashboard`, `GET/PUT /api/admin/security/settings`
- `GET/PUT /api/admin/role-permissions`
- `GET /api/admin/data-classification`
- `GET /api/admin/users`, role and active-state updates, user permission management,
  and `GET /api/admin/audit-logs` (optional `from`, `to`, `userId`, `action` filters)
- `GET /api/users/me/export`, `GET/PUT /api/users/me/consents`, and
  password-confirmed `DELETE /api/users/me`

Each endpoint uses shared authentication, role and permission middleware. The user role
is reloaded from Turso, and account-specific data routes use the authenticated account ID.
Security settings change password validation, failed-login lockout, and token expiry in
the backend; settings are not UI-only switches.

Security assignment files are in `documentation/`. The 14 API test cases are in
`backend/test/securityRequirements.test.js`; run them with the backend database and API
available by executing `node test/securityRequirements.test.js` from `backend`.

Production build: `npm run build` (output in `./dist`), preview with `npm run preview`.

---

## 8. API endpoints

All responses use the envelope `{ "success": true, "data": ... }`; errors use
`{ "success": false, "error": { "message", "code", "details?" } }`. Auth is
`Authorization: Bearer <jwt>`.

### Auth - `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/register` | - | Create account (rate-limited). Never accepts a `role`. |
| POST | `/login` | - | Sign in, returns a JWT (rate-limited). |
| POST | `/logout` | user | Audit-logged sign-out. |
| GET | `/me` | user | Current user profile. |
| PATCH | `/me` | user | Update own profile (name, bio, avatar, email). Cannot change own role. |
| PUT | `/me/password` | user | Change own password (requires current password). |

### Recipes - `/api/recipes`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | List published recipes. Filters: `q`, `category`, `ingredient`, `difficulty`, `dietary`, `minTime`, `maxTime`, `sort`, `page`, `limit`. |
| GET | `/mine` | user | The current user's recipes (including drafts). |
| POST | `/` | user | Create a recipe (validated). |
| GET | `/:idOrSlug` | optional | One recipe by numeric id **or** slug. |
| PUT / PATCH | `/:id` | owner/admin | Update a recipe. |
| DELETE | `/:id` | owner/admin | Delete a recipe. |
| POST | `/:id/view` | optional | Record a view (increments `views_count`). |

### Interactions (recipe-scoped) - `/api/recipes`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/:id/favourite` | user | Add a favourite (idempotent). |
| DELETE | `/:id/favourite` | user | Remove a favourite. |
| POST | `/:id/rating` | user | Set/replace own 1–5 rating. |
| GET | `/:id/rating` | user | Own rating for a recipe. |
| GET | `/:id/reviews` | - | Public review list. |
| POST | `/:id/reviews` | user | Create a review. |
| POST | `/:id/history` | user | Add a cooking-history entry. |

### Reviews - `/api/reviews`
| Method | Path | Auth | Description |
|---|---|---|---|
| PATCH | `/:id` | owner/admin | Edit a review (ownership enforced). |
| DELETE | `/:id` | owner/admin | Delete a review (ownership enforced). |

### Categories - `/api/categories`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | optional | List categories. |
| GET | `/:slug` | optional | One category. |
| POST | `/` | admin | Create a category. |
| PATCH | `/:id` | admin | Update a category. |
| DELETE | `/:id` | admin | Delete a category. |

### My data - `/api/users/me`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/favourites` | user | Paginated favourites (with recipe data). |
| GET | `/history` | user | Paginated cooking history. |
| GET | `/preferences` | user | Preferences (created on demand). |
| PUT | `/preferences` | user | Update preferences. |

### Admin - `/api/admin`
| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/users` | `user:read` | List users. |
| GET | `/users/:id` | `user:read` | One user. |
| PATCH | `/users/:id/role` | `user:manage` | Change a role (cannot grant `security_admin`; no self-promotion). |
| PATCH | `/users/:id/active` | `user:manage` | Activate / deactivate a user. |
| GET | `/users/:id/permissions` | `permission:read` | List extra permissions. |
| POST | `/users/:id/permissions` | `permission:manage` | Grant a permission (Security Admin). |
| DELETE | `/users/:id/permissions/:permission` | `permission:manage` | Revoke a permission (Security Admin). |
| GET | `/audit-logs` | `audit:read` | Read the audit log. |
| GET | `/health` | - | DB connectivity. |

---

## 9. Authentication & authorisation

- Passwords are hashed with **bcryptjs** (`BCRYPT_ROUNDS`); plain text is never stored or logged.
- Login/registration return a **JWT** (`JWT_SECRET`, `JWT_EXPIRES_IN`). The frontend stores it
  under `localStorage["recipebox.token"]` and sends it as a Bearer token.
- `authenticate` middleware verifies the token and loads the user **from the database**, so a
  role or user id supplied by the frontend is never trusted.
- `requirePermission(...)` middleware enforces RBAC on the server:
  - **Guest** - read published recipes and categories only.
  - **User** - create/manage their own recipes, favourites, ratings, reviews, history, profile.
  - **Administrator** - everything a user can, plus `recipe:*:any`, `category:manage`,
    `user:read`, `user:manage`, `audit:read`.
  - **Security Administrator** - `permission:read`, `permission:manage`, `user:read`, `audit:read`
    (but **not** recipe writes / category management).
- Ownership is checked in the service layer: a user can only edit/delete their **own** recipes
  and reviews; admins may manage any.
- A user can never change their own role (`SELF_UPDATABLE_PROFILE_FIELDS` excludes `role`), and
  an administrator cannot grant `security_admin` or manage permissions.

### Security measures
Helmet security headers · CORS origin allow-list · `express.json({ limit: '100kb' })` ·
`express-rate-limit` on auth / API / write endpoints · Zod `.strict()` validation on every
body/query/params · parameterised libSQL queries (no string interpolation) · centralised error
handler that hides internals · **audit logs** for important actions · the API never returns
`password_hash`, tokens or DB credentials.

---

## 10. Frontend ↔ backend integration

`src/services/api.js` is the single place that talks to the backend (base URL from
`VITE_API_URL`) and exposes `auth`, `recipes`, `categories`, `favourites`, `ratings`,
`reviews`, `history`, `preferences`, `health`.

| UI surface | Backend calls |
|---|---|
| Home | `recipes.list({ sort: 'popular' })` (+ `viewCount`/rating) |
| Search | `recipes.list({ q })` and `recipes.list({ category })` |
| Recipe details | `recipes.get(slug)`, `recipes.recordView`, `reviews.list`, `reviews.create`, `reviews.remove`, `ratings.set`, `history.add`, favourite toggle |
| Favourites | `favourites.list`, `favourites.add/remove` |
| Profile | `auth.me`, `auth.updateMe`, `preferences.get/update`, `auth.logout` |
| Register / Login | `auth.register`, `auth.login` |
| My Recipes | `recipes.mine` (+ delete) |
| Recipe create/edit | `recipes.create`, `recipes.update`, `recipes.uploadImage`, `categories.list` |

Loading states, empty states and error messages are shown on every screen. Protected screens
(Auth, My Recipes, Recipe Form, Favourites when signed out) prompt for sign-in via
`requireAuth()`. No button is left non-functional.

### Images
Seeded recipes continue using their existing image URLs. Recipe create/edit uses a local JPG,
PNG, or WebP upload, with a preview before saving. The authenticated backend validates uploads
up to 5 MB against the file signature and stores them under `backend/uploads/recipes`; the
recipe record stores the resulting image URL, which is served by RecipeHub when the recipe is
opened later. That upload folder is Git-ignored.
Deployments must provide persistent file storage or replace the local upload store with a
durable object-storage service.

---

## 11. Testing

A live suite (needs the backend running) covers health, public reads, search/filters,
registration/validation, login/auth, recipe CRUD and ownership, favourites, ratings, reviews,
history/preferences/views, roles/permissions/audit logging, categories, error handling and
payload limits.

```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd backend
npm test
```

Latest result: **84 passed, 0 failed**.

Manual smoke test (PowerShell):

```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://localhost:5000/api/recipes?limit=3
```

Then in the browser (<http://localhost:5173>): register an account, create a recipe, edit and
delete it, favourite a recipe, rate and review it, and update the profile - each action persists
in Turso.

---

## 12. Design fidelity notes (unchanged from the original build)

Taken straight from the Figma design: colours, Inter, card geometry (327 × 210, 16px radius),
copy, spelling ("Deserts"), and the bottom-nav label positions.

Reconstructed or inferred (please compare against Figma where it matters):
- Profile, Notifications, App Settings, About screens: avatar fill (`#5A3825` with cream "R"),
  row surface/border, font weights and text colours were inferred from the layout data.
- Heart circle, saved-heart glyph, star and search magnifier are redrawn, not the original SVGs.
- Card rating/time on Home/Search can differ from the detail screen (e.g. Banana Pancakes
  4.6 / 15 min vs 4.8 / 20 min); both are preserved on their own screens.
- "Spicy Chicken Rice" (Trending) has no Figma detail screen; it opens "Chicken and Rice".

### Blockchain verification (Sepolia)

RecipeHub can register a SHA-256 digest of a published recipe in `RecipeRegistry` on
Ethereum Sepolia. The recipe text and personal details are never sent to the contract.
The user links MetaMask with a short-lived signed challenge and signs every contract
transaction in MetaMask; the backend does not store or request a private key. The contract
records the registering wallet and allows that wallet to append changed-content versions.
Application authorization separately requires the signed-in recipe owner.

Deploy `blockchain/contracts/RecipeRegistry.sol` from Remix with Solidity 0.8.24 or newer
to Sepolia. Configure the operator's backend environment with `BLOCKCHAIN_NETWORK=sepolia`,
`BLOCKCHAIN_CHAIN_ID=11155111`, a Sepolia RPC URL from the chosen provider, and the deployed
contract address. Keep RPC credentials in ignored environment configuration, never in
frontend code or documentation. Configure MetaMask for Sepolia and ensure the user's wallet
has test ETH before registering. No deployment, RPC provider, or wallet secret is bundled.

Compile locally with `npm run blockchain:compile` in `backend`; run canonicalization checks
with `npm run blockchain:test`. Build the UI with `npm run build` in `frontend`. The backend
exposes wallet challenge/link, registration preparation, transaction submission/confirmation,
history, verification, lookup and dashboard under `/api/blockchain`; these routes use normal
authentication and permission checks. See `documentation/blockchain/` for the implementation
and test reports. Existing client-side ledger data remains a demonstration and is separate
from Sepolia proofs.

### Honest limits
- **Photographs:** `frontend/scripts/assets-manifest.json` lists the original Figma image URLs
  and `npm run fetch-assets` (run from `frontend/`) downloads them into `frontend/public/images/recipes`.
  Those links expire ~7 days after 2 Nov 2026; if they fail, export the photos from Figma using
  the manifest names.
- **Blockchain live use** requires an operator-configured Sepolia RPC and contract address,
  the initialized Turso schema, MetaMask, and Sepolia test ETH. Local compilation and hashing
  do not imply a deployed contract or confirmed transaction.
- The **client RBAC actor switch** remains a browser-side demonstration. The real security
  boundary is the Express backend.
- The original **AI/ML demo** under `ml/` and `frontend/public/ai/metrics.json` remains simulation-based and visibly labelled as such. The separate AI Kitchen in the RecipeHub app uses the trained TF-IDF, Random Forest, and K-Means models through Express and the secured Python inference service. Streamlit remains the standalone evaluation dashboard. Details are in [`ai/README.md`](ai/README.md) and [`documentation/RecipeHub_AI_Implementation.md`](documentation/RecipeHub_AI_Implementation.md).
- Deployment config is included (see §13); the operator still has to create the
  Render and Vercel services and supply the production secrets.

---

## 13. Deployment

The Turso database is already online and shared by every environment. The
frontend deploys to **Vercel** (static build) and the backend to **Render**
(Node web service); they are configured to talk to each other over CORS.

### 13.1 Backend -> Render

A `render.yaml` blueprint is included at the repository root. In Render choose
**New -> Blueprint**, connect `Growthsummit/recipe` and apply the file. It
creates a web service named `recipebox-api` with:

| Setting | Value |
|---|---|
| Root directory | `backend` |
| Build command | `npm ci` |
| Start command | `npm start` (`node src/server.js`) |
| Health check | `/api/health` |

Fill the secrets Render leaves blank in the dashboard:

| Variable | Value |
|---|---|
| `TURSO_DATABASE_URL` | the existing `libsql://…turso.io` URL |
| `TURSO_AUTH_TOKEN` | token from `turso db tokens create <database>` |
| `JWT_SECRET` | generated by Render (`generateValue: true`) or your own long random string |
| `CORS_ORIGIN` | the Vercel URL, e.g. `https://recipe.vercel.app` |
| `FRONTEND_URL` | the same Vercel URL (used for password-reset links) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend key + verified sender |
| `BLOCKCHAIN_*` | optional Sepolia RPC URL + contract address |

`PORT` is provided by Render automatically. Render's disk is ephemeral, so
uploaded recipe images (`backend/uploads/recipes`) are lost on each deploy -
attach a persistent disk or an object store for durable uploads. The seeded
recipes use relative `/images/recipes/*` paths served by the frontend, so they
are unaffected.

### 13.2 Frontend -> Vercel

Create a Vercel project from the same repository and set **Root Directory** to
`frontend` (Vite is auto-detected; `frontend/vercel.json` pins the build
command, output directory and SPA rewrite). Add the environment variable:

```
VITE_API_URL=https://recipebox-api.onrender.com/api
```

`VITE_*` values are embedded at build time, so redeploy after changing them.

### 13.3 Security portal (optional)

`security-portal/` is a separate Vite app. Deploy it as its own Vercel project
(Root Directory `security-portal`) and set `VITE_API_URL` to the Render URL,
then add that domain to the backend `CORS_ORIGIN` list.
