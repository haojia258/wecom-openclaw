var store = require('./memory-store');
function handle(c) { var n = (c || '').toLowerCase().replace(/^\//, '').trim(); if (n.indexOf('memory') >= 0 || n.indexOf('记忆') >= 0) return store.search(); return { error: 'Try: /Memory 搜索' }; }
module.exports = { handle: handle };
