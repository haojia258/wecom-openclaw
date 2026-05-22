/**
 * task-graph-builder.js
 * Runtime Expansion Phase1 - Task Graph Builder
 *
 * 输出 DAG 结构：
 *   { nodes: [], edges: [], dependencies: [] }
 *
 * 预定义 DAG 模板（从 strategies/ 读取，fallback 内置）：
 *   - collect-data → analyze → review → publish
 *   - plan → execute → review → approve
 */

const path = require('path');
const fs = require('fs');

var STRATEGY_DIR = path.join(__dirname, 'runtime-expansion', 'strategies');

// 内置 DAG 模板
var BUILTIN_DAG_TEMPLATES = {
  'data-analysis': {
    name: 'data-analysis',
    description: '数据分析流程：采集 → 分析 → 审查 → 发布',
    nodes: [
      { id: 'collect-data', label: '采集数据', type: 'data', actor: 'planner-worker' },
      { id: 'analyze', label: '分析', type: 'process', actor: 'executor-worker' },
      { id: 'review', label: '审查', type: 'review', actor: 'review-worker' },
      { id: 'publish', label: '发布', type: 'output', actor: 'planner-worker' },
    ],
    edges: [
      { from: 'collect-data', to: 'analyze', label: '数据就绪' },
      { from: 'analyze', to: 'review', label: '分析完成' },
      { from: 'review', to: 'publish', label: '审查通过' },
    ],
    dependencies: {
      'analyze': ['collect-data'],
      'review': ['analyze'],
      'publish': ['review'],
    },
  },
  'code-change': {
    name: 'code-change',
    description: '代码变更流程：规划 → 执行 → 审查 → 批准',
    nodes: [
      { id: 'plan', label: '规划任务', type: 'plan', actor: 'planner-worker' },
      { id: 'execute', label: '执行变更', type: 'process', actor: 'executor-worker' },
      { id: 'review', label: '代码审查', type: 'review', actor: 'review-worker' },
      { id: 'approve', label: '批准部署', type: 'approval', actor: 'risk-worker' },
    ],
    edges: [
      { from: 'plan', to: 'execute', label: '规划完成' },
      { from: 'execute', to: 'review', label: '变更完成' },
      { from: 'review', to: 'approve', label: '审查通过' },
    ],
    dependencies: {
      'execute': ['plan'],
      'review': ['execute'],
      'approve': ['review'],
    },
  },
};

// 缓存
var _dagTemplateCache = null;

/**
 * 加载 DAG 模板（优先从 strategies/ 目录读取）
 */
function _loadDAGTemplates() {
  if (_dagTemplateCache) return _dagTemplateCache;

  var templates = Object.assign({}, BUILTIN_DAG_TEMPLATES);

  var dir = STRATEGY_DIR;
  if (fs.existsSync(dir)) {
    var files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.json'); });
    files.forEach(function (f) {
      try {
        var content = fs.readFileSync(path.join(dir, f), 'utf8');
        var cfg = JSON.parse(content);
        if (cfg.dag) {
          templates[cfg.name] = cfg.dag;
        }
      } catch (e) {
        // 跳过无效文件
      }
    });
  }

  _dagTemplateCache = templates;
  return templates;
}

/**
 * 构建任务 DAG
 *
 * @param {object} task - 任务对象
 * @param {string} [strategyName] - 策略名（data-analysis | code-change | auto）
 * @returns {object} { taskId, dag, warnings }
 */
function buildGraph(task, strategyName) {
  var taskId = (task && task.taskId) || 'unknown';

  // 自动选择策略
  var selected = strategyName || 'auto';
  if (selected === 'auto') {
    selected = selectStrategyByTask(task);
  }

  var templates = _loadDAGTemplates();
  var dagTemplate = templates[selected] || templates['data-analysis'];

  if (!dagTemplate) {
    return { error: 'No DAG template found for strategy: ' + selected };
  }

  // 深拷贝模板
  var dag = JSON.parse(JSON.stringify(dagTemplate));

  // 注入任务上下文
  dag.taskId = taskId;
  dag.intent = (task && task.intent) || 'unknown';
  dag.assignee = (task && task.assignee) || 'workbuddy';
  dag.builtAt = new Date().toISOString();

  var warnings = [];
  if (selected === 'auto') {
    warnings.push('Auto-selected strategy: ' + dag.name);
  }

  // 验证 DAG
  var validation = validateGraph(dag);
  if (!validation.valid) {
    warnings.push('DAG validation issues: ' + validation.issues.join('; '));
  }

  return {
    taskId: taskId,
    strategy: selected,
    dag: dag,
    warnings: warnings,
  };
}

/**
 * 根据任务自动选择策略
 */
