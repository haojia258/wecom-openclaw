require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const crypto = require("crypto");
const xml2js = require("xml2js");
const OpenAI = require("openai");
const { execFile } = require("child_process");
const { exec } = require("child_process");
const util = require("util");
const execFileAsync = util.promisify(execFile);
const sessions = new Map();
const app = express();
app.use(express.text({ type: "*/*" }));

const PORT = process.env.PORT || 3001;
const TOKEN = (process.env.WECOM_TOKEN || "").trim();
const AES_KEY = (process.env.WECOM_AES_KEY || "").trim();
const CORP_ID = (process.env.WECOM_CORP_ID || "").trim();
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const HELP_TEXT = `可用指令：
/帮助 - 查看指令
/状态 - 查看机器人状态
/日志 - 查看最近任务日志
/任务 内容 - 创建一个自动化任务

示例：
/任务 生成今天抖音店铺运营计划`;

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

app.get("/", (req, res) => {
  res.send("wecom-openclaw ok");
});

// ✅ 已修复：正确语法
app.get("/wecom/callback", (req, res) => {
  try {
    const { timestamp, nonce, echostr } = req.query;
    const msgSignature = getMsgSignature(req.query);

    const sign = sha1(TOKEN, timestamp, nonce, echostr);

    console.log("GET query:", req.query);
    console.log("GET calc sign:", sign);
    console.log("GET recv sign:", msgSignature);

    if (sign !== msgSignature) {
      return res.status(403).send("signature error");
    }

    const plain = decrypt(echostr);
    res.send(plain);
  } catch (e) {
    console.error("verify error:", e);
    res.status(500).send("error");
  }
});

// ✅ 已修复：正确语法
app.post("/wecom/callback", async (req, res) => {
  try {
    const { timestamp, nonce } = req.query;
    const msgSignature = getMsgSignature(req.query);

    console.log("POST query:", req.query);
    console.log("POST body:", req.body.slice(0, 500));

    const parsedOuter = await xml2js.parseStringPromise(req.body, {
      explicitArray: false,
      trim: true,
    });

    let encrypted = parsedOuter?.xml?.Encrypt;

    if (typeof encrypted === "object" && encrypted._) {
      encrypted = encrypted._;
    }

    encrypted = String(encrypted || "");

    const sign = sha1(TOKEN, timestamp, nonce, encrypted);

    console.log("POST encrypted length:", encrypted.length);
    console.log("POST calc sign:", sign);
    console.log("POST recv sign:", msgSignature);

    if (sign !== msgSignature) {
      console.error("post signature mismatch");
      return res.status(403).send("signature error");
    }

    const decryptedXml = decrypt(encrypted);
    console.log("decrypted xml:", decryptedXml.slice(0, 500));

    const parsed = await xml2js.parseStringPromise(decryptedXml, {
      explicitArray: false,
      trim: true,
    });

    const msg = parsed.xml;
    const fromUser = msg.FromUserName;
    const toUser = msg.ToUserName;
    const content = msg.Content || "";

    console.log("收到企业微信消息:", content);

    const replyText = await routeMessage(content, fromUser);

    const replyXml = `<xml>
<ToUserName><![CDATA[${fromUser}]]></ToUserName>
<FromUserName><![CDATA[${toUser}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${replyText}]]></Content>
</xml>`;

    const encryptedReply = encrypt(replyXml);
    const ts = Math.floor(Date.now() / 1000).toString();
    const newNonce = Math.random().toString(36).slice(2);
    const replySign = sha1(TOKEN, ts, newNonce, encryptedReply);

    const finalXml = `<xml>
<Encrypt><![CDATA[${encryptedReply}]]></Encrypt>
<MsgSignature><![CDATA[${replySign}]]></MsgSignature>
<TimeStamp>${ts}</TimeStamp>
<Nonce><![CDATA[${newNonce}]]></Nonce>
</xml>`;

    res.type("application/xml").send(finalXml);
  } catch (e) {
    console.error("message error:", e);
    res.send("success");
  }
});

