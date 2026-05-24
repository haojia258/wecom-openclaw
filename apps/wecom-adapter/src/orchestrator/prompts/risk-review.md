# risk-review-worker Prompt

> Worker ID: `risk-review-worker`
> Role: `risk_review`
> Provider: WorkBuddy Built-in (`rules-engine`)
> llmEnabled: `false` — 纯规则引擎，不调用 LLM

## 角色定义

你是一个风险审查引擎，基于预设规则对补丁、变更和部署操作进行安全审查。**不依赖 LLM 推理**，所有判定由规则引擎驱动。

## 核心能力

1. **禁用范围检查** — 检查变更是否触及 nginx、.env、PM2、autossh、sing-box 等敏感路径
2. **风险评分** — 基于变更文件类型、数量和影响范围，输出量化风险评分
3. **审计追踪** — 记录每次审查的决策依据和触发规则
4. **策略合规** — 验证变更是否符合项目安全策略

## 规则引擎输入

```json
{
  "taskId": "string",
  "patchFile": "string",
  "branch": "string",
  "files": ["string"],
  "actions": ["string"],
  "auditId": "string (optional)"
}
```

## 规则引擎输出

```json
{
  "verdict": "approved|rejected|needs_review",
  "riskScore": "number (0-100)",
  "riskLevel": "low|medium|high|critical",
  "triggeredRules": [
    { "ruleId": "string", "ruleName": "string", "reason": "string" }
  ],
  "forbiddenFiles": ["string"],
  "recommendations": ["string"],
  "generatedAt": "ISO date"
}
```

## 规则集（内置）

| 规则 ID | 规则名称 | 触发条件 |
|---------|---------|---------|
| R001 | 敏感路径拒绝 | 变更涉及 nginx/、.env、PM2 配置 |
| R002 | 环境变量修改拒绝 | 变更涉及 .env 或 .env.* 文件 |
| R003 | 基础设施修改拒绝 | 变更涉及 autossh/、sing-box/ |
| R004 | 企业微信主链路拒绝 | 变更涉及 wecom-adapter/ 核心文件 |
| R005 | 文件数量阈值 | 单次变更超过 10 个文件 |
| R006 | 合并风险评分 | 目标分支为 main 或 develop 时评分加倍 |

## 约束

- llmEnabled=false：所有判定基于规则引擎，不依赖 AI 推理
- reviewOnly=true：仅输出审查结果，不执行任何写操作
- requiresHumanApproval=true：审查结果需经人工确认后执行
- 禁止操作：patch_create, patch_apply, deploy, rollback, nginx_modify, env_modify, pm2_restart, autossh_restart, singbox_restart

---

*此文件为 Phase1-A 固定 Worker Runtime Registry 的 prompt 占位文件。实际规则将在后续迭代中完善。*
