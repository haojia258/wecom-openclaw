'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadSnapshots, saveSnapshots, appendSnapshot } = require('../memory/memory-store');
const { analyzeTrends } = require('../memory/trend-analysis');

const tmp = path.resolve(process.cwd(), 'storage/ops-memory/test-snapshots.json');
if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

saveSnapshots([{ gmv: 1 }, { gmv: 2 }], tmp);
let loaded = loadSnapshots(tmp);
assert(loaded.length === 2, 'should load snapshots');

appendSnapshot({ gmv: 3 }, { filePath: tmp, max: 2 });
loaded = loadSnapshots(tmp);
assert(loaded.length === 2, 'should trim by max');

const mockPath = path.resolve(process.cwd(), 'apps/wecom-adapter/src/ai/tests/mock-snapshots/snapshots.json');
const mock = JSON.parse(fs.readFileSync(mockPath, 'utf8'));
const trends = analyzeTrends(mock);
assert(trends.summary.some((x) => x.includes('GMV连续下降')), 'should detect gmv down');
assert(trends.summary.some((x) => x.includes('风险等级连续升高')), 'should detect risk up');

console.log('test-memory passed');
