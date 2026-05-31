'use strict';

/**
 * /ai-review 命令处理器
 * v1.0 - 代码审查命令，调用 review-engine.js 聚合 risk-policy 规则
 *
 * 用法：
 *   /审查 [路径]
 *   /ai-review [路径]
 *
 * 示例：
 *   /审查                      → 审查 apps/ 目录
 *   /审查 apps/wecom-adapter    → 审查指定目录
 */

const path = require('path');
const { review } = require('../review/review-engine');

/**
 * 解析用户输入中的文件路径
 */
function parseFilePath(text) {
  if (!text) return null;
  // 去除命令前缀剩余部分就是路径
  const trimmed = text.trim();
  return trimmed || null;
}

/**
 * 执行审查命令
 */
async function execute(ctx, args) {
  const projectRoot = process.env.PROJECT_ROOT || '/opt/wecom-openclaw';

  // 默认审查 apps/ 目录
  let targetPath = 'apps';
  if (args) {
    const parsed = parseFilePath(args);
    if (parsed) {
      targetPath = parsed;
    }
  }

  // 安全检查：防止路径穿越
  const resolved = path.resolve(projectRoot, targetPath);
  if (!resolved.startsWith(path.resolve(projectRoot))) {
    return '⚠️ 非法路径：审查路径必须在项目根目录内\n路径: ' + targetPath;
  }

  try {
    const result = review(resolved, { projectRoot });

    if (result.files.length === 0) {
      return '⚠️ 未找到可审查的文件\n路径: ' + targetPath + '\n\n提示：请检查路径是否存在，或使用绝对路径。';
    }

    return result.report;
  } catch (e) {
    return '⚠️ 审查执行失败\n错误: ' + e.message.slice(0, 200) + '\n路径: ' + targetPath;
  }
}

module.exports = { execute, desc: 'AI 代码审查', parseFilePath };
