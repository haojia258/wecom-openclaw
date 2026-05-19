'use strict';

/**
 * Ops analysis module with local fallback.
 *
 * Design:
 * - Always produce deterministic local analysis from rule result.
 * - Optional LLM enhancer can be injected by caller (dependency inversion).
 * - If enhancer fails/timeout/returns empty, fallback text is returned.
 */

function renderLocal(result) {
  const lines = ['📊 今日运营分析', ''];

  lines.push('【今日运营摘要】');
  lines.push(result.summary || '暂无数据');
  lines.push('');

  lines.push('【风险提示】');
  if (Array.isArray(result.risks) && result.risks.length > 0) {
    for (const risk of result.risks) lines.push('• ' + risk);
  } else {
    lines.push('✅ 暂无高风险预警');
  }
  lines.push('');

  lines.push('【SKU 建议】');
  lines.push(result.skuAdvice || '数据缺失，无法给出建议');
  lines.push('');

  lines.push('【活动建议】');
  lines.push(result.activityAdvice || '数据缺失，无法判断');
  lines.push('');

  lines.push('【补货建议】');
  lines.push(result.inventoryAdvice || '暂不支持');
  lines.push('');

  lines.push('【今日最优先动作】');
  lines.push(result.priorityAction || '暂无');

  return lines.join('\n');
}

function clampText(text, maxLen = 1800) {
  const content = String(text || '');
  if (content.length <= maxLen) return content;
  return content.slice(0, Math.max(0, maxLen - 3)) + '...';
}

function buildEnhancerPrompt(localText) {
  return [
    '你是一位资深电商运营专家。',
    '请在不改变原始事实的前提下，优化以下运营分析输出：',
    '- 语言更清晰',
    '- 动作建议更可执行',
    '- 不超过1800字符',
    '',
    localText,
  ].join('\n');
}

async function analyzeWithFallback(params) {
  const {
    rulesResult,
    enhancer,
    enhancerTimeoutMs = 12_000,
    maxLen = 1800,
  } = params || {};

  if (!rulesResult || typeof rulesResult !== 'object') {
    throw new Error('rulesResult is required');
  }

  const localText = clampText(renderLocal(rulesResult), maxLen);
  if (typeof enhancer !== 'function') return localText;

  try {
    const prompt = buildEnhancerPrompt(localText);
    const candidate = await withTimeout(
      Promise.resolve(enhancer({ prompt, localText, rulesResult })),
      enhancerTimeoutMs
    );

    if (!candidate || typeof candidate !== 'string') return localText;
    const normalized = candidate.trim();
    if (!normalized) return localText;
    return clampText(normalized, maxLen);
  } catch (_) {
    return localText;
  }
}

function withTimeout(promise, ms) {
  const timeoutMs = Number.isFinite(ms) && ms > 0 ? ms : 12_000;
  let timer = null;

  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('enhancer timeout')), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

module.exports = {
  renderLocal,
  clampText,
  buildEnhancerPrompt,
  analyzeWithFallback,
  withTimeout,
};
