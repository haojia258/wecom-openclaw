// P51 Compass Importer — main import pipeline
var parser = require('./compass-excel-parser');
var validator = require('./compass-validator');
var fieldMapping = require('./compass-field-mapping');
var jsonWriter = require('./compass-json-writer');
var dag = require('./compass-dag-stage1');
var history = require('./compass-history');
var audit = require('./compass-audit');

var REVIEW_ONLY = true;

function importFile(filePath, options) {
  options = options || {};
  var importId = 'cmp-' + Date.now().toString(36);

  // Step 1: Parse
  var parsed = parser.parse(filePath);
  if (parsed.error) { audit.logImportFailed({ importId: importId, status: 'failed', message: parsed.error, userId: options.userId }); return { success: false, error: parsed.error }; }

  // Step 2: Detect type
  var detectedType = options.type || fieldMapping.detectType(parsed.headers);
  if (!detectedType) { audit.logImportFailed({ importId: importId, status: 'failed', message: 'Cannot detect data type', userId: options.userId }); return { success: false, error: 'Cannot detect data type' }; }

  // Step 3: Validate
  var validation = validator.validate(parsed, detectedType);
  if (!validation.valid) { audit.logImportFailed({ importId: importId, status: 'failed', message: 'Validation failed: ' + validation.reason + ', coverage: ' + validation.coverage, userId: options.userId }); return { success: false, error: 'Validation failed', validation: validation }; }

  // Step 4: Map rows
  var mapped = parsed.rows.map(function (row) { return fieldMapping.mapRow(detectedType, row); });

  // Step 5: Write JSON
  var writeResult = jsonWriter.write(detectedType, mapped, importId);

  // Step 6: Signal DAG Stage1
  dag.signalReady(importId, [detectedType]);

  // Step 7: Record history
  history.add({ importId: importId, type: detectedType, typeName: validation.typeName, rows: mapped.length, sourceFile: parsed.sourceFile, status: 'success', userId: options.userId });

  // Step 8: Audit
  audit.logImportDone({ importId: importId, dataType: detectedType, status: 'success', message: 'Imported ' + mapped.length + ' rows to ' + writeResult.file, userId: options.userId });

  return { success: true, importId: importId, type: detectedType, typeName: validation.typeName, rows: mapped.length, validation: validation, output: writeResult, requiresApproval: REVIEW_ONLY };
}

function previewImport(filePath, limit) {
  return parser.preview(filePath, limit);
}

function validateFile(filePath) {
  var parsed = parser.parse(filePath);
  if (parsed.error) return parsed;
  return validator.validate(parsed);
}

module.exports = { importFile: importFile, previewImport: previewImport, validateFile: validateFile, REVIEW_ONLY: REVIEW_ONLY };
