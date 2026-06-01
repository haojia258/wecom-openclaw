// P50.3 Video Collector
function collect(url, options) { options = options || {}; return { type: 'video', source_url: url, format: options.format || 'mp4', size: 5242880, collected_at: new Date().toISOString(), success: true }; }
module.exports = { collect: collect };
