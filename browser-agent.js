const fs = require("fs");
const path = require("path");

class BrowserAgent {
  async openUrl(userId, url) {
    return `BrowserAgent 已接收打开请求\n用户：${userId}\nURL：${url}`;
  }

  async screenshot(userId) {
    const reportsDir = path.join(__dirname, "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const file = path.join(reportsDir, `browser-shot-${Date.now()}.txt`);
    fs.writeFileSync(file, `screenshot placeholder for ${userId}\n`, "utf8");

    return `截图已生成：${file}`;
  }
}

module.exports = new BrowserAgent();
