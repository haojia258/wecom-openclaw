# 生产冻结规则（Production Freeze Rules）

> 适用于：wecom-openclaw 项目生产环境
> 生效日期：2026-05-24
> 适用范围：所有涉及 `main` 分支、生产服务器（49.232.24.120）的变更

---

## 核心原则

**任何人（包括 Human/WorkBuddy/Codex）不得直接修改生产环境代码。**

所有变更 **必须** 通过 `feature/* → PR → develop → verify → PR → main` 流程。

---

## 规则明细

### 规则 1：禁止直接修改生产代码

- ❌ 禁止直接 SSH 到生产服务器修改 `apps/` 下的代码文件
- ❌ 禁止直接编辑 `/opt/wecom-openclaw/apps/wecom-adapter/src/*`
- ✅ 只能通过 git 部署流程更新生产代码

**例外**：`.env` 中的非敏感配置（如 `PUSH_CRON`、`LOG_LEVEL`）可临时修改，但 **必须在 24h 内同步到 Git**。

---

### 规则 2：禁止直接 push main

- ❌ 禁止 `git push origin main`（已被 GitHub 分支保护阻止）
- ❌ 禁止 `git push --force origin main`（已被分支保护阻止）
- ✅ 只能通过 **Pull Request** 合并到 `main`

**违反后果**：GitHub 分支保护会拒绝推送，如果绕过（admin override），需事后 review。

---

### 规则 3：所有改动必须走分支流程

```
feature/my-feature  →  PR  →  develop  →  verify  →  PR  →  main  →  tag  →  deploy
```

| 阶段 | 要求 |
|------|------|
| `feature/*` | 描述清晰，关联 issue（如有） |
| PR → develop | 至少 1 人 review（WorkBuddy 或 Human） |
| develop verify | `npm test` 通过 + 生产部署验证（/状态 / /监控 正常） |
| PR → main | develop 稳定 ≥ 24h，无 hotfix 合并 |
| tag | 遵循语义化版本 `v1.0` `v1.1-alpha` |
| deploy | 见「部署前检查清单」 |

---

### 规则 4：部署前必须检查

部署人（WorkBuddy 或 Human）**必须** 完成以下检查，方可 deploy：

```bash
# 1. PM2 snapshot（用于 rollback）
pm2 snapshot > /opt/wecom-openclaw/backups/pm2-snapshot-$(date +%Y%m%d-%H%M%S).json

# 2. Git commit hash（记录部署版本）
cd /opt/wecom-openclaw && git log --oneline -1

# 3. .env backup（防止配置丢失）
cp /opt/wecom-openclaw/.env /opt/wecom-openclaw/backups/.env-$(date +%Y%m%d-%H%M%S).bak

# 4. 测试通过（本地或 CI）
npm run test:skills && npm run test:commands
```

**检查记录**写入 `/opt/wecom-openclaw/logs/deploy-log.md`：

```markdown
## [2026-05-24 08:35] Deploy wecom-adapter v1.1.0
- PM2 snapshot: backups/pm2-snapshot-20260524-083500.json
- Git commit: 5cb345a (Merge PR #27)
- .env backup: backups/.env-20260524-083500.bak
- Tests: 36/36 passed
- Deploy by: WorkBuddy
- Rollback commit: (if needed)
```

---

### 规则 5：回滚（Rollback）流程

当生产部署出现问题时：

```bash
# 1. 立即回滚到上一个 commit
cd /opt/wecom-openclaw
git log --oneline -3  # 找到上一个稳定 commit
git reset --hard <prev_stable_commit>

# 2. 重启 PM2
pm2 reload wecom-adapter

# 3. 验证健康
curl http://127.0.0.1:3001/health

# 4. 记录回滚
echo "## ROLLBACK: $(date) - reverted to <prev_commit>" >> logs/deploy-log.md
```

**自动回滚**（未来改进）：PM2 `--update-env` 失败时自动 `git reset --hard HEAD~1`。

---

### 规则 6：角色职责划分

| 角色 | 负责人 | 允许操作 |
|------|--------|----------|
| **Human** | 郝忠亮 | deploy、Vault 运维、紧急 hotfix approval、生产访问 |
| **WorkBuddy** | AI | deploy 执行、审计执行、rollback 执行、文档更新 |
| **Codex** | AI | patch 生成、feature 分支开发、文档起草、代码审查 |

