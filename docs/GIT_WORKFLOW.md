# Git Workflow - DoudianOS 多 AI 协作分支规范

> 适用仓库: haojia258/wecom-openclaw
> 生效时间: 2026-05-18

---

## 一、分支职责

| 分支 | 用途 | 谁能推 | 合入规则 |
|------|------|--------|----------|
| `main` | 稳定生产版本 | 仅人工操作 | 只接受经过验收的 PR，禁止 AI 直接推送 |
| `develop` | AI 协同集成分支 | WorkBuddy / Codex | feature/* 先合入 develop，验证后再合入 main |
| `feature/*` | 单个功能独立分支 | 对应 AI | 小步提交，完成后 PR 到 develop |
| `hotfix/*` | 线上紧急修复 | 人工 + WorkBuddy | 从 main 拉出，修完同时合入 main 和 develop |

### main 分支规则
- 只存放稳定生产版本
- 只允许经过服务器灰度验证后的代码合入
- **禁止 AI 直接 push**（包括 WorkBuddy 和 Codex）
- 合入后打 tag（如 `v1.0.0`、`v1.1.0`）

### develop 分支规则
- AI 协同集成分支
- WorkBuddy 和 Codex 的 feature/* 都先合入 develop
- 服务器灰度验证在 develop 分支对应环境进行
- 验证通过后由人工 PR 到 main

### feature/* 分支规则
- 每个功能独立一个分支
- 每个 AI 独立分支，互不干扰
- 命名规范: `feature/<ai>-<module>-v<n>`
- 小步提交，小 PR

### hotfix/* 分支规则
- 从 main 拉出
- 修完后同时合入 main 和 develop
- 命名规范: `hotfix/<description>`

---

## 二、AI 分工

### WorkBuddy 负责
- 企业微信工程稳定化
- commands（命令系统）
- cron（定时任务）
- push（推送机制）
- PM2（进程管理）
- 部署流程
- 日志系统
- fallback / timeout 保护

### Codex 负责
- AI 运营分析
- prompt-builder
- score-model
- fallback-analysis
- 本地规则引擎
- GPT 增强层

### 禁止两边同时修改的文件
- 企业微信回调加密/解密主链路 (`src/wecom-crypto.js` 等)
- nginx 配置
- `.env`（任何环境变量文件）
- 线上敏感配置
- 同一个核心路由文件 (`src/router.js`)

> 如需修改以上文件，先在群里确认另一方暂停该文件改动。

---

## 三、标准流程

```
feature/*
    ↓  PR
develop（集成验证）
    ↓  服务器灰度测试
    ↓  人工确认
    ↓  PR
main
    ↓  打 tag
生产部署
```

### 详细步骤
1. 从 develop 创建 feature 分支: `git checkout develop && git checkout -b feature/workbuddy-xxx-v1`
2. 在 feature 分支上开发和提交
3. 推送并创建 PR 到 develop
4. 合入 develop 后在服务器灰度验证
5. 验证通过后创建 PR 从 develop 到 main
6. 合入 main 后打 tag: `git tag v1.x.0`
7. 部署到生产环境

---

## 四、分支命名规范

| AI | 前缀 | 示例 |
|----|------|------|
| WorkBuddy | `feature/workbuddy-` | `feature/workbuddy-wecom-stable-v1` |
| WorkBuddy | `feature/workbuddy-` | `feature/workbuddy-push-cron-v1` |
| WorkBuddy | `feature/workbuddy-` | `feature/workbuddy-deploy-fix-v1` |
| Codex | `feature/codex-` | `feature/codex-ai-analysis-v1` |
| Codex | `feature/codex-` | `feature/codex-score-model-v1` |
| Codex | `feature/codex-` | `feature/codex-prompt-builder-v1` |
| Playwright | `feature/playwright-` | `feature/playwright-doudian-fetch-v1` |
| 推广投流 | `feature/ads-` | `feature/ads-agent-v1` |
| 视频制作 | `feature/video-` | `feature/video-agent-v1` |

---

## 五、PR 要求

每个 PR **必须**包含:
- [x] 修改文件列表
- [x] 新增文件列表
- [x] 测试命令及结果
- [x] 回滚命令
- [x] 风险说明
- [x] 是否涉及敏感信息

详见 `.github/pull_request_template.md`

---

## 六、敏感信息规则

- `.env` 永远不提交（已在 .gitignore）
- `.env.example` 只放占位符，不放真实值
- `*.pem` / `*.key` 不提交
- logs / screenshots / cookies 不提交
- 禁止硬编码 Token、AESKey、密码
- 提交前用 `git diff --staged` 检查是否有敏感信息

---

## 七、Tag 规范

格式: `v<major>.<minor>.<patch>`

- `major`: 架构级变更（如企微协议升级）
- `minor`: 新功能模块（如新增 AI 分析模块）
- `patch`: bug 修复和小改进

示例:
- `v1.0.0` - 首个稳定版
- `v1.1.0` - 新增运营分析
- `v1.1.1` - 修复推送超时
