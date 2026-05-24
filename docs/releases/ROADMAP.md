# ROADMAP - wecom-openclaw

> 版本规划与里程碑路线图
> 最后更新：2026-05-24

---

## 当前版本

`v1.0-alpha` （开发预览版，develop 分支）

---

## 版本规划

| 版本 | 类型 | 目标 | 状态 |
|------|------|------|------|
| v1.0-alpha | Alpha | 核心功能可运行，企微回调通 | ✅ 进行中 |
| v1.0-beta | Beta | 生产验证，审计体系就绪 | 🔵 待 alpha 稳定 |
| v1.0-rc | RC | 正式发布候选，所有治理到位 | 🔵 待 beta 验证 |
| v1.0 | Stable | 生产稳定版，main 分支 | 🔵 待 RC 通过 |

---

## 模块完成度全景

| 模块 | 完成度 | 说明 |
|------|--------|------|
| 企微回调适配层 | 90% | wecom-adapter v1.1，Vault 集成完成 |
| REGISTRY 命令中心 | 85% | 22 条命令，Skill Layer 回退 |
| AI Orchestrator | 65% | Runtime Core v0.4，4 AI Worker |
| AI 运营分析 | 75% | ops-analysis，fallback 机制 |
| AI 投流系统 | 60% | ads-analysis，mock 数据 |
| AI 视频运营 | 55% | video-script-generator 纯模板 |
| AI 开发治理 | 75% | risk-policy，review-engine |
| Activity 系统 | 60% | NLP 闭环，数据爬虫待稳定 |
| Monitor 监控 | 70% | PM2 监控，告警阈值可配 |
| Vault 密钥管理 | 80% | AppRole 认证，缺 doudian/openclaw policy |
| Infra 审计体系 | 0% | 🆕 P3 建设中 |
| 生产治理规则 | 0% | 🆕 P4 建设中 |

---

## 近期里程碑

### ✅ 已完成（2026-05）
- [x] PR #27 合并，develop 收敛
- [x] wecom-adapter v1.1：Vault 集成
- [x] `/活动` `/风险告警` bug 修复
- [x] GitHub main 分支保护（P1）
- [x] Release 体系初始化（P2）

### 🔵 进行中
- [ ] Infra 审计体系（P3）
- [ ] 生产冻结规则（P4）
- [ ] `activity.js` 模块实现（当前 `/活动` 指向 `activity-profit` 临时方案）

### 📋 待办
- [ ] Vault policy 补全（kv/doudian、kv/openclaw）
- [ ] Activity 数据爬虫稳定（check-activity worker）
- [ ] AI Worker 真实回调（OpenAI / DeepSeek / 豆包）
- [ ] PM2 堆内存优化（当前 93%+）
- [ ] Staging 环境搭建
- [ ] 企微回调修改 → staging 验证流程

---

## 发布节奏

```
feature/*  →  PR  →  develop  →  verify  →  PR  →  main  →  tag  →  deploy
```

**Tag 规则**：
- Alpha：`v1.0-alpha` `v1.1-alpha`
- Beta：`v1.0-beta`
- RC：`v1.0-rc1` `v1.0-rc2`
- Stable：`v1.0` `v1.1`

---

## 风险矩阵

| 风险 | 级别 | 缓解措施 |
|------|------|----------|
| develop 未稳定就合入 main | 🔴 High | main 分支保护 + require PR review |
| 直接修改生产代码 | 🔴 High | 生产冻结规则（P4） |
| Vault 密钥泄露 | 🟡 Medium | AppRole + 最短 TTL + audit log |
| PM2 内存泄漏 | 🟡 Medium | 监控告警 + 定期 restart |
| 日本 relay 单点故障 | 🟡 Medium | 多 relay 冗余（待建设） |
| 企微回调配置错误 | 🟠 Low | staging 验证强制流程 |

---

## 贡献者

| 角色 | 负责人 | 职责 |
|------|--------|------|
| Human | 郝忠亮 | 架构决策、生产部署、Vault 运维 |
| WorkBuddy | AI | deploy、审计、rollback、文档 |
| Codex | AI | patch、feature 分支、代码审查 |
