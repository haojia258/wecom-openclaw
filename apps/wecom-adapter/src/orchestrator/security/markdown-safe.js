'use strict';

/**
 * markdown-safe.js — AI Runtime PR Guardrail: Markdown 安全处理
 *
 * 防止 AI 输出破坏企业微信 Markdown 格式：
 *   - 表格注入防御：转义管道符 |
 *   - 代码围栏安全：将 AI 输出中的 ``` 替换为安全占位符
 *   - 长度截断：超长内容截断并标记
 *
 * 设计原则：
 *   1. 不破坏已有的安全围栏（调用处负责围栏配对）
 *   2. 脱敏 → 围栏 → 转义 → 截断（四步标准化管道）
 *   3. 所有函数为纯函数，不抛出异常
 */

var sanitizeOutputMod = require('./sanitize-output');
var redactSensitive = sanitizeOutputMod.redactSensitive;

/**
 * Markdown 转义 — 防止表格注入和格式破坏
 *
 * 当前转义规则：
 *   - | → \| （管道符转义，防止表格注入）
 *
 * 未来可扩展：
 *   - 反引号配对检查
 *   - URL scheme 验证
 *
 * @param {*} value - 任意输入值
 * @returns {string} Markdown 安全字符串
 */
function escapeMarkdown(value) {
  if (value == null) return '';
  if (typeof value !== 'string') value = String(value);
  // 管道符转义（防止表格注入）
  value = value.replace(/\|/g, '\\|');
  return value;
}

/**
 * 安全字段处理 — 脱敏 + Markdown 转义
 *
 * 适用场景：表格字段值、短文本输出（单行）
 *
 * @param {*} value - 字段值
 * @returns {string} 安全的 Markdown 字符串
 */
function sanitizeField(value) {
  return escapeMarkdown(redactSensitive(value));
}

/**
 * 处理 AI 输出文本 — 完整安全管线
 *
 * 管线顺序：
 *   1. redactSensitive() — 脱敏所有敏感信息（keys, tokens, paths）
 *   2. 代码围栏替换 — 将 ``` 替换为 [CODE_BLOCK]，避免破坏企业微信 Markdown
 *   3. escapeMarkdown() — 管道符转义，防御表格注入
 *
 * 注意：
 *   - 截断（truncate）不在此函数内调用，由调用方自行决策
 *   - 代码围栏替换在脱敏之后、转义之前执行
 *
 * @param {string} outputText - AI 原始输出文本
 * @returns {string} 安全的 Markdown 文本
 */
function sanitizeOutput(outputText) {
  if (!outputText) return '';
  // 先脱敏
  var text = redactSensitive(outputText);
  // 处理代码围栏：替换为安全占位符
  text = text.replace(/```/g, '[CODE_BLOCK]');
  // Markdown 转义（管道符）
  text = escapeMarkdown(text);
  return text;
}

/**
 * 截断文本到指定长度
 *
 * 注意：必须在 sanitizeOutput() 之后调用，确保截断不会发生在敏感信息中间。
 *
 * @param {string} text — 已脱敏的文本
 * @param {number} maxLen — 最大字符数
 * @returns {string} 截断后的文本
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...(截断)';
}

module.exports = {
  escapeMarkdown: escapeMarkdown,
  sanitizeField: sanitizeField,
  sanitizeOutput: sanitizeOutput,
  truncateText: truncateText,
};
