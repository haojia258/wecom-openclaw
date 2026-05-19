'use strict';

const assert = require('assert');
const { evaluate } = require('../score-model');
const sample = require('./mock-data/sample');

const healthy = evaluate(sample.healthy);
const risky = evaluate(sample.risky);

assert(healthy.totalScore.score > risky.totalScore.score, 'healthy score should be greater');
assert(risky.aftersaleRisk.score < 100, 'risky aftersale should be penalized');

console.log('test-score-model passed');
