/**
 * test-orchestrator-core.js
 * orchestrator-core v0.2 动态意图解析测试
 *
 * 测试覆盖：
 * - "帮我做自动日报" → WorkBuddy
 * - "开发 AI planner" → Codex
 * - "分析 ROI 和投流预算" → DeepSeek
 * - "生成短视频标题和脚本" → 豆包
 * - 未知任务 → WorkBuddy/general_task
 */

const { decompose, buildFallbackPlan, formatPlanForWecom, INTENT_MAP, AI_ASSIGNEES } = require('../orchestrator-core');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed');
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(msg || `期望 "${expected}"，实际 "${actual}"`);
  }
}

// ============ 意图识别测试 ============

test('"帮我做自动日报" → WorkBuddy', () => {
  const plan = decompose('帮我做自动日报');
  assertEqual(plan.recommendedAssignee, 'workbuddy', '应该分配给 WorkBuddy');
  assertEqual(plan.intent, 'daily_report');
  assert(plan.reason.includes('WorkBuddy'), '原因应包含 WorkBuddy');
  assert(plan.branch.startsWith('feature/workbuddy'), '分支应以 feature/workbuddy 开头');
  assert(plan.patchFile.includes('workbuddy'), 'patch 文件名应包含 workbuddy');
});

test('"开发 AI planner" → Codex', () => {
  const plan = decompose('开发 AI planner');
  assertEqual(plan.recommendedAssignee, 'codex', '应该分配给 Codex');
  assertEqual(plan.intent, 'ai_planning');
  assert(plan.reason.includes('Codex'), '原因应包含 Codex');
});

test('"分析 ROI 和投流预算" → DeepSeek', () => {
  const plan = decompose('分析 ROI 和投流预算');
  assertEqual(plan.recommendedAssignee, 'deepseek', '应该分配给 DeepSeek');
  assertEqual(plan.intent, 'ads_analysis');
  assert(plan.reason.includes('DeepSeek'), '原因应包含 DeepSeek');
});

test('"生成短视频标题和脚本" → 豆包', () => {
  const plan = decompose('生成短视频标题和脚本');
  assertEqual(plan.recommendedAssignee, 'doubao', '应该分配给 豆包');
  assertEqual(plan.intent, 'video_creation');
  assert(plan.reason.includes('豆包'), '原因应包含 豆包');
});

test('未知任务 → WorkBuddy/general_task', () => {
  const plan = decompose('帮我做一件完全随机的事情xyz123');
  assertEqual(plan.recommendedAssignee, 'workbuddy', '未知任务应默认分配给 WorkBuddy');
  assertEqual(plan.intent, 'general_task', '未知任务意图应为 general_task');
});

// ============ 边界条件测试 ============

test('空输入 → general_task', () => {
  const plan = decompose('');
  assertEqual(plan.intent, 'general_task');
  assertEqual(plan.recommendedAssignee, 'workbuddy');
});

test('纯空格输入 → general_task', () => {
  const plan = decompose('   ');
  assertEqual(plan.intent, 'general_task');
});

// ============ 输出结构完整性测试 ============

test('输出结构包含所有必需字段', () => {
  const plan = decompose('帮我做自动日报');
  const requiredFields = [
    'goal', 'intent', 'recommendedAssignee', 'reason',
    'branch', 'patchFile', 'prTarget', 'forbidden',
    'acceptance', 'fullPrompt',
  ];
  for (const field of requiredFields) {
    assert(plan[field] !== undefined, `缺少字段: ${field}`);
  }
});

test('prTarget 固定为 develop', () => {
  const plan1 = decompose('做投流分析');
  const plan2 = decompose('生成视频脚本');
  assertEqual(plan1.prTarget, 'develop');
  assertEqual(plan2.prTarget, 'develop');
});

test('forbidden 包含禁止路径', () => {
  const plan = decompose('做风险复盘');
  assert(plan.forbidden.length > 0, 'forbidden 不应为空');
  assert(plan.forbidden.some(f => f.includes('.env')), '应包含 .env 禁止');
  assert(plan.forbidden.some(f => f.includes('nginx')), '应包含 nginx 禁止');
});

test('acceptance 包含验收标准', () => {
  const plan = decompose('做投流ROI分析');
  assert(plan.acceptance.length > 0, 'acceptance 不应为空');
});

test('fullPrompt 包含用户请求和约束', () => {
  const plan = decompose('帮我做自动日报');
  assert(plan.fullPrompt.includes('帮我做自动日报'), '应包含原始请求');
  assert(plan.fullPrompt.includes('不自动执行'), '应包含不自动执行约束');
  assert(plan.fullPrompt.includes('不自动 merge'), '应包含不自动 merge 约束');
});

// ============ formatPlanForWecom 测试 ============

test('formatPlanForWecom 输出包含 Audit ID', () => {
  const plan = decompose('做投流分析');
  const formatted = formatPlanForWecom(plan, 'orch-test-123');
  assert(formatted.includes('orch-test-123'), '应包含 Audit ID');
});

test('formatPlanForWecom 输出包含完整任务文案', () => {
  const plan = decompose('生成视频脚本');
  const formatted = formatPlanForWecom(plan);
  assert(formatted.includes('完整任务文案'), '应包含完整任务文案标题');
  assert(formatted.includes(plan.fullPrompt), '应包含 fullPrompt 内容');
});

// ============ INTENT_MAP 完整性测试 ============

test('INTENT_MAP 覆盖所有 4 个 AI 角色', () => {
  const assignees = new Set(INTENT_MAP.map(e => e.assignee));
  assert(assignees.has('workbuddy'), '应包含 workbuddy');
  assert(assignees.has('codex'), '应包含 codex');
  assert(assignees.has('deepseek'), '应包含 deepseek');
  assert(assignees.has('doubao'), '应包含 doubao');
});

// ============ buildFallbackPlan 测试 ============

test('buildFallbackPlan 返回完整结构', () => {
  const plan = buildFallbackPlan('测试任务');
  assertEqual(plan.intent, 'general_task');
  assertEqual(plan.recommendedAssignee, 'workbuddy');
  assert(plan.forbidden.length > 0);
  assert(plan.fullPrompt.length > 0);
});

// ============ 结果输出 ============

console.log('\n===== orchestrator-core 测试结果 =====');
console.log(`✅ PASS: ${passed}`);
console.log(`❌ FAIL: ${failed}`);

// 展示一个完整输出样例
console.log('\n===== 输出样例（"做投流ROI分析"）=====');
const sample = decompose('做投流ROI分析');
console.log(JSON.stringify(sample, null, 2));

process.exit(failed > 0 ? 1 : 0);
