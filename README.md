# Buildesk Sales Hub

A modern sales and license management web application for managing leads, proposals, deals, customers, and teams with role-based access control (RBAC). Built for the Indian market with support for regions, teams, and multi-role workflows including approval flows and email notifications.

---

## Features

### Overview & Dashboard
- **Dashboard** — Summary metrics (total leads, proposals shared, revenue, pending approvals, active deals) with role-scoped data
- Role-aware visibility: stats and lists respect **SELF**, **TEAM**, **REGION**, or **ALL** scope per role

### Customer & Sales Management
- **Leads (Customers)** — Create, view, and manage customer/lead records with region, GSTIN, contact details, and assignment to sales executives
- **Proposals** — Full proposal lifecycle: draft → share with customer → request approval → approve → create deal; version history and final quote value
- **Deals** — Track deals linked to proposals, with stages and values; create deals from approved proposals

### Administration
- **Users** — Register users, assign roles (Super Admin, Finance, Sales Manager, Sales Rep, Support), enable/disable accounts, change passwords
- **Teams** — Manage teams and link them to regions
- **Regions** — Manage regions (e.g. North, West, South, East)
- **Email Log** — View sent notifications (customer emails, internal, audit)
- **Masters** — Manage lookup data: product categories, subscription types, proposal formats

### Authentication & RBAC
- **Login / Register** — Email/password auth (demo: in-memory store)
- **Role-based access** — Sidebar and pages show only modules the current role can access
- **Role switcher** — Demo-only role switcher in the sidebar to test different permissions
- **Scopes** — Data filtered by SELF (own), TEAM, REGION, or ALL based on role and module

### API Server (Optional)
- Express server for **customers** and **masters** (product categories, subscription types, proposal formats)
- Used for integration or when you want to back the UI with a simple REST API; app also works with in-memory Zustand store only

---

## Tech Stack

| Layer        | Technology |
|-------------|------------|
| Build       | [Vite](https://vitejs.dev/) |
| Language    | [TypeScript](https://www.typescriptlang.org/) |
| UI          | [React 18](https://react.dev/) |
| Styling     | [Tailwind CSS](https://tailwindcss.com/) |
| Components  | [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| State       | [Zustand](https://zustand-demo.pmnd.rs/) (global app state) |
| Data fetching | [TanStack Query](https://tanstack.com/query/latest) (e.g. customers from API) |
| Forms       | [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) |
| Routing     | [React Router v6](https://reactrouter.com/) |
| Icons       | [Lucide React](https://lucide.dev/) |
| Charts      | [Recharts](https://recharts.org/) |
| Backend (optional) | [Express](https://expressjs.com/) (Node.js) |

---

## Project Structure

```
buildesk-sales-hub-main/
├── src/
│   ├── components/       # Reusable UI (AppLayout, AppSidebar, Topbar) + shadcn/ui
│   ├── pages/            # Route-level pages (Dashboard, Deals, Proposals, etc.)
│   ├── store/            # Zustand store (useAppStore) — auth, entities, actions
│   ├── lib/              # Utilities: rbac, seed data, masterData, utils
│   ├── hooks/            # Custom hooks (toast, mobile)
│   ├── types/            # TypeScript types and role labels
│   ├── App.tsx           # Root app, routing, providers
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
├── server/               # Optional Express API (customers, masters)
├── public/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

---

## Getting Started

### Prerequisites
- **Node.js** (v18+ recommended) and **npm**  
  - Install via [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) or [nodejs.org](https://nodejs.org/)

### 1. Clone and install

```bash
git clone <YOUR_GIT_URL>
cd buildesk-sales-hub-main
npm install
```

### 2. Run the app

**Frontend only (uses in-memory Zustand store + seed data):**

```bash
npm run dev
```

App runs at **http://localhost:8080** (see `vite.config.ts`).

**With API server (customers + masters from API):**

Terminal 1 — API:

```bash
npm run server
```

Runs at **http://localhost:4000** (or `PORT` env).

Terminal 2 — Frontend (optional: point to API):

```bash
# Optional: set API base URL (default is http://localhost:4000)
# Windows (PowerShell): $env:VITE_API_BASE_URL="http://localhost:4000"
# Unix: export VITE_API_BASE_URL=http://localhost:4000
npm run dev
```

---

## Available Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port 8080) with HMR |
| `npm run build` | Production build (output in `dist/`) |
| `npm run build:dev` | Build in development mode |
| `npm run preview` | Serve the production build locally |
| `npm run server` | Start Express API server (port 4000) |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Run Vitest in watch mode |

---

## Role-Based Access (RBAC)

Roles and typical access:

| Role | Description | Typical scope |
|------|-------------|---------------|
| **Super Admin** | Full access to all modules and actions | ALL |
| **Finance** | Dashboard, proposals/deals/customers (view/export), email log | ALL |
| **Sales Manager** | Dashboard (team), proposals/deals/customers (team/region), approve proposals | TEAM / REGION |
| **Sales Rep** | Own dashboard, proposals, deals, customers, email log | SELF |
| **Support** | Dashboard (region), proposals/deals/customers (region), email log | REGION |

Actions are defined per module (e.g. `view`, `create`, `update`, `delete`, `approve`, `share`, `export`, `request_approval`, `override_final_value`, `admin_override`).  
See `src/lib/rbac.ts` for the full policy.

---

## Demo Data & Reset

The app ships with **seed data** in `src/lib/seed.ts`: regions, teams, users, customers, proposals, deals, and notifications.

- **Default login:** e.g. Amit (Sales Rep) — `amit@buildesk.com` / `sales123` (see seed users for others).
- Use **Switch Role** in the sidebar to change role without logging out (demo only).
- Use **Reset Demo** to restore initial seed state.

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Express API server port | `4000` |
| `VITE_API_BASE_URL` | Base URL for API (customers, masters) | `http://localhost:4000` |

Create a `.env` or `.env.local` in the project root if needed. For Vite, only variables prefixed with `VITE_` are exposed to the client.

---

## Deployment

- **Frontend:** Run `npm run build` and serve the `dist/` folder with any static host (e.g. Nginx, Vercel, Netlify).
- **API:** Run `npm run server` behind a process manager (e.g. PM2) and reverse proxy; note the server uses in-memory storage (no persistence).
- This project can also be deployed via [Lovable](https://lovable.dev): open the project there and use **Share → Publish**. Custom domains can be configured under **Project → Settings → Domains**.

---

## Editing the Code

- **Lovable:** Open the project in [Lovable](https://lovable.dev) and edit via the UI; changes can sync to this repo.
- **Local IDE:** Clone the repo, run `npm i` and `npm run dev`; push changes to sync back to Lovable if connected.
- **GitHub:** Edit files in the repo and commit.

---

## License

Private / unlicensed unless otherwise specified.
