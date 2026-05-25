'use strict';

/**
 * command-args.js — AI Runtime PR Guardrail: 命令参数标准化
 *
 * 解决真实 router 调用与测试调用的参数传递不一致问题：
 *   - 真实 router: handler(ctx, args) — args 通过第二个参数传入
 *   - 测试/直接调用: handler({ args: 'xxx' }) — args 通过 ctx.args 传入
 *   - ctx 为 null/undefined 时的安全处理
 *
 * 设计原则：
 *   1. args 参数优先（真实 router 路径）
 *   2. 回退到 ctx.args（兼容路径）
 *   3. ctx 为 null/undefined 时安全处理
 *   4. 返回统一的三元组 { ctx, args, argStr }
 */

/**
 * 标准化命令参数 — 统一 args 和 ctx.args 两种传入方式
 *
 * @param {object|null|undefined} ctx — 命令上下文对象
 * @param {string|undefined}      args — 直接传入的参数（真实 router 路径）
 * @returns {{ ctx: object, args: string, argStr: string }}
 *   - ctx:    安全的上下文对象（保证非 null）
 *   - args:   解析后的参数字符串
 *   - argStr: args 的 trim() 结果，同 args
 *
 * 规则：
 *   1. args 参数优先（非 undefined 时使用）
 *   2. ctx 为 null/undefined → 使用空对象 {}
 *   3. args 为 undefined → 回退到 ctx.args
 *   4. ctx.args 为 undefined/null → 使用空字符串 ''
 */
function normalizeCommandArgs(ctx, args) {
  // 安全处理 ctx
  var safeCtx = (ctx != null) ? ctx : {};

  // args 优先，回退 ctx.args
  var argStr;
  if (args !== undefined) {
    argStr = String(args || '');
  } else {
    argStr = (safeCtx.args != null) ? String(safeCtx.args || '') : '';
  }
  argStr = argStr.trim();

  return {
    ctx: safeCtx,
    args: argStr,
    argStr: argStr,
  };
}

module.exports = {
  normalizeCommandArgs: normalizeCommandArgs,
};
