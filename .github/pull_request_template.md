## PR 类型

- [ ] WorkBuddy 工程稳定
- [ ] Codex AI 模块
- [ ] Playwright 抓取
- [ ] 推广投流
- [ ] 视频制作
- [ ] hotfix
- [ ] docs

## 修改内容

请说明本次改动的目的和范围。

## 修改文件

**新增：**
-
**修改：**
-
**删除：**
-

## 测试结果

| 检查项 | 结果 |
|--------|------|
| `npm install` | |
| `node --check src/index.js` | |
| `curl /health` | |
| 企业微信 `/ping` | |
| 企业微信 `/帮助` | |
| 企业微信 `/状态` | |
| 企业微信 `/运营分析` | |

## 风险检查

- [ ] 没有提交 `.env`
- [ ] 没有提交 `*.pem` / `*.key`
- [ ] 没有提交 `logs/`
- [ ] 没有提交 `node_modules/`
- [ ] 没有提交 `cookies/` / `storage/` / `screenshots`
- [ ] 没有硬编码真实 Token
- [ ] 没有破坏企业微信加密/解密主链路
- [ ] 没有直接修改生产 nginx 配置

## 回滚命令

\`\`\`bash
git revert <commit>
\`\`\`

或：

\`\`\`bash
git reset --hard <safe_commit>
\`\`\`

## 是否建议合并

- [ ] 可以合入 develop
- [ ] 可以合入 main
- [ ] 暂不建议合并
