require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const xml2js = require("xml2js");
const { execFile, exec } = require("child_process");
const util = require("util");
const browserAgent = require("./browser-agent");

const execFileAsync = util.promisify(execFile);
const app = express();
app.use(express.text({ type: "*/*" }));

const PORT = process.env.PORT || 3001;
const TOKEN = (process.env.WECOM_TOKEN || "").trim();
const AES_KEY = (process.env.WECOM_AES_KEY || "").trim();
const CORP_ID = (process.env.WECOM_CORP_ID || "").trim();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

const BASE_DIR = __dirname;
const LOG_DIR = path.join(BASE_DIR, "logs");
const REPORT_DIR = path.join(BASE_DIR, "reports");
const TASK_LOG_FILE = path.join(LOG_DIR, "tasks.jsonl");

const taskQueue = [];
let queueRunning = false;

const HELP_TEXT = `可用指令：
/帮助 - 查看指令
/状态 - 查看机器人状态
/日志 - 查看最近任务日志
/任务 查询服务器状态
/任务 查看 docker
/任务 查看 pm2
/任务 生成今日运营日报
/任务 内容 - 创建自动化任务`;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureRuntimePaths() {
  ensureDir(LOG_DIR);
  ensureDir(REPORT_DIR);
}

function sha1(...args) {
  return crypto
    .createHash("sha1")
    .update(args.map(v => String(v ?? "")).sort().join(""))
    .digest("hex");
}

function getMsgSignature(query) {
  return String(query.msg_signature || query.signature || "").trim();
}

function getAesKey() {
  return Buffer.from(AES_KEY + "=", "base64");
}

function pkcs7Unpad(buf) {
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

function pkcs7Pad(buf) {
  const blockSize = 32;
  const pad = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}

function decrypt(encrypted) {
  const key = getAesKey();
  const iv = key.subarray(0, 16);

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(encrypted).trim(), "base64")),
    decipher.final(),
  ]);

  const plain = pkcs7Unpad(decrypted);
  const msgLen = plain.readUInt32BE(16);
  return plain.subarray(20, 20 + msgLen).toString();
}

function encrypt(xml) {
  const key = getAesKey();
  const iv = key.subarray(0, 16);

  const random = crypto.randomBytes(16);
  const msg = Buffer.from(xml);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(msg.length, 0);

  const raw = Buffer.concat([random, len, msg, Buffer.from(CORP_ID)]);
  const padded = pkcs7Pad(raw);

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);

  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64");
}

function runLinuxCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve(`命令执行失败:\n${stderr || err.message}`);
      }
      resolve((stdout || stderr || "无输出").slice(0, 4000));
    });
  });
}

function writeTaskLog(userId, task, result, status = "ok") {
  ensureRuntimePaths();
  const line = JSON.stringify({
    time: new Date().toISOString(),
    status,
    userId,
    task,
    result: String(result || "").slice(0, 1500),
  }) + "\n";
  fs.appendFileSync(TASK_LOG_FILE, line);
}

async function saveMarkdownReport(name, content) {
  ensureRuntimePaths();
  const filename = `${Date.now()}-${name.replace(/[^\w\u4e00-\u9fa5]/g, "_")}.md`;
  const filepath = path.join(REPORT_DIR, filename);
  fs.writeFileSync(filepath, content, "utf8");
  return filepath;
}

async function askOpenClaw(message) {
  try {
    const payload = JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: "你是 OpenClaw 企业运营 AI 助手。回答要简洁、专业、可执行。" },
        { role: "user", content: message },
      ],
    });

    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "--connect-timeout", "5",
      "--max-time", "18",
      "-x", process.env.HTTPS_PROXY || "http://127.0.0.1:8118",
      "https://api.openai.com/v1/chat/completions",
      "-H", `Authorization: Bearer ${process.env.OPENAI_API_KEY}`,
      "-H", "Content-Type: application/json",
      "-d", payload,
    ]);

    const data = JSON.parse(stdout);
    return data.choices?.[0]?.message?.content || data.error?.message || "AI无回复";
  } catch (e) {
    console.error("OpenAI curl error:", e.message);
    return "AI调用超时，请稍后重试";
  }
}

function normalizeTask(task) {
  const value = task.toLowerCase();
  if (task.includes("查询服务器状态") || task.includes("服务器状态")) return "server";
  if (task.includes("查看 docker") || value.includes("docker")) return "docker";
  if (task.includes("查看 pm2") || value.includes("pm2")) return "pm2";
  if (task.includes("生成今日运营日报") || task.includes("日报")) return "daily-report";
  return "ai";
}

async function handleTask(task, userId) {
  const kind = normalizeTask(task);

  if (kind === "server") {
    return runLinuxCommand("uptime && free -h && df -h");
  }
  if (kind === "docker") {
    return runLinuxCommand("docker ps");
  }
  if (kind === "pm2") {
    return runLinuxCommand("pm2 status");
  }
  if (kind === "daily-report") {
    const prompt = `你是企业运营AI。请生成一份今天的运营日报，包含：\n1. 今日工作\n2. 数据情况\n3. 问题\n4. 明日计划\n输出 Markdown 格式。`;
    const result = await askOpenClaw(prompt);
    const file = await saveMarkdownReport("今日运营日报", result);
    return `日报已生成：\n${file}\n\n内容预览：\n${result.slice(0, 500)}`;
  }

  const prompt = `你是 OpenClaw 企业运营 AI。请把下面任务拆成可执行步骤：\n${task}`;
  return askOpenClaw(prompt);
}

