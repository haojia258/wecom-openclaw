# P15 OSS Radar v0.1

## 目标

开发 `/开源雷达` 能力，让系统可以根据关键词评估外部开源项目的可复用价值。

## 分支

`feature/p15-oss-radar-v0-1`

## 命令别名

| 命令 | 文件 |
|------|------|
| `/开源雷达` | commands/oss-radar.js |
| `/oss-radar` | 同上 |
| `/oss` | 同上 |
| `/开源` | 同上 |

## 功能

### v0.1 Mock Mode

- USE_MOCK=true（默认），使用内置 5 个开源项目数据
- Mock 项目：langchain, crewai, react, autogpt, tensorflow
- 不用 GitHub API，不产生外部请求

### 评分引擎

- Stars (40%)：对数加权，max 40 pts
- Forks (20%)：对数加权，max 20 pts
- Issues (20%)：开放 issue 惩罚，max 20 pts
- Activity (20%)：近期更新时间加权，max 20 pts
- Level：A/B/C/D

### 风险评估

- 活跃度：>180天=高风险
- 许可证：GPL/AGPL 传染性 = 中风险，Unknown = 高风险
- 开放 Issue：>1000=高风险
- 评分：<40=低分风险
- Level：安全/低风险/中风险/高风险

### 推荐建议

- 推荐复用：Score ≥70 且 Risk <25
- 谨慎评估：Score ≥50 且 Risk <50
- 不建议引入：其他

## 测试

- 35/35 passed
- 7 类测试：Alias/Empty/Scoring/Risk/Recommend/Compare/Search

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
