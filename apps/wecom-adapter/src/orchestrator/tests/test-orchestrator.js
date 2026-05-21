/**
 * test-orchestrator.js
 * orchestrator 基础功能 + 动态分工测试
 */

const { scheduleAI, getStatus, reviewPatch } = require('../orchestrator')
const { planTasks, planByDemand, validatePlan } = require('../task-planner')
const { generateBranchName, planBranchOrder } = require('../branch-planner')
const { validatePatch, checkScope } = require('../patch-policy')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✅ ${name}`)
    passed++
  } catch (e) {
    console.log(`❌ ${name}: ${e.message}`)
    failed++
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed')
}

// ── patch-policy ──
test('patch-policy: validatePatch 禁止修改 main', () => {
  const result = validatePatch('diff --git a/main', 'main')
  assert(!result.allowed)
  assert(result.violations.some(v => v.includes('main')))
})

test('patch-policy: validatePatch 允许 feature 分支', () => {
  const result = validatePatch('diff --git a/src/orchestrator/test.js', 'feature/xxx')
  assert(result.allowed, 'feature 分支应该被允许')
})

test('patch-policy: checkScope workbuddy 在职责内', () => {
  const result = checkScope('workbuddy', ['orchestrator', 'task-planner'])
  assert(result.inScope, 'workbuddy 应该有 orchestrator 权限')
})

test('patch-policy: checkScope workbuddy 越权', () => {
  const result = checkScope('workbuddy', ['nginx', 'pm2'])
  assert(!result.inScope, 'workbuddy 不应该有 nginx 权限')
  assert(result.outOfScope.length > 0)
})

// ── branch-planner ──
test('branch-planner: generateBranchName 格式正确', () => {
  const name = generateBranchName('workbuddy', 'orchestrator-core')
  assert(name === 'feature/workbuddy-orchestrator-core-v1')
})

test('branch-planner: planBranchOrder 无依赖顺序', () => {
  const tasks = [
    { role: 'workbuddy', task: 'orchestrator-core' },
    { role: 'codex', task: 'ai-planner' },
  ]
  const order = planBranchOrder(tasks)
  assert(order.length === 2)
  assert(order[0].startsWith('feature/workbuddy'))
})

// ── task-planner 固定分工 ──
test('task-planner: planTasks 返回 4 个角色', () => {
  const plan = planTasks('测试需求')
  assert(plan.length === 4, `期望 4 个角色，实际 ${plan.length}`)
})

test('task-planner: planTasks 包含 workbuddy', () => {
  const plan = planTasks('')
  const wb = plan.find(p => p.role === 'workbuddy')
  assert(wb, '应该包含 workbuddy')
  assert(wb.patchFile === 'workbuddy-orchestrator-core-v1.patch')
})

test('task-planner: validatePlan 全部合规', () => {
  const plan = planTasks('')
  const result = validatePlan(plan)
  assert(result.valid, `规划应该合规: ${result.violations.join('; ')}`)
})

// ── task-planner 动态分工 ──
function assigneesOf(demand) {
  return planByDemand(demand).map(t => t.assignee).join(',')
}

test('planByDemand: 投流优化 → DeepSeek,WorkBuddy,Codex', () => {
  assert(assigneesOf('投流优化') === 'DeepSeek,WorkBuddy,Codex')
})

test('planByDemand: 风险预警 → DeepSeek,Codex,WorkBuddy', () => {
  assert(assigneesOf('风险预警') === 'DeepSeek,Codex,WorkBuddy')
})

test('planByDemand: 视频优化 → 豆包,Codex,WorkBuddy', () => {
  assert(assigneesOf('视频优化') === '豆包,Codex,WorkBuddy')
})

test('planByDemand: 自动日报 → WorkBuddy,Codex,DeepSeek', () => {
  assert(assigneesOf('自动日报') === 'WorkBuddy,Codex,DeepSeek')
})

test('planByDemand: 随机需求 → 4角色通用兜底', () => {
  assert(assigneesOf('随便来个需求') === 'WorkBuddy,Codex,DeepSeek,豆包')
})

test('planByDemand: 不同需求返回不同分工', () => {
  assert(assigneesOf('投流优化') !== assigneesOf('风险预警'))
  assert(assigneesOf('视频优化') !== assigneesOf('自动日报'))
})

test('planByDemand: task 包含必要字段', () => {
  const tasks = planByDemand('投流优化')
  const required = ['assignee', 'title', 'branch', 'scope', 'forbidden', 'patchFile', 'prTarget', 'acceptance']
  tasks.forEach(t => required.forEach(f => assert(f in t, `missing field: ${f}`)))
})

// ── orchestrator ──
test('orchestrator: scheduleAI 无需求时返回固定分工', async () => {
  const result = await scheduleAI({ userRequest: '' })
  assert(result.report, '应该返回 report')
  assert(result.version === '0.1')
  assert(Array.isArray(result.plan))
  assert(result.plan.length === 4)
})

test('orchestrator: scheduleAI 有需求时返回动态分工', async () => {
  const result = await scheduleAI({ userRequest: '投流优化' })
  assert(result.report.includes('投流'), '动态日报应包含需求关键词')
  assert(Array.isArray(result.plan))
  assert(result.plan.length === 3)
  assert(result.plan[0].assignee === 'DeepSeek')
})

test('orchestrator: getStatus 返回版本和模式', () => {
  const status = getStatus()
  assert(status.version === '0.1')
  assert(status.mode === 'plan-only')
  assert(status.supportedRoles.includes('workbuddy'))
})

test('orchestrator: reviewPatch 拒绝 main 分支', () => {
  const result = reviewPatch({
    role: 'workbuddy',
    patchContent: 'diff --git a/src/index.js',
    targetBranch: 'main',
  })
  assert(!result.approved, 'main 分支应该被拒绝')
})

// ── 结果汇总 ──
console.log('')
console.log('===== 测试结果 =====')
console.log(`✅ PASS: ${passed}`)
console.log(`❌ FAIL: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
