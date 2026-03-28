# Deploy Buildesk Sales Hub on Hostinger KVM VPS

This guide deploys the **Vite + React frontend** (static files) and **Express + SQLite API** on Ubuntu/Debian. Tested flow: **Nginx** (HTTPS + reverse proxy) + **PM2** (Node API) + **Let’s Encrypt** (SSL).

**What you need**

- Hostinger VPS with **Ubuntu 22.04/24.04** (or Debian 12)
- **Domain** pointed to the VPS public IP (A record: `yourdomain.com` → VPS IP)
- SSH access (Hostinger panel → SSH keys / root password)

**Ports**

- **80 / 443** — Nginx (HTTP redirects to HTTPS)
- **4000** — API (localhost only; not exposed publicly if Nginx proxies `/api`)

---

## 1. First login and update the server

```bash
ssh root@YOUR_VPS_IP
```

Create a non-root user (recommended):

```bash
adduser deploy
usermod -aG sudo deploy
`ssh-copy-id deploy@YOUR_VPS_IP` or manually add your SSH public key to `/home/deploy/.ssh/authorized_keys`
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

## 4. Clone the project

```bash
sudo mkdir -p /var/www/buildesk
sudo chown $USER:$USER /var/www/buildesk
cd /var/www/buildesk
git clone https://github.com/YOUR_ORG/buildesk-sales-hub-main.git .
# Or upload via scp/rsync from your PC
```

---

## 5. Environment variables

Create `/var/www/buildesk/.env.production` for the **frontend build**. `VITE_API_BASE_URL` is the **origin only** (no `/api`); the app builds URLs like `https://yourdomain.com/api/...` (see `src/lib/api.ts`).

```bash
echo 'VITE_API_BASE_URL=https://yourdomain.com' > /var/www/buildesk/.env.production
```

Rebuild whenever you change this (`npm run build`).

**API environment** (SQLite path on the server):

```bash
sudo mkdir -p /var/www/buildesk/data
sudo chown $USER:$USER /var/www/buildesk/data
export SQLITE_PATH=/var/www/buildesk/data/app.db
```

Persist for PM2 in the ecosystem file (see section 8).

---

## 6. Install dependencies and build

```bash
cd /var/www/buildesk
npm ci
npm run build
```

This creates `dist/` with the SPA.

---

## 7. Install PM2 globally

```bash
sudo npm install -g pm2
```

---

## 8. PM2: run the API

Copy the example ecosystem file from `deploy/ecosystem.config.cjs` to the project root and edit `cwd`, `user`, and env.

```bash
cd /var/www/buildesk
cp deploy/ecosystem.config.cjs ecosystem.config.cjs
nano ecosystem.config.cjs   # set name, cwd, SQLITE_PATH, PORT
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

```bash
sudo cp /var/www/buildesk/deploy/nginx.example.conf /etc/nginx/sites-available/buildesk
sudo nano /etc/nginx/sites-available/buildesk
# Replace: server_name, ssl_certificate paths (after certbot), root path
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
cd /var/www/buildesk
git pull
npm ci
npm run build
pm2 restart buildesk-api
```

---

## 13. Backups (SQLite)

```bash
# Example nightly cron — copy DB off-server
0 3 * * * cp /var/www/buildesk/data/app.db /backup/buildesk-$(date +\%Y\%m\%d).db
```

---

## 14. Troubleshooting

| Issue | Check |
| ----- | ----- |
| 502 Bad Gateway | `pm2 logs buildesk-api`, `curl http://127.0.0.1:4000/api/health` |
| API works, UI blank | `root` in Nginx must point to `.../dist`, `index.html` exists |
| CORS errors | `VITE_API_BASE_URL` must match how the browser calls the API (same origin = use domain URL) |
| WAHA / n8n | Automation uses external URLs from **Automation settings** in the app; ensure VPS can reach those hosts |

---

## Alternative: Docker API only

If you only run the API in Docker:

```bash
cd /var/www/buildesk
docker compose up -d --build
```

Nginx still serves `dist/` and proxies `/api` to `http://127.0.0.1:4000`. The provided `Dockerfile` does not include the Vite build — use PM2 + Nginx for the full stack unless you add a multi-stage Dockerfile.

---

## Checklist

- [ ] DNS A record → VPS IP
- [ ] Node 20, `npm ci` + `npm run build`
- [ ] `data/` directory writable; `SQLITE_PATH` set for PM2
- [ ] PM2 runs `node server/index.js`
- [ ] Nginx `root` = `dist`, `location /api` → `127.0.0.1:4000`
- [ ] Certbot SSL
- [ ] UFW: 22, 80, 443
- [ ] `VITE_API_BASE_URL=https://yourdomain.com` before build (or adjust client)