**禁止交叉**：
- ❌ WorkBuddy 不得直接修改 `main` 分支（需 PR）
- ❌ Codex 不得直接 deploy 到生产
- ❌ Human 不得绕过 PR review 直接合并到 `main`

---

### 规则 7：紧急 Hotfix 流程

当生产出现 **P0 故障**（服务完全不可用）时，可走紧急流程：

```
1. 从 main 创建 hotfix 分支：git checkout main && git checkout -b hotfix/xxx
2. 修复问题（最小改动原则）
3. 本地验证：npm test + 手动测试
4. 直接合并到 main（跳过 develop，但必须 PR + 1 approval）
5. 立即 deploy 到生产
6. 事后：将 hotfix 合并回 develop（防止 regression）
```

**Hotfix 合并后 24h 内必须**：
- [ ] 写 postmortem 文档（`docs/postmortems/YYYY-MM-DD-hotfix-xxx.md`）
- [ ] 合并 hotfix 回 `develop`
- [ ] 更新 `ROADMAP.md` 记录故障

---

### 规则 8：日本 Relay 不允许随意重启

日本 relay（43.163.229.96）是 OpenAI API 访问的关键路径，**禁止随意重启** `sing-box` 或 `autossh`。

- ✅ 允许：查看状态（`systemctl status sing-box`）
- ✅ 允许：查看日志（`journalctl -u sing-box -n 50`）
- ⚠️ 需审批：重启 `sing-box` / `autossh`（需 Human 或 WorkBuddy 确认）
- ❌ 禁止：修改 `sing-box` 配置后不通知团队

**重启前检查**：
```bash
# 1. 通知团队（企微群）
# 2. 记录当前状态
ssh tokyo-server "systemctl status sing-box > /tmp/sing-box-status-before.txt"
# 3. 重启
ssh tokyo-server "systemctl restart sing-box"
# 4. 验证
curl -x socks5://127.0.0.1:1087 https://api.openai.com/v1/models -H "Authorization: Bearer test"
# 5. 记录结果
echo "$(date): restarted sing-box, result: $?" >> logs/relay-ops.log
```

---

### 规则 9：企微回调修改必须先 Staging 验证

所有涉及企微回调逻辑的修改（包括 `command-center.js`、`router.js`、`index.js`、`skills.js`），**必须** 先在 staging 环境验证。

当前 staging 环境状态：🚧 **尚未搭建**

**临时方案**（staging 搭建前）：
- 修改 `command-center.js` 后，先 `npm run test:commands` 全通过
- 部署到生产后，立即用企微发送 `/帮助` `/状态` 验证回调正常
- 如果回调失败：**立即 rollback**（规则 5）

**Staging 环境搭建后**：
- [ ] 北京服务器搭建 staging（不同端口，如 3002）
- [ ] 企微创建测试应用（独立 AgentID）
- [ ] 所有回调修改先到 staging 验证，再 deploy 生产

---

## 违规处理

| 级别 | 行为 | 处理 |
|------|------|------|
| 🟡 轻微 | 直接 push `develop`（未走 PR） | 提醒，下次走 PR |
| 🟠 中等 | 直接修改生产 `.env` 未同步 Git | 要求 24h 内同步，记录 |
| 🔴 严重 | 直接修改生产代码，未走 PR | review 流程，记录 postmortem |
| ⚫ 极严重 | 绕过分支保护强制合并到 `main` | 回滚，全员 review 流程 |

---

## 检查清单（Deploy 前）

Deployer（WorkBuddy 或 Human）部署前 **必须** 逐项勾选：

- [ ] `git status` 干净（无未提交修改）
- [ ] `npm run test:skills` 通过（5/5）
- [ ] `npm run test:commands` 通过（23/23）
- [ ] PM2 snapshot 已保存
- [ ] `.env` backup 已保存
- [ ] Git commit hash 已记录
- [ ] 部署后 `/健康` 检查通过
- [ ] 部署后 `/状态` 检查通过
- [ ] 部署 log 已写入 `logs/deploy-log.md`

---

## 版本历史

| 版本 | 日期 | 修改内容 |
|------|------|----------|
| v1.0 | 2026-05-24 | 初始版本，规则 1-9 |

---

## 参考

- [GitHub Branch Protection Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [wecom-openclaw ROADMAP](./ROADMAP.md)
- [Release Process](./releases/v1.0-alpha.md)
