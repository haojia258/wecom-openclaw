// P51 Compass Command — entry points for all compass operations
var importer = require('./compass-importer');
var fieldMapping = require('./compass-field-mapping');
var validator = require('./compass-validator');
var history = require('./compass-history');
var jsonWriter = require('./compass-json-writer');
var dag = require('./compass-dag-stage1');
var audit = require('./compass-audit');

// Command routing
function handleCommand(cmd, args, userId) {
  var normalized = (cmd || '').toLowerCase().replace(/^\//, '').replace(/\s+/g, ' ').trim();

  if (normalized.indexOf('运营 罗盘状态') >= 0 || normalized.indexOf('罗盘导入 状态') >= 0 || normalized === 'p51 状态') {
    return getStatus();
  }
  if (normalized.indexOf('运营 罗盘导入') >= 0 || normalized.indexOf('罗盘导入 导入') >= 0 || normalized === 'p51 导入') {
    return { action: 'import', message: 'Import requires file upload via Web Console. Use /operations/compass to upload Excel.', requiresApproval: true };
  }
  if (normalized.indexOf('运营 罗盘校验') >= 0 || normalized.indexOf('罗盘导入 校验') >= 0 || normalized === 'p51 校验') {
    return { action: 'validate', message: 'Validation requires file upload via Web Console. Use /operations/compass.', types: fieldMapping.getTypes() };
  }
  if (normalized.indexOf('运营 罗盘映射') >= 0 || normalized === 'p51 映射') {
    return { types: fieldMapping.getTypes(), featureGate: 'COMPASS_MAPPING_EDIT=false' };
  }
  if (normalized.indexOf('运营 罗盘历史') >= 0 || normalized === 'p51 历史') {
    return { history: history.getAll() };
  }
  return { error: 'Unknown compass command. Try: 罗盘状态 / 罗盘导入 / 罗盘校验 / 罗盘映射 / 罗盘历史' };
}

function getStatus() {
  var types = fieldMapping.getTypes();
  var dagStatus = dag.getStage1Status();
  var latest = types.map(function (t) {
    var data = jsonWriter.readLatest(t.type);
    return data ? { type: t.type, name: t.name, rows: data.rows, updated: data.generatedAt } : { type: t.type, name: t.name, status: 'no data' };
  });
  return {
    status: 'active',
    feature: 'COMPASS_IMPORT_ENABLED=true',
    browserExport: 'disabled',
    dataTypes: types,
    latestData: latest,
    dagStage1: dagStatus,
    reviewOnly: true
  };
}

module.exports = { handleCommand: handleCommand, getStatus: getStatus };
