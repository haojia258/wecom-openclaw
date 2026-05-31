'use strict';

// P14.1 Video Material Engine — Segment Builder
var VALID_SEGMENT_TYPES = ['hook', 'pain_point', 'product_demo', 'trust_proof', 'offer', 'cta'];

var DEFAULT_SEGMENTS = [
  { type: 'hook',        name: '开头钩子',    duration: 3,  content: '' },
  { type: 'pain_point',  name: '用户痛点',    duration: 5,  content: '' },
  { type: 'product_demo',name: '产品演示',    duration: 8,  content: '' },
  { type: 'trust_proof', name: '信任背书',    duration: 5,  content: '' },
  { type: 'offer',       name: '优惠活动',    duration: 5,  content: '' },
  { type: 'cta',         name: '行动号召',    duration: 4,  content: '' }
];

function buildDefaultSegments(opts) {
  var duration = (opts && opts.duration) || 30;
  var ratio = duration / 30;
  return DEFAULT_SEGMENTS.map(function (seg) {
    return {
      type: seg.type,
      name: seg.name,
      duration: Math.round(seg.duration * ratio),
      content: seg.content
    };
  });
}

function validateSegment(segment) {
  var errors = [];
  if (!segment.type || VALID_SEGMENT_TYPES.indexOf(segment.type) < 0) {
    errors.push('Invalid segment type: ' + segment.type + ' (valid: ' + VALID_SEGMENT_TYPES.join(', ') + ')');
  }
  if (!segment.name) errors.push('Missing segment name');
  if (typeof segment.duration !== 'number' || segment.duration < 0) {
    errors.push('Invalid duration: ' + segment.duration);
  }
  return { valid: errors.length === 0, errors: errors };
}

function estimateSegmentDuration(segments) {
  if (!segments || segments.length === 0) return 0;
  return segments.reduce(function (sum, s) { return sum + (s.duration || 0); }, 0);
}

module.exports = {
  buildDefaultSegments: buildDefaultSegments,
  validateSegment: validateSegment,
  estimateSegmentDuration: estimateSegmentDuration,
  VALID_SEGMENT_TYPES: VALID_SEGMENT_TYPES,
  DEFAULT_SEGMENTS: DEFAULT_SEGMENTS
};
