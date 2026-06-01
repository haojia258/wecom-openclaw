var store = require('./activity-store');
var MOCKS = [
  { name: '618大促', type: 'promo', discount: 0.15, subsidy: 5000, startDate: '2026-06-15', endDate: '2026-06-19', status: 'upcoming', products: ['SKU-001', 'SKU-003'] },
  { name: '平台补贴', type: 'subsidy', discount: 0.08, subsidy: 3000, startDate: '2026-06-10', endDate: '2026-06-12', status: 'upcoming', products: ['SKU-002'] },
  { name: '商品卡活动', type: 'product_card', discount: 0.05, subsidy: 2000, startDate: '2026-06-05', endDate: '2026-06-09', status: 'running', products: ['SKU-001', 'SKU-005'] },
  { name: '节盟计划', type: 'festival', discount: 0.10, subsidy: 4000, startDate: '2026-06-20', endDate: '2026-06-22', status: 'upcoming', products: ['SKU-003', 'SKU-004'] },
  { name: '商城活动', type: 'mall', discount: 0.05, subsidy: 1500, startDate: '2026-06-08', endDate: '2026-06-11', status: 'upcoming', products: ['SKU-001', 'SKU-002'] }
];
function importMock() { MOCKS.forEach(function (a) { store.add(a); }); }
function getMocks() { return MOCKS; }
module.exports = { importMock: importMock, getMocks: getMocks };
