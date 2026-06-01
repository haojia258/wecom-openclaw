"use strict";
/**
 * P61 Skill Layer — Unified SkillResult wrapper.
 * All skills output this shape so Agent Runtime can parse uniformly.
 */
function SkillResult(skill, data, meta) {
  return {
    skill: skill,
    status: data && data.error ? "error" : "success",
    data: data || {},
    meta: Object.assign({ timestamp: new Date().toISOString(), reviewOnly: true }, meta || {}),
    error: data && data.error ? data.error : null
  };
}

/** Shortcut: error-only result */
function SkillError(skill, message) {
  return SkillResult(skill, { error: message });
}

module.exports = { SkillResult: SkillResult, SkillError: SkillError };
