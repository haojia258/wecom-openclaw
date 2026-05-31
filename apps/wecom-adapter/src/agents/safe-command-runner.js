'use strict';

/**
 * safe-command-runner.js - Sandboxed read-only command executor
 *
 * Security model:
 * 1. Blocklist checked FIRST (catches dangerous patterns in any position)
 * 2. Whitelist checked SECOND (command must match from start)
 * 3. Execution: child_process.exec with timeout (10s) and maxBuffer (1MB)
 *
 * Only read-only, non-destructive system commands are allowed.
 */

const { exec } = require('child_process');

var ALLOWED_COMMANDS = [
  { pattern: /^pm2\s+status(\s|$)/,       description: 'pm2 status - process list' },
  { pattern: /^pm2\s+list(\s|$)/,         description: 'pm2 list - process list' },
  { pattern: /^pm2\s+jlist(\s|$)/,        description: 'pm2 jlist - JSON process list' },
  { pattern: /^pm2\s+info\s+\S+/,         description: 'pm2 info <name> - process details' },

  { pattern: /^df\s+-h(\s|$)/,            description: 'df -h - disk usage' },
  { pattern: /^free\s+-m(\s|$)/,          description: 'free -m - memory usage' },
  { pattern: /^uptime(\s|$)/,              description: 'uptime - system uptime' },
  { pattern: /^ss\s+-lntp(\s|$)/,         description: 'ss -lntp - listening ports' },
  { pattern: /^ss\s+-tlnp(\s|$)/,         description: 'ss -tlnp - listening ports (alt)' },

  { pattern: /^docker\s+ps(\s|$)/,        description: 'docker ps - container list' },
  { pattern: /^docker\s+ps\s+-a(\s|$)/,   description: 'docker ps -a - all containers' },

  { pattern: /^git\s+status(\s|$)/,       description: 'git status' },
  { pattern: /^git\s+log\s+--oneline\s+-\d+(\s|$)/, description: 'git log --oneline -N' },
  { pattern: /^git\s+log\s+--oneline(\s|$)/, description: 'git log --oneline' },
  { pattern: /^git\s+branch(\s|$)/,       description: 'git branch' },
  { pattern: /^git\s+remote\s+-v(\s|$)/,  description: 'git remote -v' },

  { pattern: /^node\s+-v(\s|$)/,          description: 'node -v' },
  { pattern: /^npm\s+-v(\s|$)/,           description: 'npm -v' },
  { pattern: /^npx\s+--version(\s|$)/,    description: 'npx --version' },

  { pattern: /^nginx\s+-t(\s|$)/,         description: 'nginx -t - config test' },
  { pattern: /^systemctl\s+status\s+\S+/, description: 'systemctl status <service>' },
];

var BLOCKED_PATTERNS = [
  /sudo/i,
  /rm\s+-/,
  /rm\s+--/,
  /kill\s+-9/,
  /pkill/i,
  /pm2\s+(restart|stop|delete|reload|kill)/i,
  /nginx\s+-s\s+(reload|stop|quit)/i,
  /git\s+(push|merge|rebase|reset|checkout\s+-b)/i,
  /\.env/i,
  /deploy/i,
  />\s*\/dev\/null/,
  /\|\s*sh\b/,
  /curl.*\|\s*bash/,
  /chmod\s+[0-7]{3,4}/i,
  /chown/i,
  /wget/i,
  /curl.*-o\b/i,
  /nc\b/,
];

var DEFAULT_TIMEOUT = 10000;
var MAX_BUFFER = 1024 * 1024;

function isCommandAllowed(cmd) {
  if (!cmd || typeof cmd !== 'string') return false;
  var trimmed = cmd.trim();
  if (!trimmed) return false;

  for (var i = 0; i < BLOCKED_PATTERNS.length; i++) {
    if (BLOCKED_PATTERNS[i].test(trimmed)) return false;
  }

  for (var j = 0; j < ALLOWED_COMMANDS.length; j++) {
    if (ALLOWED_COMMANDS[j].pattern.test(trimmed)) return true;
  }

  return false;
}

function executeCommand(cmd) {
  return new Promise(function(resolve) {
    if (!isCommandAllowed(cmd)) {
      resolve({
        success: false,
        stdout: '',
        stderr: 'Command not in whitelist or blocked by security policy',
        duration: 0,
      });
      return;
    }

    var startTime = Date.now();
    exec(cmd, { timeout: DEFAULT_TIMEOUT, maxBuffer: MAX_BUFFER }, function(error, stdout, stderr) {
      var duration = Date.now() - startTime;
      if (error) {
        resolve({
          success: false,
          stdout: stdout || '',
          stderr: stderr || error.message,
          duration: duration,
        });
      } else {
        resolve({
          success: true,
          stdout: stdout || '',
          stderr: stderr || '',
          duration: duration,
        });
      }
    });
  });
}

function getWhitelist() {
  return ALLOWED_COMMANDS.map(function(c) { return c.description; });
}

function getBlocklist() {
  return BLOCKED_PATTERNS.map(function(p) { return p.source; });
}

module.exports = {
  executeCommand: executeCommand,
  isCommandAllowed: isCommandAllowed,
  getWhitelist: getWhitelist,
  getBlocklist: getBlocklist,
  DEFAULT_TIMEOUT: DEFAULT_TIMEOUT,
};
