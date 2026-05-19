/**
 * test-orchestrator.js
 * orchestrator 基础功能测试
 */

const { scheduleAI, getStatus, reviewPatch } = require("../orchestrator")
const { planTasks, validatePlan } = require("../task-planner")
const { generateBranchName, planBranchOrder } = require("../branch-planner")
const { validatePatch, checkScope } = require("../patch-policy")

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
  if (!condition) throw new Error(msg || "assertion failed")
}

// ============ patch-policy tests ============
test("patch-policy: validatePatch 禁止修改 main", () => {
  const result = validatePatch("diff --git a/main", "main")
  assert(!result.allowed)
  assert(result.violations.some(v => v.includes("main")))
})

test("patch-policy: validatePatch 允许 feature 分支", () => {
  const result = validatePatch("diff --git a/src/orchestrator/test.js", "feature/xxx")
  assert(result.allowed, "feature 分支应该被允许")
})

test("patch-policy: checkScope workbuddy 在职责内", () => {
  const result = checkScope("workbuddy", ["orchestrator", "task-planner"])
  assert(result.inScope, "workbuddy 应该有 orchestrator 权限")
})

test("patch-policy: checkScope workbuddy 越权", () => {
  const result = checkScope("workbuddy", ["nginx", "pm2"])
  assert(!result.inScope, "workbuddy 不应该有 nginx 权限")
  assert(result.outOfScope.length > 0)
})

// ============ branch-planner tests ============
test("branch-planner: generateBranchName 格式正确", () => {
  const name = generateBranchName("workbuddy", "orchestrator-core")
  assert(name === "feature/workbuddy-orchestrator-core-v1")
})

test("branch-planner: planBranchOrder 无依赖顺序", () => {
  const tasks = [
    { role: "workbuddy", task: "orchestrator-core" },
    { role: "codex", task: "ai-planner" },
  ]
  const order = planBranchOrder(tasks)
  assert(order.length === 2)
  assert(order[0].startsWith("feature/workbuddy"))
})

// ============ task-planner tests ============
test("task-planner: planTasks 返回 4 个角色", () => {
  const plan = planTasks("测试需求")
  assert(plan.length === 4, `期望 4 个角色，实际 ${plan.length}`)
})

test("task-planner: planTasks 包含 workbuddy", () => {
  const plan = planTasks("")
  const wb = plan.find(p => p.role === "workbuddy")
  assert(wb, "应该包含 workbuddy")
  assert(wb.patchFile === "workbuddy-orchestrator-core-v1.patch")
})

test("task-planner: validatePlan 全部合规", () => {
  const plan = planTasks("")
  const result = validatePlan(plan)
  assert(result.valid, `规划应该合规: ${result.violations.join("; ")}`)
})

// ============ orchestrator tests ============
test("orchestrator: scheduleAI 返回 report", async () => {
  const result = await scheduleAI({ userRequest: "测试" })
  assert(result.report, "应该返回 report")
  assert(result.version === "0.1")
  assert(result.plan, "应该返回 plan")
})

test("orchestrator: getStatus 返回版本和模式", () => {
  const status = getStatus()
  assert(status.version === "0.1")
  assert(status.mode === "plan-only")
  assert(status.supportedRoles.includes("workbuddy"))
})

test("orchestrator: reviewPatch 拒绝 main 分支", () => {
  const result = reviewPatch({
    role: "workbuddy",
    patchContent: "diff --git a/src/index.js",
    targetBranch: "main",
  })
  assert(!result.approved, "main 分支应该被拒绝")
})

// 运行所有测试
console.log("\n===== 测试结果 =====")
console.log(`✅ PASS: ${passed}`)
console.log(`❌ FAIL: ${failed}`)
process.exit(failed > 0 ? 1 : 0)
