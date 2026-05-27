'use strict';

/**
 * DAGNode — DAG 并行调度器节点
 *
 * 每个节点代表 DAG 中的一个可调度单元（Agent + 命令）。
 * 通过 dependsOn 定义依赖关系，支持拓扑排序和并行阶段分组。
 */

/**
 * @param {string}  id        - 唯一标识符（使用 command 作为 ID）
 * @param {string}  agent     - Agent 名称 (codex/workbuddy/deepseek/doubao)
 * @param {string}  command   - 命令名称
 * @param {number}  priority  - 优先级 (1-5)
 * @param {string}  reason    - 原因/描述
 * @param {string[]} dependsOn - 依赖的节点 ID 列表（空数组 = 根节点）
 * @param {object}  [context] - 上下文数据
 * @param {string}  [type]    - 节点类型: 'agent' (默认) | 'execution-plan' (P8.5.1) | 'retry' | 'recovery' (P9.1)
 */
function DAGNode(id, agent, command, priority, reason, dependsOn, context, type) {
  this.id = id;
  this.agent = agent;
  this.command = command;
  this.priority = priority;
  this.reason = reason;
  this.dependsOn = Array.isArray(dependsOn) ? dependsOn.slice() : [];
  this.context = context || {};
  this.blocked = false;
  this.blockReason = null;
  this.type = type || 'agent';
  // P9.1: 执行状态
  this.state = DAGNodeState.PENDING;
  this.stateReason = null;
  this.failureType = null;
}

/**
 * DAGNode 执行状态枚举 (P9.1)
 */
var DAGNodeState = {
  PENDING:          'PENDING',
  RUNNING:          'RUNNING',
  SUCCESS:          'SUCCESS',
  FAILED:           'FAILED',
  FAILED_RETRYABLE: 'FAILED_RETRYABLE',
  RETRYING:         'RETRYING',
  RECOVERING:       'RECOVERING',
  RECOVERED:        'RECOVERED',
  BLOCKED:          'BLOCKED'
};

/**
 * 从队列项创建 DAGNode
 * @param {object} item - { seq, agent, command, priority, reason, context, dependsOn?, type? }
 * @returns {DAGNode}
 */
DAGNode.fromQueueItem = function (item) {
  var id = item.command || (item.agent + '_' + item.seq);

  // 保留传入的 type（P9.1: retry/recovery 节点）
  var nodeType = item.type || 'agent';

  if (nodeType === 'agent') {
    // P8.5.1: 检测 execution-plan 类型节点
    var cmd = (item.command || '').toLowerCase();
    if (/^(health_check_|npm_test_|test_result_|check_pm2|check_disk|audit_log|generate_audit|gateway_ping|bridge_chain|agent_host_verify|gateway_plan_only)/.test(cmd)) {
      nodeType = 'execution-plan';
    }
  }

  return new DAGNode(
    id,
    item.agent,
    item.command,
    item.priority,
    item.reason,
    item.dependsOn || [],
    item.context,
    nodeType
  );
};

/**
 * 创建 retry 节点 (P9.1)
 * @param {string} baseId     - 基础节点 ID
 * @param {number} attempt    - 重试次数
 * @param {object} original   - 原始节点信息
 * @returns {DAGNode}
 */
DAGNode.createRetryNode = function(baseId, attempt, original) {
  var node = new DAGNode(
    'retry_' + baseId + '_' + attempt,
    original.agent || 'workbuddy',
    original.command || 'retry',
    (original.priority || 3) + 1, // 重试优先级稍低
    'Retry attempt ' + attempt + ' for: ' + (original.reason || baseId),
    original.dependsOn || [],
    original.context || {},
    'retry'
  );
  node.state = DAGNodeState.RETRYING;
  return node;
};

/**
 * 创建 recovery 节点 (P9.1)
 * @param {string} baseId       - 基础节点 ID
 * @param {object} recoveryStep - 恢复步骤
 * @returns {DAGNode}
 */
DAGNode.createRecoveryNode = function(baseId, recoveryStep) {
  var node = new DAGNode(
    recoveryStep.action || ('recovery_' + baseId),
    recoveryStep.agent || 'workbuddy',
    recoveryStep.command || 'recover',
    recoveryStep.seq <= 2 ? 1 : 2,
    recoveryStep.description || 'Recovery step',
    recoveryStep.dependsOn || [],
    recoveryStep.context || {},
    'recovery'
  );
  node.state = DAGNodeState.RECOVERING;
  return node;
};

/**
 * 标记节点为 blocked
 * @param {string} reason - blocked 原因
 */
DAGNode.prototype.setBlocked = function (reason) {
  this.blocked = true;
  this.blockReason = reason || 'Unknown';
  this.state = DAGNodeState.BLOCKED;
  this.stateReason = reason;
};

/**
 * 设置节点执行状态 (P9.1)
 * @param {string} state       - DAGNodeState 值
 * @param {string} [reason]    - 状态变更原因
 * @param {string} [failureType] - 故障类型（FAILED 时）
 */
DAGNode.prototype.setState = function (state, reason, failureType) {
  this.state = state;
  if (reason) this.stateReason = reason;
  if (failureType) this.failureType = failureType;
};

/**
 * 序列化为普通对象
 * @returns {object}
 */
DAGNode.prototype.toJSON = function () {
  var obj = {
    id: this.id,
    agent: this.agent,
    command: this.command,
    priority: this.priority,
    reason: this.reason,
    dependsOn: this.dependsOn,
    blocked: this.blocked,
    type: this.type,
    state: this.state,
  };
  if (this.blockReason) obj.blockReason = this.blockReason;
  if (this.stateReason) obj.stateReason = this.stateReason;
  if (this.failureType) obj.failureType = this.failureType;
  if (Object.keys(this.context).length > 0) obj.context = this.context;
  return obj;
};

module.exports = { DAGNode: DAGNode, DAGNodeState: DAGNodeState };
