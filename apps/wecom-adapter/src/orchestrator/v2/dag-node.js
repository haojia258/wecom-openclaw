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
 * @param {string}  [type]    - 节点类型: 'agent' (默认) | 'execution-plan' (P8.5.1)
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
}

/**
 * 从队列项创建 DAGNode
 * @param {object} item - { seq, agent, command, priority, reason, context, dependsOn? }
 * @returns {DAGNode}
 */
DAGNode.fromQueueItem = function (item) {
  var id = item.command || (item.agent + '_' + item.seq);

  // P8.5.1: 检测 execution-plan 类型节点
  var nodeType = 'agent';
  var cmd = (item.command || '').toLowerCase();
  if (/^(health_check_|npm_test_|test_result_|check_pm2|check_disk|audit_log|generate_audit|gateway_ping|bridge_chain|agent_host_verify|gateway_plan_only)/.test(cmd)) {
    nodeType = 'execution-plan';
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
 * 标记节点为 blocked
 * @param {string} reason - blocked 原因
 */
DAGNode.prototype.setBlocked = function (reason) {
  this.blocked = true;
  this.blockReason = reason || 'Unknown';
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
  };
  if (this.blockReason) obj.blockReason = this.blockReason;
  if (Object.keys(this.context).length > 0) obj.context = this.context;
  return obj;
};

module.exports = { DAGNode: DAGNode };
