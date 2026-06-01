// P51 Compass API — unified API surface
var importer = require('./compass-importer');
var fieldMapping = require('./compass-field-mapping');
var validator = require('./compass-validator');
var history = require('./compass-history');
var jsonWriter = require('./compass-json-writer');
var dag = require('./compass-dag-stage1');
var audit = require('./compass-audit');
var command = require('./compass-command');

module.exports = {
  getStatus: command.getStatus,
  importFile: importer.importFile,
  previewImport: importer.previewImport,
  validateFile: importer.validateFile,
  getMapping: fieldMapping.getMapping,
  getTypes: fieldMapping.getTypes,
  getHistory: history.getAll,
  deleteHistory: history.deleteById,
  detectType: fieldMapping.detectType,
  getDagStatus: dag.getStage1Status,
  audit: audit
};
