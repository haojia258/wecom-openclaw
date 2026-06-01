// P50.3 Image Collector
function collect(url, options) { options = options || {}; return { type: 'image', source_url: url, format: options.format || 'png', size: 102400, collected_at: new Date().toISOString(), success: true }; }
module.exports = { collect: collect };
