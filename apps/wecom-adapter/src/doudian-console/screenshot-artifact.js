// P52 Screenshot Artifact
var fs = require('fs'); var path = require('path');
var ARTIFACT_DIR = path.join(__dirname, '..', '..', 'artifacts', 'doudian-console', 'screenshots');
function capture(pageName) {
  var id = 'screenshot-' + Date.now().toString(36);
  var artifact = { id: id, type: 'screenshot', page: pageName, capturedAt: new Date().toISOString(), size: { width: 1440, height: 900 }, url: '/artifacts/doudian-console/screenshots/' + id + '.png', description: 'Screenshot of 抖店后台 - ' + (pageName || 'Dashboard') + ' (REVIEW_ONLY simulated)' };
  if (!fs.existsSync(ARTIFACT_DIR)) fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, id + '.json'), JSON.stringify(artifact, null, 2), 'utf8');
  return artifact;
}
module.exports = { capture: capture };
