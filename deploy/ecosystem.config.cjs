/**
 * PM2 ecosystem — copy to project root as ecosystem.config.cjs and adjust.
 * Layout: /var/www/buildesk/Dashboard-Hub/ = app (this cwd), /var/www/buildesk/data/ = SQLite.
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
