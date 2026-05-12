const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const SCREENSHOT_DIR = "/opt/wecom-openclaw/screenshots";

class BrowserAgent {
  constructor() {
    this.browserContext = null;
    this.page = null;
  }

  async ensureBrowser() {
    if (this.browserContext) return;

    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

    this.browserContext = await chromium.launchPersistentContext(
      path.join(SCREENSHOT_DIR, ".browser-profile"),
      {
        headless: true,
        viewport: { width: 1440, height: 900 },
      }
    );

    const pages = this.browserContext.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browserContext.newPage();
  }

  async openUrl(userId, url) {
    try {
      await this.ensureBrowser();
      await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      return `BrowserAgent 已接收打开请求\n用户：${userId}\nURL：${url}`;
    } catch (error) {
      return `BrowserAgent 打开失败：${error.message}`;
    }
  }

  async screenshot(userId) {
    try {
      await this.ensureBrowser();
      const file = path.join(SCREENSHOT_DIR, `browser-shot-${Date.now()}.png`);
      await this.page.screenshot({ path: file, fullPage: true });
      return `截图已生成\n用户：${userId}\n文件：${file}`;
    } catch (error) {
      return `截图失败：${error.message}`;
    }
  }

  async status() {
    const alive = Boolean(this.browserContext && this.page && !this.page.isClosed());
    if (!alive) {
      return "Browser 状态\n存活：否\n当前URL：无\n页面标题：无";
    }

    let title = "";
    try {
      title = await this.page.title();
    } catch (error) {
      title = `获取失败：${error.message}`;
    }

    return `Browser 状态\n存活：是\n当前URL：${this.page.url()}\n页面标题：${title || "(空)"}`;
  }
}

module.exports = new BrowserAgent();
