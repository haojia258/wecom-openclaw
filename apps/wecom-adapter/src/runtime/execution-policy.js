'use strict';

/**
 * execution-policy.js - 受控执行策略 (P8.1)
 *
 * 定义 OpenClaw OS v2 第一次允许 AI 真正执行动作的安全边界。
 *
 * 设计原则:
 *   - 仅允许 staging-safe 命令
 *   - 默认 deny（最小权限原则）
 *   - allow 白名单优先于 deny
 *   - 所有命令必须经过 whitelist mapping，不允许任意 shell
 */

// ─── 允许的命令模式 ─────────────────────────────────────────────

/** @type {Array<{pattern: RegExp|string, category: string, description: string}>} */
const ALLOW_COMMANDS = [
  // npm test 安全
  {
    pattern: /^npm\s+(run\s+)?test(?::\S+)?/,
    category: 'test',
    description: 'npm test (包括所有 test: 子命令)'
  },

  // curl health check（仅本地回环）
  {
    pattern: /^curl\s+.*http:\/\/127\.0\.0\.1:\d+/,
    category: 'health-check',
    description: 'curl 本地 health check'
  },

  // staging PM2 start（仅 shadow 实例）
  {
    pattern: /^pm2\s+start\s+.*shadow/i,
    category: 'staging-pm2',
    description: 'PM2 启动 staging/shadow 实例'
  },

  // staging PM2 delete（仅 shadow 实例）
  {
    pattern: /^pm2\s+delete\s+.*shadow/i,
    category: 'staging-pm2',
    description: 'PM2 删除 staging/shadow 实例'
  },

  // staging PM2 stop（仅 shadow 实例）
  {
    pattern: /^pm2\s+stop\s+.*shadow/i,
    category: 'staging-pm2',
    description: 'PM2 停止 staging/shadow 实例'
  },

  // PM2 status（只读）
  {
    pattern: /^pm2\s+status/,
    category: 'readonly-audit',
    description: 'PM2 状态查询（只读）'
  },

  // PM2 list（只读）
  {
    pattern: /^pm2\s+list/,
    category: 'readonly-audit',
    description: 'PM2 进程列表（只读）'
  },

  // PM2 jlist（只读）
  {
    pattern: /^pm2\s+jlist/,
    category: 'readonly-audit',
    description: 'PM2 JSON 列表（只读）'
  },

  // PM2 logs（只读）
  {
    pattern: /^pm2\s+logs/,
    category: 'readonly-audit',
    description: 'PM2 日志查看（只读）'
  },

  // PM2 describe（只读）
  {
    pattern: /^pm2\s+describe/,
    category: 'readonly-audit',
    description: 'PM2 进程详情（只读）'
  },

  // node 健康检查脚本
  {
    pattern: /^node\s+health-check\.js/,
    category: 'health-check',
    description: 'Node 健康检查脚本'
  },

  // 系统只读查询
  {
    pattern: /^df\s+-h/,
    category: 'readonly-audit',
    description: '磁盘使用查询（只读）'
  },
  {
    pattern: /^free\s+-m/,
    category: 'readonly-audit',
    description: '内存使用查询（只读）'
  },
  {
    pattern: /^uptime/,
    category: 'readonly-audit',
    description: '系统 uptime 查询（只读）'
  },

  // git status（只读）
  {
    pattern: /^git\s+status/,
    category: 'readonly-audit',
    description: 'Git 状态查询（只读）'
  },

  // git log（只读）
  {
    pattern: /^git\s+log/,
    category: 'readonly-audit',
    description: 'Git 日志查询（只读）'
  },

  // git rev-parse（只读）
  {
    pattern: /^git\s+rev-parse/,
    category: 'readonly-audit',
    description: 'Git revision 查询（只读）'
  },

  // git diff（只读）
  {
    pattern: /^git\s+diff/,
    category: 'readonly-audit',
    description: 'Git diff 查询（只读）'
  },

  // SQLite 只读查询
  {
    pattern: /^sqlite3\s+.*\.db\s+(\.tables|SELECT|\.schema)/i,
    category: 'readonly-db',
    description: 'SQLite 只读查询'
  },

  // npm 审计（只读）
  {
    pattern: /^npm\s+audit/,
    category: 'readonly-audit',
    description: 'npm 安全审计（只读）'
  },

  // npm list（只读）
  {
    pattern: /^npm\s+(list|ls)/,
    category: 'readonly-audit',
    description: 'npm 包列表（只读）'
  }
];

