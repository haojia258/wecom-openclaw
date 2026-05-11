module.exports = {
  apps: [
    {
      name: "wecom-openclaw",
      script: "app.js",
      cwd: "/opt/wecom-openclaw",
      env: {
        PORT: "3001",
        OPENCLAW_URL: "http://127.0.0.1:18789",
        WECOM_TOKEN: "openclaw123",
        WECOM_AES_KEY: "MztjE4hEwftpfHvxcAwgG764kHsobGbYKjl3nbqACtL",
        WECOM_CORP_ID: "wwb5c359f492d2b26b"
      }
    }
  ]
}