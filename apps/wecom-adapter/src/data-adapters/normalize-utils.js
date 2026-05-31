'use strict';

function pick(obj, paths, fallback = null) {
  for (const p of paths) {
    const val = p.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
    if (val !== undefined && val !== null && val !== '') return val;
  }
  return fallback;
}

function toNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalizeCommon(raw, source, map) {
  const missingFields = [];
  const out = {};
  for (const [key, paths] of Object.entries(map)) {
    const v = pick(raw, paths, null);
    const n = key === 'updatedAt' || key === 'source' ? v : toNumber(v);
    if (n === null || n === undefined || n === '') missingFields.push(key);
    out[key] = n;
  }
  out.updatedAt = out.updatedAt || new Date().toISOString();
  out.source = source;
  out.missingFields = missingFields;
  return out;
}

module.exports = {
  pick,
  toNumber,
  normalizeCommon,
};