function selectStrategyByTask(task) {
  if (!task) return 'data-analysis';

  var intent = (task.intent || '').toLowerCase();
  var userRequest = (task.userRequest || '').toLowerCase();

  if (intent === 'code_change' || userRequest.indexOf('代码') !== -1 || userRequest.indexOf('patch') !== -1) {
    return 'code-change';
  }

  return 'data-analysis';
}

/**
 * 验证 DAG 结构
 *
 * @param {object} graph - DAG 对象
 * @returns {object} { valid: boolean, issues: string[] }
 */
function validateGraph(graph) {
  var issues = [];

  if (!graph) {
    return { valid: false, issues: ['Graph is null or undefined'] };
  }

  var nodes = graph.nodes || [];
  var edges = graph.edges || [];
  var deps = graph.dependencies || {};

  // 1. 检查节点是否有 id
  var nodeIds = {};
  nodes.forEach(function (n) {
    if (!n.id) {
      issues.push('Node missing id');
    } else {
      if (nodeIds[n.id]) {
        issues.push('Duplicate node id: ' + n.id);
      }
      nodeIds[n.id] = true;
    }
  });

  // 2. 检查边的 from/to 是否都存在于节点中
  edges.forEach(function (e) {
    if (!nodeIds[e.from]) {
      issues.push('Edge from unknown node: ' + e.from);
    }
    if (!nodeIds[e.to]) {
      issues.push('Edge to unknown node: ' + e.to);
    }
  });

  // 3. 检查依赖是否形成环（简化版：检查直接自依赖）
  Object.keys(deps).forEach(function (nodeId) {
    var depList = deps[nodeId] || [];
    if (depList.indexOf(nodeId) !== -1) {
      issues.push('Self-dependency detected: ' + nodeId);
    }
  });

  // 4. 检查 DAG 是否连通（从第一个节点可达所有节点）
  if (nodes.length > 0) {
    var reachable = {};
    var queue = [nodes[0].id];
    while (queue.length > 0) {
      var curr = queue.shift();
      if (reachable[curr]) continue;
      reachable[curr] = true;
      edges.forEach(function (e) {
        if (e.from === curr && !reachable[e.to]) {
          queue.push(e.to);
        }
      });
    }
    nodes.forEach(function (n) {
      if (!reachable[n.id]) {
        issues.push('Unreachable node: ' + n.id);
      }
    });
  }

  return {
    valid: issues.length === 0,
    issues: issues,
  };
}

/**
 * 格式化 DAG 为 WeCom 可读文本
 *
 * @param {object} graphResult - buildGraph 的返回值
 * @returns {string}
 */
function formatGraphForWecom(graphResult) {
  if (graphResult.error) {
    return '❌ DAG 构建失败：' + graphResult.error;
  }

  var dag = graphResult.dag;
  if (!dag) return '❌ DAG 为空。';

  var lines = [
    '📊 任务 DAG：' + (dag.name || graphResult.strategy || ''),
    '',
    '任务 ID：' + graphResult.taskId,
    '意图：' + (dag.intent || 'unknown'),
    '指派：' + (dag.assignee || 'N/A'),
    '',
    '── 节点 ──',
  ];

  (dag.nodes || []).forEach(function (n) {
    lines.push('  [' + n.id + '] ' + n.label + ' (' + (n.type || 'unknown') + ') @' + (n.actor || 'unknown'));
  });

  lines.push('');
  lines.push('── 边 ──');

  (dag.edges || []).forEach(function (e) {
    lines.push('  ' + e.from + ' → ' + e.to + (e.label ? '（' + e.label + '）' : ''));
  });

  if (graphResult.warnings && graphResult.warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ 警告：');
    graphResult.warnings.forEach(function (w) {
      lines.push('  - ' + w);
    });
  }

  return lines.join('\n');
}

/**
 * 列出所有可用 DAG 模板
 */
function listDAGTemplates() {
  var templates = _loadDAGTemplates();
  return Object.keys(templates).map(function (name) {
    var tpl = templates[name];
    return {
      name: name,
      description: tpl.description || '',
      nodeCount: (tpl.nodes || []).length,
      edgeCount: (tpl.edges || []).length,
    };
  });
}

/**
 * 清除缓存（测试用）
 */
function clearCache() {
  _dagTemplateCache = null;
}

module.exports = {
  buildGraph: buildGraph,
  validateGraph: validateGraph,
  formatGraphForWecom: formatGraphForWecom,
  selectStrategyByTask: selectStrategyByTask,
  listDAGTemplates: listDAGTemplates,
  clearCache: clearCache,
  _BUILTIN_DAG_TEMPLATES: BUILTIN_DAG_TEMPLATES,
  _STRATEGY_DIR: STRATEGY_DIR,
};
