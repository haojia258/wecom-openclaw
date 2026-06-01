// P50.5 NAS Adapter — upload to NAS (default disabled)
var ENABLED = false; // Default: disabled, only local storage

var MOCK_NAS_PATH = '/mnt/openclaw-nas/assets';

function isEnabled() { return ENABLED; }

function uploadAsset(assetId, localPath) {
  if (!ENABLED) return { success: false, reason: 'nas_disabled', message: 'NAS adapter is disabled. Local storage is primary.' };
  // Simulated upload
  return { success: true, nasPath: MOCK_NAS_PATH + '/' + assetId, uploadedAt: new Date().toISOString() };
}

function getSyncStatus() {
  return {
    enabled: ENABLED,
    path: MOCK_NAS_PATH,
    status: ENABLED ? 'idle' : 'disabled',
    lastSync: null,
    message: ENABLED ? 'NAS sync available' : 'NAS sync disabled (default). Enable in config.'
  };
}

module.exports = { uploadAsset: uploadAsset, getSyncStatus: getSyncStatus, isEnabled: isEnabled };
