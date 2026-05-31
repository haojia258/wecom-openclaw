# P17.1 Product Asset Foundation v0.1

## 目标

搭建 Product Asset System 基础框架，包含 6 个核心模块。

## 分支

`feature/p17-1-asset-foundation-v1`

## 命令

| 命令 | 文件 |
|------|------|
| `/素材状态` | commands/asset-foundation.js |
| `/素材统计` | 同上 |
| `/素材搜索` | 同上 |

## 核心模块

| 模块 | 文件 | 功能 |
|------|------|------|
| Asset Registry | skills/asset-registry/ | 素材 CRUD、过滤、搜索、统计 |
| Product Registry | skills/product-registry/ | 产品注册、素材关联、统计 |
| Asset Collector | skills/asset-collector/ | Mock 数据生成（10 个素材 + 2 个产品） |
| Tag Engine | skills/tag-engine/ | 自动标签、标签统计 |
| Dedup Engine | skills/dedup-engine/ | 重名/checksum/URL 去重检测 |
| Asset Audit | skills/asset-audit/ | 操作审计日志 |

## Mock 数据

- 10 个素材（image/video/document/config）
- 2 个产品（酸辣粉经典款/升级款）
- 1 个故意重复（hero-banner-main.jpg x2）
- 存储在 `logs/assets/mock/`

## 测试

- 51/51 passed
- 7 类测试：Asset Registry / Product Registry / Tag Engine / Dedup Engine / Asset Collector / Audit / Mock Integration

## 限制

- ❌ 禁止 clone 仓库
- ❌ 禁止 install 依赖
- ❌ 禁止执行第三方代码
- ❌ 禁止修改 .env
- ❌ 禁止修改 nginx
- ❌ 禁止自动发布到生产环境
- ❌ 禁止自动上线变更
- ❌ 禁止自动 merge

## 要求

- ✅ `REVIEW_ONLY=true`
- ✅ `requiresHumanApproval=true`

所有变更仅允许：代码实现、测试、审查、Artifact 输出、Audit 记录。任何生产发布动作必须经过人工批准。