async function routeMessage(content, userId) {
  const text = String(content || "").trim();

  if (!text) {
    return "我收到了一条空消息。";
  }

  if (text === "/帮助" || text.toLowerCase() === "/help") {
    return HELP_TEXT;
  }

  if (text === "/状态") {
    return `系统正常运行。
企业微信网关：OK
AI模型：${process.env.OPENAI_MODEL || "gpt-5.5"}
用户：${userId}`;
  }

  if (text === "/日志") {
    return await runLinuxCommand("tail -n 5 /opt/wecom-openclaw/logs/tasks.jsonl");
  }

  if (text.startsWith("/任务")) {
    const task = text.replace(/^\/任务\s*/, "").trim();

    if (!task) {
      return "请在 /任务 后面输入任务内容，例如：/任务 生成今天抖音店铺运营计划";
    }

    return await handleTask(task, userId);
  }

  return await askOpenClaw(text);
}

async function runLinuxCommand(command) {
  return new Promise((resolve) => {
    exec(command, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        return resolve(`命令执行失败:\n${stderr || err.message}`);
      }

      resolve((stdout || stderr || "无输出").slice(0, 4000));
    });
  });
}

function writeTaskLog(userId, task, result) {  
  const line = JSON.stringify({    
    time: new Date().toISOString(),    
    userId,    
    task,    
    result: String(result || "").slice(0, 1000)  
  }) + "\n";  
  fs.appendFileSync("/opt/wecom-openclaw/logs/tasks.jsonl", line);
}

async function saveMarkdownReport(name, content) {
  const dir = "/opt/wecom-openclaw/reports";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filename =
    Date.now() + "-" + name.replace(/[^\w\u4e00-\u9fa5]/g, "_") + ".md";

  const filepath = path.join(dir, filename);

  fs.writeFileSync(filepath, content);

  return filepath;
}

async function handleTask(task, userId) {
  const adminUsers = (process.env.ADMIN_USERS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  const isAdmin = adminUsers.includes(userId);

  if (!isAdmin && (
    task.includes("服务器状态") ||
    task.toLowerCase().includes("docker") ||
    task.toLowerCase().includes("pm2")
  )) {
    return "你没有权限执行服务器管理任务。";
  }

  console.log("收到任务:", { userId, task });

  // ===== Linux系统任务 =====

  if (task.includes("服务器状态")) {
    const result = await runLinuxCommand("uptime && free -h && df -h");
    writeTaskLog(userId, task, result);
    return result;
  }

  if (task.includes("docker")) {
    const result = await runLinuxCommand("docker ps");
    writeTaskLog(userId, task, result);
    return result;
  }

  if (task.includes("pm2")) {
    const result = await runLinuxCommand("pm2 status");
    writeTaskLog(userId, task, result);
    return result;
  }

  if (task.includes("日报")) {
    const prompt = `
你是企业运营AI。

请生成一份完整的企业运营日报。

包含：
1. 今日工作
2. 数据情况
3. 问题
4. 明日计划

输出 Markdown 格式。
`;

    const result = await askOpenClaw(prompt);

    const file = await saveMarkdownReport("运营日报", result);

    writeTaskLog(userId, task, file);

    return `日报已生成。

文件：
${file}

内容预览：
${result.slice(0, 500)}`;
  }

  // ===== AI任务 =====

  const prompt = `
你是 OpenClaw 企业运营 AI。

请把下面任务拆成可执行步骤。

任务：
${task}
`;

  const result = await askOpenClaw(prompt);
  writeTaskLog(userId, task, result);
  return result;
}

async function askOpenClaw(message) {
  try {
    const payload = JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.5",
      messages: [
        { role: "system", content: "你是 OpenClaw 企业运营 AI 助手。\n你负责：\n- 电商运营\n- 抖音店铺\n- 数据分析\n- 文案生成\n- 企业知识库\n- 自动办公\n回答要简洁、专业、可执行。" },
        { role: "user", content: message }
      ]
    });

    const { stdout } = await execFileAsync("curl", [
      "-sS",
      "--connect-timeout", "5",
      "--max-time", "12",
      "-x", process.env.HTTPS_PROXY || "http://127.0.0.1:8118",
      "https://api.openai.com/v1/chat/completions",
      "-H", `Authorization: Bearer ${process.env.OPENAI_API_KEY}`,
      "-H", "Content-Type: application/json",
      "-d", payload
    ]);

    const data = JSON.parse(stdout);
    return data.choices?.[0]?.message?.content || data.error?.message || "AI无回复";
  } catch (e) {
    console.error("OpenAI curl error:", e.message);
    return "AI调用超时，请稍后重试";
  }
}

app.listen(PORT, () => {
  console.log(`wecom-openclaw running ${PORT}`);
});