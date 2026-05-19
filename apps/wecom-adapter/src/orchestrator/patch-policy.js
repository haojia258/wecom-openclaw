/**
 * patch-policy.js
 * 定义 patch 允许/禁止的操作范围
 * 所有 AI 角色共享同一份 policy，防止越权操作
 */

const FORBIDDEN_SCOPES = [
  // 部署相关
  "nginx",
  "pm2",
  "deploy",
  "docker",
  "docker-compose",
  // 主链路
  "src/index.js",
  "src/lib/command-center.js",
  "src/lib/logger.js",
  "src/lib/config.js",
  // 环境变量 & 密钥
  ".env",
  ".pem",
  "deploy_key",
  // 分支保护
  "main",
  "develop",
  // 数据库 & 用户数据
  "logs/doudian/",
  "logs/ads/",
  "memory/",
]

const FORBIDDEN_PATTERNS = [
  /push.*main/i,
  /merge.*develop/i,
  /force.*push/i,
  /rm\s+-rf/i,
  /DROP\s+TABLE/i,
  /DELETE\s+FROM/i,
]

/**
 * 检查 patch 内容是否越权
 * @param {string} patchContent - patch 文件内容
 * @param {string} targetBranch - 目标分支
 * @returns {{ allowed: boolean, violations: string[] }}
 */
function validatePatch(patchContent, targetBranch) {
  const violations = []

  // 检查禁止的分支
  if (targetBranch === "main" || targetBranch === "develop") {
    violations.push(`禁止直接修改 ${targetBranch} 分支，必须通过 PR`)
  }

  // 检查禁止的文件路径
  for (const scope of FORBIDDEN_SCOPES) {
    if (patchContent.includes(scope)) {
      violations.push(`禁止修改: ${scope}`)
    }
  }

  // 检查禁止的操作模式
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(patchContent)) {
      violations.push(`禁止操作: ${pattern.source}`)
    }
  }

  return {
    allowed: violations.length === 0,
    violations,
  }
}

/**
 * 检查 AI 角色是否在职责范围内
 * @param {string} role - AI 角色名 (workbuddy|codex|deepseek|doubao)
 * @param {string[]} requestedScopes - 请求的操作范围
 * @returns {{ inScope: boolean, outOfScope: string[] }}
 */
function checkScope(role, requestedScopes) {
  const SCOPE_MAP = {
    workbuddy: [
      "orchestrator", "task-planner", "branch-planner",
      "patch-policy", "command-center", "commands/ai-scheduler",
    ],
    codex: [
      "role-registry", "review-checklist", "prompt-templates",
      "ai-planner", "task-breakdown",
    ],
    deepseek: [
      "merge-risk-policy", "risk-score", "diff-detection",
      "forbidden-file-scoring", "branch-risk",
    ],
    doubao: [
      "task-description", "copywriting", "reply-template",
      "prompt-polish", "chinese-copy",
    ],
  }

  const allowed = SCOPE_MAP[role] || []
  const outOfScope = requestedScopes.filter(s => !allowed.includes(s))

  return {
    inScope: outOfScope.length === 0,
    outOfScope,
  }
}

module.exports = {
  validatePatch,
  checkScope,
  FORBIDDEN_SCOPES,
  FORBIDDEN_PATTERNS,
}
