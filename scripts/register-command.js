/**
 * Safe Command Registration — 替代 sed 注入
 *
 * Usage: node scripts/register-command.js <cmd> <handlerFile> [aliases...]
 *
 * Example:
 *   node scripts/register-command.js "/底座" "../commands/foundation-command" "/foundation" "/基建"
 *
 * This reads command-center.js, safely inserts the registration line,
 * and verifies syntax after modification.
 */

const fs = require("fs");
const path = require("path");

const CENTER = path.join(__dirname, "..", "apps", "wecom-adapter", "src", "lib", "command-center.js");

const cmd = process.argv[2];
const handler = process.argv[3];
const aliases = process.argv.slice(4);

if (!cmd || !handler) {
  console.error("Usage: node scripts/register-command.js <cmd> <handlerFile> [aliases...]");
  process.exit(1);
}

// Read current file
let content = fs.readFileSync(CENTER, "utf8");
let lines = content.split("\n");

// Find insertion point — after the last command registration line
// Look for the last line matching: '  '/<cmd>': { file: ...
let insertIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^\s*'\/[^']+':\s*\{\s*file:/.test(lines[i])) {
    insertIdx = i;
  }
}

if (insertIdx === -1) {
  console.error("Could not find insertion point in command-center.js");
  process.exit(1);
}

// Build the registration line
let aliasStr = aliases.length > 0
  ? aliases.map(a => `'${a}'`).join(", ")
  : "";
let line = `  '${cmd}':     { file: '${handler}', aliases: [${aliasStr}] },`;

// Insert after the last found command line
lines.splice(insertIdx + 1, 0, line);

// Write
fs.writeFileSync(CENTER, lines.join("\n"), "utf8");

// Syntax check
try {
  require("child_process").execSync(`node --check "${CENTER}"`, { stdio: "pipe" });
  console.log(`✅ Registered ${cmd} → ${handler} (aliases: ${aliasStr || "none"})`);
  console.log("   command-center.js syntax OK");
} catch (e) {
  console.error(`❌ Syntax error after registration! Rolling back...`);
  // Restore original
  fs.writeFileSync(CENTER, content, "utf8");
  console.error("   Original file restored. No changes made.");
  process.exit(1);
}