function enqueueTask(task, userId) {
  return new Promise((resolve) => {
    const job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      task,
      userId,
      resolve,
    };
    taskQueue.push(job);
    processTaskQueue();
  });
}

async function processTaskQueue() {
  if (queueRunning) return;
  queueRunning = true;

  while (taskQueue.length > 0) {
    const job = taskQueue.shift();
    if (!job) break;

    try {
      const result = await handleTask(job.task, job.userId);
      writeTaskLog(job.userId, job.task, result, "ok");
      job.resolve(result);
    } catch (error) {
      const message = `任务执行失败：${error.message}`;
      writeTaskLog(job.userId, job.task, message, "error");
      job.resolve(message);
    }
  }

  queueRunning = false;
}

async function routeMessage(content, userId) {
  const text = String(content || "").trim();

  if (!text) return "我收到了一条空消息。";

  console.log("RAW TEXT:", JSON.stringify(text));

  if (text.startsWith("/浏览器")) {
    if (text === "/浏览器 状态") {
      return browserAgent.status();
    }

    const cleaned = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const urlMatch = cleaned.match(/https?:\/\/\S+/i);
    const url = urlMatch ? urlMatch[0] : "";

    if (url) {
      console.log("Browser command matched:", url);
      return browserAgent.openUrl(userId, url);
    }

    return "请使用 /浏览器 打开 https://example.com";
  }

  if (text === "/截图") {
    console.log("Browser command matched:", "screenshot");
    return browserAgent.screenshot(userId);
  }

  if (text === "/帮助" || text.toLowerCase() === "/help") return HELP_TEXT;

  if (text === "/状态") {
    return `系统正常运行\n队列长度：${taskQueue.length}\n任务日志：${TASK_LOG_FILE}\nAI模型：${OPENAI_MODEL}\n用户：${userId}`;
  }

  if (text === "/日志") {
    if (!fs.existsSync(TASK_LOG_FILE)) {
      return "暂无任务日志。";
    }
    return runLinuxCommand(`tail -n 8 ${TASK_LOG_FILE}`);
  }

  if (text.startsWith("/任务")) {
    const task = text.replace(/^\/任务\s*/, "").trim();
    if (!task) {
      return "请在 /任务 后输入内容，例如：/任务 生成今日运营日报";
    }
    return enqueueTask(task, userId);
  }

  return askOpenClaw(text);
}

app.get("/", (req, res) => {
  res.send("wecom-openclaw ok");
});

app.get("/wecom/callback", (req, res) => {
  try {
    const { timestamp, nonce, echostr } = req.query;
    const msgSignature = getMsgSignature(req.query);
    const sign = sha1(TOKEN, timestamp, nonce, echostr);

    if (sign !== msgSignature) {
      return res.status(403).send("signature error");
    }

    const plain = decrypt(echostr);
    return res.send(plain);
  } catch (e) {
    console.error("verify error:", e);
    return res.status(500).send("error");
  }
});

app.post("/wecom/callback", async (req, res) => {
  try {
    const { timestamp, nonce } = req.query;
    const msgSignature = getMsgSignature(req.query);

    const parsedOuter = await xml2js.parseStringPromise(req.body, {
      explicitArray: false,
      trim: true,
    });

    let encrypted = parsedOuter?.xml?.Encrypt;
    if (typeof encrypted === "object" && encrypted._) encrypted = encrypted._;
    encrypted = String(encrypted || "");

    const sign = sha1(TOKEN, timestamp, nonce, encrypted);
    if (sign !== msgSignature) {
      return res.status(403).send("signature error");
    }

    const decryptedXml = decrypt(encrypted);
    const parsed = await xml2js.parseStringPromise(decryptedXml, {
      explicitArray: false,
      trim: true,
    });

    const msg = parsed.xml;
    const fromUser = msg.FromUserName;
    const toUser = msg.ToUserName;
    const content = msg.Content || "";

    const replyText = await routeMessage(content, fromUser);

    const replyXml = `<xml>\n<ToUserName><![CDATA[${fromUser}]]></ToUserName>\n<FromUserName><![CDATA[${toUser}]]></FromUserName>\n<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>\n<MsgType><![CDATA[text]]></MsgType>\n<Content><![CDATA[${replyText}]]></Content>\n</xml>`;

    const encryptedReply = encrypt(replyXml);
    const ts = Math.floor(Date.now() / 1000).toString();
    const newNonce = Math.random().toString(36).slice(2);
    const replySign = sha1(TOKEN, ts, newNonce, encryptedReply);

    const finalXml = `<xml>\n<Encrypt><![CDATA[${encryptedReply}]]></Encrypt>\n<MsgSignature><![CDATA[${replySign}]]></MsgSignature>\n<TimeStamp>${ts}</TimeStamp>\n<Nonce><![CDATA[${newNonce}]]></Nonce>\n</xml>`;

    return res.type("application/xml").send(finalXml);
  } catch (e) {
    console.error("message error:", e);
    return res.send("success");
  }
});

ensureRuntimePaths();
app.listen(PORT, () => {
  console.log(`wecom-openclaw running ${PORT}`);
});
