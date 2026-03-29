# Deploy Buildesk Sales Hub on Hostinger KVM VPS

This guide deploys the **Vite + React frontend** (static files) and **Express + SQLite API** on Ubuntu/Debian. Tested flow: **Nginx** (HTTPS + reverse proxy) + **PM2** (Node API) + **Let’s Encrypt** (SSL).

## Folder layout on the VPS

Use a **parent folder** for the whole deployment, with the **app** and **database** as siblings:

```text
/var/www/buildesk/
├── Dashboard-Hub/          ← project root: package.json, server/, src/, dist/ after build
│   ├── .env.production
│   ├── package.json
│   ├── package-lock.json
│   ├── deploy/
│   ├── server/
│   └── dist/               ← created by npm run build
└── data/                   ← SQLite only (sibling of Dashboard-Hub, not inside it)
    └── app.db
```

**Important**

- Run **`npm ci`**, **`npm run build`**, and **PM2 `cwd`** inside **`Dashboard-Hub/`** (the folder that contains `package.json`). Example: `cd /var/www/buildesk/Dashboard-Hub`.
- With **`data/` next to** the app folder, set **`SQLITE_PATH`** to `/var/www/buildesk/data/app.db` so the API uses that file (the default `./data/app.db` would otherwise resolve to `Dashboard-Hub/data/`).

**What you need**

- Hostinger VPS with **Ubuntu 22.04/24.04** (or Debian 12)
- **Either** a domain with DNS A record → VPS IP **or** access via **public IPv4 only** (see below)
- SSH access (Hostinger panel → SSH keys / root password)

**Ports**

- **80** (and **443** if you use HTTPS with a domain) — Nginx
- **4000** — API (localhost only; not exposed publicly if Nginx proxies `/api`)

### IP only — no domain

You can deploy without buying a domain: open the app at `http://YOUR_VPS_IP/`.

1. **Frontend build** — use your public IP as the API origin (HTTP, not HTTPS). Create `.env.production` **inside** `Dashboard-Hub/`:

   ```bash
   cd /var/www/buildesk/Dashboard-Hub
   echo 'VITE_API_BASE_URL=http://YOUR_VPS_IP' > .env.production
   npm run build
   ```

2. **Skip Certbot** — Let’s Encrypt issues certificates for **hostnames**, not arbitrary IPv4 addresses in the usual flow. Use plain HTTP on port 80, or add a cheap/free domain later and then enable HTTPS.

3. **Nginx** — listen on port 80; set `server_name _` or your IP; same `root` and `location /api` proxy as in `deploy/nginx.example.conf` (omit SSL blocks). Set `root` to **`/var/www/buildesk/Dashboard-Hub/dist`**.

4. **UFW** — allow `Nginx HTTP` (port 80), not only “Nginx Full”, until you add HTTPS.

---

## 1. First login and update the server

```bash
ssh root@YOUR_VPS_IP
```

Create a non-root user (recommended):

```bash
adduser deploy
usermod -aG sudo deploy
ssh-copy-id deploy@YOUR_VPS_IP
# Or manually add your SSH public key to /home/deploy/.ssh/authorized_keys
```

From now on, use `deploy` (or keep `root` if you prefer; adjust paths).

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

---

## 2. Install Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
npm -v
```

---

## 3. Install Nginx and Certbot (SSL)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 4. Create folders and clone the project

```bash
sudo mkdir -p /var/www/buildesk/Dashboard-Hub
sudo mkdir -p /var/www/buildesk/data
sudo chown -R $USER:$USER /var/www/buildesk
cd /var/www/buildesk/Dashboard-Hub
git clone https://github.com/YOUR_ORG/buildesk-sales-hub-main.git .
# Or upload via scp/rsync from your PC into this directory
```

---

## 5. Environment variables

**Frontend** — create **`.env.production` in `Dashboard-Hub/`** (same folder as `package.json`). `VITE_API_BASE_URL` is the **origin only** (no `/api`); the app builds URLs like `https://yourdomain.com/api/...` (see `src/lib/api.ts`).

```bash
cd /var/www/buildesk/Dashboard-Hub
echo 'VITE_API_BASE_URL=https://yourdomain.com' > .env.production
```

Rebuild whenever you change this (`npm run build`).

**API / SQLite** — use the sibling **`/var/www/buildesk/data`** folder:

```bash
sudo chown $USER:$USER /var/www/buildesk/data
export SQLITE_PATH=/var/www/buildesk/data/app.db
```

Persist **`SQLITE_PATH`** in the PM2 ecosystem file (see section 8).

---

## 6. Install dependencies and build

```bash
cd /var/www/buildesk/Dashboard-Hub
npm ci
npm run build
```

