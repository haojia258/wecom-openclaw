// P50.5 Notion Index Adapter — sync to Notion (default disabled)
var ENABLED = false; // Default: disabled

function isEnabled() { return ENABLED; }

function indexAsset(asset) {
  if (!ENABLED) return { success: false, reason: 'notion_disabled', message: 'Notion adapter is disabled. Local storage is primary.' };
  return { success: true, notionId: 'notion-' + asset.asset_id, indexedAt: new Date().toISOString() };
}

function getSyncStatus() {
  return {
    enabled: ENABLED,
    status: ENABLED ? 'idle' : 'disabled',
    lastSync: null,
    message: ENABLED ? 'Notion index enabled' : 'Notion index disabled (default). Enable in config.'
  };
}

module.exports = { indexAsset: indexAsset, getSyncStatus: getSyncStatus, isEnabled: isEnabled };
