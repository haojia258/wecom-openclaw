// P51 DAG Stage1 — signal to DAG pipeline that compass data is ready
var fs = require('fs');
var path = require('path');

var DAG_DIR = path.join(__dirname, '..', '..', 'storage', 'dag', 'stage1');
var SIGNAL_FILE = 'compass-import-ready.json';

function signalReady(importId, dataTypes) {
  if (!fs.existsSync(DAG_DIR)) fs.mkdirSync(DAG_DIR, { recursive: true });
  var signal = {
    ready: true,
    importId: importId,
    dataTypes: dataTypes || [],
    createdAt: new Date().toISOString(),
    source: 'compass-auto-import'
  };
  fs.writeFileSync(path.join(DAG_DIR, SIGNAL_FILE), JSON.stringify(signal, null, 2), 'utf8');
  return signal;
}

function getStage1Status() {
  var filePath = path.join(DAG_DIR, SIGNAL_FILE);
  if (!fs.existsSync(filePath)) return { ready: false, reason: 'no_signal' };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

module.exports = { signalReady: signalReady, getStage1Status: getStage1Status };