// ─── 禁止的命令模式 ─────────────────────────────────────────────

/** @type {Array<{pattern: RegExp, category: string, description: string}>} */
const DENY_COMMANDS = [
  {
    pattern: /^pm2\s+restart\s+wecom-adapter/,
    category: 'production-deploy',
    description: '禁止重启生产 wecom-adapter'
  },
  {
    pattern: /^nginx\s+(reload|restart|start|stop)/,
    category: 'production-deploy',
    description: '禁止操作 nginx'
  },
  {
    pattern: /^docker\s+compose\s+up/,
    category: 'production-deploy',
    description: '禁止 docker compose 启动'
  },
  {
    pattern: /^git\s+push\s+(origin\s+)?main/,
    category: 'production-deploy',
    description: '禁止 push main 分支'
  },
  {
    pattern: /^git\s+push\s+(origin\s+)?master/,
    category: 'production-deploy',
    description: '禁止 push master 分支'
  },
  {
    pattern: /^sudo/,
    category: 'dangerous-operation',
    description: '禁止 sudo'
  },
  {
    pattern: /(^|\s)rm\s+(-\S+\s+)*.*(\/|\*)/,
    category: 'dangerous-operation',
    description: '禁止 rm 危险删除'
  },
  {
    pattern: /rm\s+-rf/,
    category: 'dangerous-operation',
    description: '禁止 rm -rf'
  },
  {
    pattern: /^kill/,
    category: 'dangerous-operation',
    description: '禁止 kill 进程'
  },
  {
    pattern: /^chmod/,
    category: 'dangerous-operation',
    description: '禁止 chmod'
  },
  {
    pattern: /^chown/,
    category: 'dangerous-operation',
    description: '禁止 chown'
  },
  {
    pattern: /\.env/,
    category: 'production-deploy',
    description: '禁止修改 .env'
  },
  {
    pattern: /deploy-production/,
    category: 'production-deploy',
    description: '禁止 production deploy'
  },
  {
    pattern: /pm2\s+restart/,
    category: 'production-deploy',
    description: '禁止 PM2 restart（含任何进程）'
  },
  {
    pattern: /^shutdown/,
    category: 'dangerous-operation',
    description: '禁止 shutdown'
  },
  {
    pattern: /^reboot/,
    category: 'dangerous-operation',
    description: '禁止 reboot'
  },
  {
    pattern: /\|.*curl.*\|.*sh/,
    category: 'dangerous-operation',
    description: '禁止 shell pipe download-exec'
  },
  {
    pattern: /\|.*wget.*\|.*sh/,
    category: 'dangerous-operation',
    description: '禁止 shell pipe download-exec'
  },
  {
    pattern: />\s*\/etc\//,
    category: 'dangerous-operation',
    description: '禁止写入 /etc/'
  },
  {
    pattern: /\/proc\//,
    category: 'dangerous-operation',
    description: '禁止访问 /proc/'
  }
];

// ─── Execution actions（逻辑操作分类） ─────────────────────────────

/**
 * 逻辑操作分类（不直接映射 shell 命令，而是业务语义）。
 * 用于 Runtime RBAC 的二层检查。
 */

