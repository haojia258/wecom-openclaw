// P51 Compass Validator — validate parsed data against field mapping
var fieldMapping = require('./compass-field-mapping');

function validate(parsedData, detectedType) {
  var headers = parsedData.headers;
  var type = detectedType || fieldMapping.detectType(headers);

  if (!type) return { valid: false, reason: 'unknown_type', message: 'Cannot detect data type. Check column headers.' };

  var mapping = fieldMapping.getMapping(type);
  var required = Object.keys(mapping.fields);
  var present = required.filter(function (f) { return headers.indexOf(f) >= 0; });
  var missing = required.filter(function (f) { return headers.indexOf(f) === -1; });
  var extra = headers.filter(function (h) { return required.indexOf(h) === -1; });

  var coverage = Math.round((present.length / required.length) * 100);
  var valid = coverage >= 50; // 60% field match is acceptable

  return {
    valid: valid,
    detectedType: type,
    typeName: mapping.name,
    requiredFields: required.length,
    matchedFields: present.length,
    missingFields: missing,
    extraFields: extra,
    coverage: coverage + '%',
    rows: parsedData.rows.length,
    sourceFile: parsedData.sourceFile,
    warnings: missing.length > 0 ? ['Missing fields: ' + missing.join(', ')] : []
  };
}

function quickCheck(headers) {
  var type = fieldMapping.detectType(headers);
  if (!type) return { valid: false, reason: 'unknown_type' };
  var missing = fieldMapping.getMissingFields(type, headers);
  return { valid: missing.length === 0, type: type, typeName: fieldMapping.getMapping(type).name, missing: missing };
}

module.exports = { validate: validate, quickCheck: quickCheck };
