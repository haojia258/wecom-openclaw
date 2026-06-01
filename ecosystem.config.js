module.exports = {
  apps: [
    {
      name: "wecom-adapter",
      script: "apps/wecom-adapter/src/index.js",
      cwd: "/opt/wecom-openclaw",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production", REVIEW_ONLY: "true" },
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    },
    {
      name: "web-console",
      script: "apps/web-console/server.js",
      cwd: "/opt/wecom-openclaw",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: { NODE_ENV: "production", WEB_CONSOLE_PORT: "3199", REVIEW_ONLY: "true" }
    }
  ]
};
