/**
 * PM2 ecosystem — copy to project root as ecosystem.config.cjs and adjust.
 * Layout: /var/www/buildesk/Dashboard-Hub/ = app (this cwd), /var/www/buildesk/data/ = SQLite.
 * Hostinger-style layout (example): cwd: "/home/buildesk-api/htdocs/api.buildesk.ae"
 *   (must be the **parent** of `server/`, NOT the `server/` folder itself.)
 *
 * **Do not** set `exec cwd` to `.../server` while pointing `script` at `.../server/index.js` — you can
 * end up with a mismatch vs what you `curl` on :4000 if another Node (e.g. hPanel “Node.js” app) is
 * bound to the same port, or PM2 is not the process you think. Prefer:
 *   cwd: "/home/buildesk-api/htdocs/api.buildesk.ae"
 *   script: "server/index.js"
 *
 * Usage: pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: "buildesk-api",
      cwd: "/var/www/buildesk/Dashboard-Hub",
      script: "server/index.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        SQLITE_PATH: "/var/www/buildesk/data/app.db",
      },
    },
  ],
};