`npm ci` requires **`package-lock.json`** in this directory (clone or upload the full repo). If you see `EUSAGE` / missing lockfile, run **`npm install`** instead, or copy `package-lock.json` from your dev machine.

This creates **`Dashboard-Hub/dist/`** with the SPA.

---

## 7. Install PM2 globally

```bash
sudo npm install -g pm2
```

---

## 8. PM2: run the API

Copy the example ecosystem file and set **`cwd`** to **`Dashboard-Hub`**, **`SQLITE_PATH`** to **`/var/www/buildesk/data/app.db`**.

```bash
cd /var/www/buildesk/Dashboard-Hub
cp deploy/ecosystem.config.cjs ecosystem.config.cjs
nano ecosystem.config.cjs
```

In `ecosystem.config.cjs`, use for example:

- `cwd`: `/var/www/buildesk/Dashboard-Hub`
- `env.SQLITE_PATH`: `"/var/www/buildesk/data/app.db"`

Then:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER
# Run the command PM2 prints (sudo ...)
```

Verify API:

```bash
curl -s http://127.0.0.1:4000/api/health
```

---

## 9. Nginx: static site + `/api` proxy

Set Nginx **`root`** to the built SPA:

`root /var/www/buildesk/Dashboard-Hub/dist;`

```bash
sudo cp /var/www/buildesk/Dashboard-Hub/deploy/nginx.example.conf /etc/nginx/sites-available/buildesk
sudo nano /etc/nginx/sites-available/buildesk
# Set root to: /var/www/buildesk/Dashboard-Hub/dist
# Replace: server_name, ssl_certificate paths (after certbot), if using HTTPS
sudo ln -s /etc/nginx/sites-available/buildesk /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

**First-time SSL** (after DNS points to this server):

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot will adjust the Nginx config for HTTPS.

---

## 10. Firewall (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Do **not** open port 4000 publicly if Nginx proxies `/api` locally.

---

## 11. CORS (if API and site share the domain)

If the SPA is served from `https://yourdomain.com` and API is `https://yourdomain.com/api`, the browser sees **same origin**. Your Express app uses `cors()` broadly — for production you can restrict origins in `server/index.js` to your domain only.

---

## 12. Deploy updates (routine)

```bash
cd /var/www/buildesk/Dashboard-Hub
git pull
npm ci
npm run build
pm2 restart buildesk-api
```

---

## 13. Backups (SQLite)

```bash
# Example nightly cron — sibling data folder
0 3 * * * cp /var/www/buildesk/data/app.db /backup/buildesk-$(date +\%Y\%m\%d).db
```

---

## 14. Troubleshooting

| Issue | Check |
| ----- | ----- |
| 502 Bad Gateway | `pm2 logs buildesk-api`, `curl http://127.0.0.1:4000/api/health` |
| API works, UI blank | Nginx `root` must be `.../Dashboard-Hub/dist`, `index.html` exists |
| Wrong or empty DB | `SQLITE_PATH` must be `/var/www/buildesk/data/app.db` if `data/` is beside `Dashboard-Hub/` |
| `cd` fails | Use the full path: `cd /var/www/buildesk/Dashboard-Hub` |
| CORS errors | `VITE_API_BASE_URL` must match how the browser calls the API (same origin = use domain URL) |
| WAHA / n8n | Automation uses external URLs from **Automation settings** in the app; ensure VPS can reach those hosts |

---

## Alternative: Docker API only

If you only run the API in Docker, run Compose **from `Dashboard-Hub/`** (where `docker-compose.yml` lives) and still point **`SQLITE_PATH`** / volume at **`/var/www/buildesk/data`** if you keep DB outside the container tree.

```bash
cd /var/www/buildesk/Dashboard-Hub
docker compose up -d --build
```

Nginx still serves `dist/` and proxies `/api` to `http://127.0.0.1:4000`. The provided `Dockerfile` does not include the Vite build — use PM2 + Nginx for the full stack unless you add a multi-stage Dockerfile.

---

## Checklist

- [ ] DNS A record → VPS IP (if using a domain)
- [ ] Node 20; `npm ci` + `npm run build` inside **`Dashboard-Hub/`**
- [ ] **`/var/www/buildesk/data`** writable; **`SQLITE_PATH=/var/www/buildesk/data/app.db`** in PM2
- [ ] PM2 **`cwd`** = **`/var/www/buildesk/Dashboard-Hub`**
- [ ] Nginx **`root`** = **`/var/www/buildesk/Dashboard-Hub/dist`**, `location /api` → `127.0.0.1:4000`
- [ ] Certbot SSL (domain only)
- [ ] UFW: 22, 80, 443 (or 22 + 80 if IP-only HTTP)
- [ ] `VITE_API_BASE_URL` set before build (domain or `http://YOUR_VPS_IP`)