/** @type {Object.<string, {allowed: boolean, reason?: string}>} */
const EXECUTION_ACTIONS = {
  // staging-safe
  'npm-test':             { allowed: true,  reason: 'staging-safe' },
  'curl-health':          { allowed: true,  reason: 'staging-safe' },
  'staging-pm2-start':    { allowed: true,  reason: 'staging-safe' },
  'staging-pm2-delete':   { allowed: true,  reason: 'staging-safe' },
  'pm2-status':           { allowed: true,  reason: 'readonly' },
  'pm2-logs':             { allowed: true,  reason: 'readonly' },
  'readonly-audit':       { allowed: true,  reason: 'readonly' },
  'readonly-db':          { allowed: true,  reason: 'readonly' },
  'git-status':           { allowed: true,  reason: 'readonly' },

  // staging plan-only
  'dag-dry-run':          { allowed: true,  reason: 'staging-safe' },
  'rollout-dry-run':      { allowed: true,  reason: 'staging-safe' },
  'shadow-validation':    { allowed: true,  reason: 'staging-safe' },

  // denied
  'production-deploy':    { allowed: false, reason: 'production-deploy-blocked' },
  'production-restart':   { allowed: false, reason: 'production-restart-blocked' },
  'modify-env':           { allowed: false, reason: 'modify-env-blocked' },
  'modify-nginx':         { allowed: false, reason: 'modify-nginx-blocked' },
  'dangerous-operation':  { allowed: false, reason: 'dangerous-operation-blocked' },
  'arbitrary-shell':      { allowed: false, reason: 'arbitrary-shell-blocked' },
  'git-push-main':        { allowed: false, reason: 'git-push-main-blocked' }
};

// ─── 公共 API ──────────────────────────────────────────────────

/**
 * 根据命令字符串匹配策略，返回是否允许以及分类
 *
 * @param {string} command - 要检查的 shell 命令
 * @returns {{ allowed: boolean, category: string, reason: string }}
 */
function checkCommand(command) {
  if (!command || typeof command !== 'string') {
    return { allowed: false, category: 'invalid', reason: '空命令或非字符串' };
  }

  var trimmed = command.trim();

  // 1. 先检查 deny（高优先级）
  for (var i = 0; i < DENY_COMMANDS.length; i++) {
    var denyRule = DENY_COMMANDS[i];
    if (denyRule.pattern.test(trimmed)) {
      return {
        allowed: false,
        category: denyRule.category,
        reason: denyRule.description
      };
    }
  }

  // 2. 检查 allow（白名单）
  for (var j = 0; j < ALLOW_COMMANDS.length; j++) {
    var allowRule = ALLOW_COMMANDS[j];
    if (allowRule.pattern.test(trimmed)) {
      return {
        allowed: true,
        category: allowRule.category,
        reason: allowRule.description
      };
    }
  }

  // 3. 默认拒绝（不在白名单）
  return {
    allowed: false,
    category: 'not-in-allow-list',
    reason: '命令不在允许的白名单中'
  };
}

/**
 * 检查逻辑操作是否被允许
 *
 * @param {string} action - 逻辑操作名称（如 'npm-test', 'production-deploy'）
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkAction(action) {
  if (!action) {
    return { allowed: false, reason: '空操作名称' };
  }

  var normalized = action.toLowerCase().trim();
  var rule = EXECUTION_ACTIONS[normalized];

  if (!rule) {
    return { allowed: false, reason: '未知操作: "' + action + '"' };
  }

  return { allowed: rule.allowed, reason: rule.reason };
}

/**
 * 获取所有允许的逻辑操作列表
 *
 * @returns {string[]}
 */
function getAllowedActions() {
  return Object.keys(EXECUTION_ACTIONS)
    .filter(function(key) { return EXECUTION_ACTIONS[key].allowed; });
}

/**
 * 获取所有禁止的逻辑操作列表
 *
 * @returns {string[]}
 */
function getDeniedActions() {
  return Object.keys(EXECUTION_ACTIONS)
    .filter(function(key) { return !EXECUTION_ACTIONS[key].allowed; });
}

module.exports = {
  ALLOW_COMMANDS,
  DENY_COMMANDS,
  EXECUTION_ACTIONS,
  checkCommand,
  checkAction,
  getAllowedActions,
  getDeniedActions
};
