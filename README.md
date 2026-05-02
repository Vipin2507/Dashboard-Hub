# Buildesk Sales Hub

A modern sales and license management web application for managing leads, proposals, deals, customers, inventory, and payments—with role-based access control (RBAC). Built for the Indian market with support for regions, teams, and multi-role workflows (approvals, automation, WhatsApp/email via n8n).

---

## Features

### Overview & dashboard

- **Dashboard** (`/`) — Summary metrics (leads, proposals, revenue, pending approvals, active deals) with **role-scoped** data.
- Visibility follows **SELF**, **TEAM**, **REGION**, or **ALL** per module and role (see [Role-Based Access](#role-based-access-rbac)).

### Customer & sales management

- **Customers** (`/customers`, `/customers/:id`) — Leads/customers: region, GSTIN, contacts, notes, support tickets, activity, invoices, product lines; **Renewal & subscription tracker** tab (payment-plan–backed renewals, reminders, proposals); bulk import where implemented.
- **Proposals** (`/proposals`) — Lifecycle: draft → share → approval → approve/reject → deal creation; versioning, **final quote value**, PDF export (`src/lib/generateProposalPdf.ts` via jsPDF).
- **Deals** (`/deals`) — Deals linked to proposals/customers; stages and value; **IDs** `DEAL-YYYY-####` from server sequence; **soft delete**, **audit log** (`GET /api/deals/:id/audit`); extended fields (status, source, follow-up, loss reason, etc.). **Super Admin** can update/delete; **Sales Manager** is limited per policy (see RBAC + `dealPermissions`).

### Operations

- **Payments** (`/payments`) — Installment-based **plan catalog**, per-deal **payment plans**, **installments**, **overdue**, **history**, **remaining** balances, **confirm** flow (finance/admin), and **audit** — backed by `server/paymentsApi.js` + SQLite.
- **Inventory** (`/inventory`) — Product/SKU-style inventory CRUD (API + UI), export where permitted by role.

### Administration

- **Data Control Center** (`/admin/data-control`) — **Super Admin only**: unified module tabs (customers, deals, payments, inventory, executives), inline edit, bulk update/import, export, audit trail (`server/dataControlApi.js`).
- **Users** (`/users`) — Roles, teams/regions, status, passwords (client store + API alignment where used).
- **Teams** (`/teams`) — Teams linked to regions.
- **Regions** (`/regions`) — Region master data.
- **Email log** (`/email-log`) — Notification / email activity views.
- **Masters** (`/masters`) — **Product categories**, **subscription types**, **proposal formats** (REST under `/api/masters/...`).

### Automation

- **Automation** (`/automation`) — Templates, execution logs, settings; triggers workflows via **n8n** webhooks; optional **WAHA** for WhatsApp (see [Automation (n8n + WAHA)](#automation-n8n--waha-setup)). Also includes a **Rules** tab (local rules + cooldown) via `src/lib/automationRules.ts`.

### Authentication & RBAC

- **Login** (`/login`) — **Email + password** (persisted in `localStorage`). No Firebase/OTP.
- **Register** (`/register`) — Demo-style registration into the **Zustand** store (email/password + role); used for local/demo user creation flows.
- **Role-based access** — Sidebar and actions gated by `src/lib/rbac.ts`; deal-specific rules in `src/lib/dealPermissions.ts`.
- **Role switcher** — Sidebar control to impersonate roles/users is **visible only to Super Admin** (Reset Demo also super-admin only).
- **Scopes** — Data filtered by SELF / TEAM / REGION / ALL depending on role and module.

### Backend API (recommended for real use)

- **Express** server with **SQLite** (`better-sqlite3`), schema in `server/schema.sql`, migrations/bootstrap in `server/db.js`.
- Default DB file: `data/app.db` (configurable via `SQLITE_PATH`). **Not** in-memory-only when the API is used.
- CORS-enabled JSON API used by the SPA for persistence and integration.

---

## Tech stack

| Layer           | Technology |
| --------------- | ---------- |
| Build           | [Vite](https://vitejs.dev/) |
| Language        | [TypeScript](https://www.typescriptlang.org/) |
| UI              | [React 18](https://react.dev/) |
| Styling         | [Tailwind CSS](https://tailwindcss.com/) |
| Components      | [shadcn/ui](https://ui.shadcn.com/) (Radix) |
| State           | [Zustand](https://zustand-demo.pmnd.rs/) |
| Data fetching   | [TanStack Query](https://tanstack.com/query/latest) |
| Forms           | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Routing         | [React Router v6](https://reactrouter.com/) |
| Auth (login)    | Email/password (local demo auth) |
| PDF             | [jsPDF](https://github.com/parallax/jsPDF) + jspdf-autotable |
| Charts          | [Recharts](https://recharts.org/) |
| Backend         | [Express](https://expressjs.com/) 5.x |
| Database        | [SQLite](https://www.sqlite.org/) via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) |

---

## Architecture (high level)

```
Browser (React SPA, port 8080)
    │
    ├─► Zustand store + seed data (offline-first demo behavior)
    ├─► TanStack Query + fetch (bootstrap: regions, teams, users, notifications)
    └─► REST API (optional, default http://localhost:4000) → SQLite file data/app.db
```

- **`src/lib/api.ts`** — `VITE_API_BASE_URL` (default `http://localhost:4000`).
- **`DataBootstrapper`** in `App.tsx` — On load, tries to refresh regions, teams, users, notifications from the API; falls back to seed data if the API is down.

---

## Project structure

```
buildesk-sales-hub-main/
├── data/                      # SQLite DB directory (created at runtime; gitignored if listed)
├── public/
├── server/
│   ├── Dockerfile             # API image (see docker-compose)
│   ├── db.js                  # DB connection, WAL, schema apply, migrations, seed helpers
│   ├── schema.sql             # SQLite DDL
│   ├── index.js               # Express app: regions, teams, users, customers, proposals,
│   │                          # deals, notifications, masters, inventory, automation
│   ├── paymentsApi.js         # Payment plans, customer payment flows, history, audit
│   ├── dataControlApi.js      # Super-admin data grid, bulk patch/import, audit
│   └── subscriptionRenewalApi.js  # Subscription tracker rows, reminder settings, mark renewed
├── src/
│   ├── assets/                # Static assets (e.g. proposal branding)
│   ├── components/            # AppLayout, AppSidebar, Topbar, feature UIs, shadcn/ui
│   ├── hooks/                 # toast, mobile, etc.
│   ├── lib/
│   │   ├── api.ts             # API base URL helper
│   │   ├── automationService.ts
│   │   ├── automationRules.ts # Local rules engine + cooldown (Automation → Rules tab)
│   │   ├── dealPermissions.ts # Who can edit/delete deals (UI + server rules)
│   │   ├── dealStatus.ts
│   │   ├── generateProposalPdf.ts
│   │   ├── masterData.ts
│   │   ├── rbac.ts            # Module/action matrix by role
│   │   ├── seed.ts            # Demo seed data
│   │   └── utils.ts
│   ├── pages/                 # Route pages (Dashboard, Deals, Proposals, Customers, …)
│   ├── store/
│   │   └── useAppStore.ts     # Global state, actions, demo reset
│   ├── types/                 # Shared TS types (including automation)
│   ├── App.tsx                # Routes, QueryClient, DataBootstrapper
│   ├── main.tsx
│   └── index.css
├── docker-compose.yml         # API service + volume for ./data
├── index.html
├── package.json
├── vite.config.ts             # Port 8080; dev proxies /waha and /n8n (see file)
├── tailwind.config.ts
└── tsconfig.json
```

---

## Application routes


| Path | Page |
| ---- | ---- |
| `/login` | Login (email + password) |
| `/register` | Register (demo store) |
| `/` | Dashboard |
| `/deals` | Deals |
| `/proposals` | Proposals |
| `/customers` | Customers |
| `/customers/:id` | Customer profile |
| `/users` | Users |
| `/teams` | Teams |
| `/regions` | Regions |
| `/email-log` | Email log |
| `/inventory` | Inventory |
| `/payments` | Payments |
| `/masters` | Masters |
| `/automation` | Automation |
| `/admin/data-control` | Data Control Center (super admin) |
| `*` | Not found |

**Legacy / unused routes:** `src/pages/CustomersPage.tsx` and `src/pages/ProposalsPage.tsx` are not wired in `App.tsx`; the app uses `Customers.tsx` and `Proposals.tsx`. `src/pages/Index.tsx` is unused by the router.

---

## HTTP API (Express)

Base URL: `http://localhost:4000` (or `VITE_API_BASE_URL` / `PORT`).

### Core (`server/index.js`)

| Area | Examples |
| ---- | -------- |
| Health | `GET /api/health` |
| Regions | `GET/POST /api/regions`, `PUT/DELETE /api/regions/:id` |
| Teams | `GET/POST /api/teams`, `PUT/DELETE /api/teams/:id` |
| Users | `GET/POST /api/users`, `PUT/DELETE /api/users/:id` |
| Notifications | `GET/POST /api/notifications` |
| Customers | `GET/POST /api/customers`, `POST /api/customers/bulk`, `PUT/DELETE /api/customers/:id` |
| Proposals | `GET/POST /api/proposals`, `PUT/DELETE /api/proposals/:id` |
| Deals | `GET /api/deals`, `POST /api/deals`, `PUT /api/deals/:id`, `DELETE /api/deals/:id`, `GET /api/deals/:id/audit` |
| Masters | `GET/POST/PUT/DELETE` under `/api/masters/product-categories`, `subscription-types`, `proposal-formats` |
| Inventory | `GET /api/inventory`, `GET /api/inventory/:id`, `POST/PUT/DELETE /api/inventory` … |
| Automation | `GET/POST/PUT/DELETE /api/automation/templates`, `GET/POST/PUT /api/automation/logs`, `GET/PUT /api/automation/settings` |

### Payments (`server/paymentsApi.js`)

Payments has **two generations** of endpoints:

- **v2 (MoM 19/04/2026)** — installment-based (used by `/payments`, Customer Profile → Support Workflow):
  - **Catalog**: `GET/POST /api/payment-plans/catalog`, `PUT/DELETE /api/payment-plans/catalog/:id`
  - **Assign plan**: `POST /api/payments/customer/:customerId/assign-plan`
  - **Customer summary**: `GET /api/payments/customer/:customerId/summary-v2`
  - **Installments**: `POST /api/payments/installment/:id/pay`, `PUT /api/payments/installment/:id/confirm`
  - **Reports**: `GET /api/payments/overdue`, `GET /api/payments/history-v2`, `GET /api/payments/remaining-v2`, `GET /api/payments/audit-v2`

- **Legacy (pre MoM)** — older Payment Center tables, kept for backward compatibility on existing installs.

### Data Control (`server/dataControlApi.js`, super admin)

| Area | Examples |
| ---- | -------- |
| Meta / rows | `GET /api/data-control/meta`, `GET /api/data-control/rows?module=...` |
| Edit | `PATCH /api/data-control/cell`, `POST /api/data-control/bulk`, `POST /api/data-control/bulk-patch`, `POST /api/data-control/bulk-import` |
| Audit | `POST /api/data-control/log-view`, `GET /api/data-control/field-history` |

### Subscriptions & renewals (`server/subscriptionRenewalApi.js`)

Synced from `customer_payment_plan` into `customer_subscriptions` for the **Customers → Renewal & subscription tracker** UI.

| Area | Examples |
| ---- | -------- |
| Tracker | `GET /api/subscriptions/tracker` (rows + summary + settings) |
| Settings | `GET/PUT /api/subscriptions/settings` (super admin / sales manager) |
| Actions | `POST /api/subscriptions/:id/record-reminder`, `POST /api/subscriptions/:id/mark-renewed`, `POST /api/subscriptions/cancel-pending-reminders` |

---

## End-to-end workflows (how modules connect)

1. **Lead → customer** — Create customer (`/customers`); API `POST /api/customers`; optional bulk `POST /api/customers/bulk`.
2. **Proposal → approval → deal** — Proposals CRUD + PDF; approved proposal → **Create deal** (`POST /api/deals` with `DEAL-YYYY-####` id); deals scoped by RBAC and `dealPermissions`.
3. **Payments (v2)** — Catalog plans → assign plan to **deal/customer** → generate **installments** → record/confirm payments → overdue/history/remaining reports.
4. **Automation** — Templates by trigger plus optional **Rules** engine (`src/lib/automationRules.ts`) with cooldown; WhatsApp via WAHA dev proxy `/waha`, email/SMS via n8n (`n8nWebhookBase` + webhook path in code).
5. **Data Control** — Super admin bulk edits source tables; subscription tracker reads payment plans separately.
6. **Renewals** — Tracker lists plans by expiry; reminders use automation + manual sends; mark renewed updates plan + `customer_subscriptions`.

---

## Getting started

### Prerequisites

- **Node.js** 18+ and **npm**
- Optional: **Docker** for running the API container

### Demo credentials (seed)

- **Super Admin**: `mohit@cravingcode.in` / `buildesk`
- **Sales Rep**: e.g. `vaibhav@cravingcode.in` / `buildesk`
- All seeded users follow `firstname@cravingcode.in` with default password `buildesk` (until changed in Profile).

### Install

```bash
cd buildesk-sales-hub-main
npm install
```

### Run frontend

```bash
npm run dev
```

- App: **http://localhost:8080** (`vite.config.ts`).
- Dev server proxies **`/waha`** and **`/n8n`** to configured hosts (see `vite.config.ts`) to avoid CORS during automation development.

### Run API locally (SQLite)

```bash
npm run server
```

- API: **http://localhost:4000** (or `PORT`).
- DB file: **`data/app.db`** under the project root unless `SQLITE_PATH` is set.

Point the SPA at the API:

```powershell
# Windows PowerShell
$env:VITE_API_BASE_URL="http://localhost:4000"
npm run dev
```

```bash
# Unix
export VITE_API_BASE_URL=http://localhost:4000
npm run dev
```

### Run API with Docker

```bash
docker compose up --build -d api
```

- Maps **4000:4000**, sets `SQLITE_PATH=/app/data/app.db`, mounts **`./data`** → `/app/data`.

View logs / stop:

```bash
docker compose logs -f api
docker compose down
```

Reset DB (destructive):

```bash
rm -f data/app.db
docker compose up --build -d api
```

PowerShell:

```powershell
Remove-Item .\data\app.db -Force -ErrorAction SilentlyContinue
docker compose up --build -d api
```

---

## Available scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Vite dev server (port **8080**) |
| `npm run build` | Production build → `dist/` |
| `npm run build:dev` | Development mode build |
| `npm run preview` | Preview production build |
| `npm run server` | Express API (default port **4000**) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest once |
| `npm run test:watch` | Vitest watch |
| `docker compose up --build -d api` | API in Docker with SQLite volume |

---

## Role-based access (RBAC)

Policy source: **`src/lib/rbac.ts`**. Modules include `dashboard`, `proposals`, `deals`, `customers`, `automation`, `users`, `teams`, `regions`, `masters`, `email_log`, **`inventory`**, **`payments`**.

| Role | Notes |
| ---- | ----- |
| **super_admin** | Full modules/actions (including deal delete/update, payments, inventory). |
| **finance** | Strong on **payments** / **inventory** (view + export; full payments CRUD per policy); read-heavy on proposals/deals/customers. |
| **sales_manager** | Team-scoped dashboard/proposals; **deals**: view/create/export — **updates/deletes** are super-admin-only (see comments in `rbac.ts` and server checks). |
| **sales_rep** | Self-scoped sales workflows; **inventory** view-only; **no payments module** in policy. |
| **support** | Region-scoped views; **payments** view-only. |

Deal UI restrictions also use **`src/lib/dealPermissions.ts`** (aligned with API behavior).

---

## Demo data & reset

- Seed data lives in **`src/lib/seed.ts`** (regions, teams, users, customers, proposals, deals, notifications, inventory seeds, automation templates).
- **Switch Role** / **Reset Demo** in the sidebar exercise RBAC and restore seed state (client-side).

---

## Automation (n8n + WAHA)

Buildesk’s Automation module calls **n8n** webhooks from the browser; n8n can call **WAHA** for WhatsApp.

Example workflows (adjust host/port for your environment):

### Workflow: `buildesk-whatsapp`

- **Webhook**: `POST /webhook/buildesk-whatsapp` (auth as you require)
- **Wait**: `{{$json.delayHours}}` hours (skip if 0)
- **HTTP**: `POST {{$json.wahaApiUrl}}/api/sendText` with `X-Api-Key`, body: `session`, `chatId`, `text`
- **Respond**: `{ "status": "sent" }`

### Workflow: `buildesk-email`

- **Webhook**: `POST /webhook/buildesk-email`
- **Wait** → **Gmail/SMTP** using `recipientEmail`, `emailSubject`, `messageBody`
- **Respond**: `{ "status": "sent" }`

### Workflow: `buildesk-health`

- **Webhook**: `POST /webhook/buildesk-health` → respond with ok/timestamp

**Security:** Lock down webhooks at your reverse proxy or use n8n auth if exposed publicly. Default dev proxies in `vite.config.ts` point at example hosts; change for production.

---

## Environment variables

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `PORT` | Express API port | `4000` |
| `SQLITE_PATH` | Absolute path to SQLite file | `<cwd>/data/app.db` |
| `VITE_API_BASE_URL` | SPA → API base URL | `http://localhost:4000` |

Use **`.env`** / **`.env.local`** at the project root. Only `VITE_*` vars are exposed to the client.

---

## Deployment

- **Frontend:** `npm run build` → serve **`dist/`** (Nginx, Vercel, Netlify, etc.). Set **`VITE_API_BASE_URL`** to your production API URL at build time.
- **API:** Run `node server/index.js` (or `npm run server`) with **`SQLITE_PATH`** pointing to a persistent volume; use a process manager (PM2, systemd) and HTTPS reverse proxy.
- **Docker:** Use `docker-compose.yml` pattern: mount a host directory for `./data` so the database survives restarts.

---

## Editing the code

- **Local:** `npm install` → `npm run dev` / `npm run server`.
- **GitHub:** Standard clone/commit workflow.

---

## License

Private / unlicensed unless otherwise specified.
