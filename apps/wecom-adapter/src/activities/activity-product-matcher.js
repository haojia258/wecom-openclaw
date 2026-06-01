// P53 Activity Product Matcher
var ALL_SKUS = [{ id: 'SKU-001', name: '夏季T恤', gmv: 45200, roi: 190, stock: 320, risk: 'low' }, { id: 'SKU-002', name: '防晒霜', gmv: 38000, roi: 175, stock: 85, risk: 'medium' }, { id: 'SKU-003', name: '运动鞋', gmv: 29000, roi: 210, stock: 45, risk: 'low' }, { id: 'SKU-004', name: '蓝牙耳机', gmv: 22000, roi: 155, stock: 12, risk: 'high' }, { id: 'SKU-005', name: '智能手表', gmv: 18500, roi: 230, stock: 8, risk: 'high' }];
function match(activity) {
  return (activity.products || []).map(function (pid) { var sku = ALL_SKUS.find(function (s) { return s.id === pid; }); return sku ? { activity: activity.name, sku: sku, matchScore: sku.roi > 180 ? 90 : sku.roi > 150 ? 70 : 50, stockSufficient: sku.stock > 20 } : { activity: activity.name, sku: { id: pid }, matchScore: 0 }; });
}
module.exports = { match: match, ALL_SKUS: ALL_SKUS };
