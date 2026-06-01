// P51 Compass Preview — preview import data before committing
var importer = require('./compass-importer');
var fieldMapping = require('./compass-field-mapping');

function preview(filePath, limit) {
  return importer.previewImport(filePath, limit || 10);
}

function previewWithMapping(filePath) {
  var result = importer.previewImport(filePath, 5);
  if (result.error) return result;
  var type = fieldMapping.detectType(result.headers);
  var mapping = type ? fieldMapping.getMapping(type) : null;
  var missing = type ? fieldMapping.getMissingFields(type, result.headers) : [];
  return {
    headers: result.headers,
    preview: result.preview,
    totalRows: result.totalRows,
    detectedType: type,
    typeName: mapping ? mapping.name : 'unknown',
    missingFields: missing,
    sourceFile: result.sourceFile
  };
}

module.exports = { preview: preview, previewWithMapping: previewWithMapping };
