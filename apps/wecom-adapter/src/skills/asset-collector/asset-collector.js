'use strict';

/**
 * asset-collector.js — P17.1 Asset Collector
 *
 * Mock data generator and scanner. REVIEW_ONLY.
 */

var MOCK_ASSETS = [
  { name: 'hero-banner-main.jpg', type: 'image', category: 'marketing', format: 'jpg', size: 245000, tags: ['banner', 'hero', 'marketing'], productId: 'prd-mock-001' },
  { name: 'product-shot-1.png', type: 'image', category: 'product', format: 'png', size: 820000, tags: ['product', 'commerce'], productId: 'prd-mock-001' },
  { name: 'product-shot-2.png', type: 'image', category: 'product', format: 'png', size: 910000, tags: ['product', 'commerce'], productId: 'prd-mock-001' },
  { name: 'promo-video-q1.mp4', type: 'video', category: 'marketing', format: 'mp4', size: 15000000, tags: ['video', 'marketing', 'promo'], productId: null },
  { name: 'instruction-manual.pdf', type: 'document', category: 'support', format: 'pdf', size: 3200000, tags: ['document', 'support', 'manual'], productId: 'prd-mock-002' },
  { name: 'logo-brand.svg', type: 'image', category: 'brand', format: 'svg', size: 12000, tags: ['brand', 'logo'], productId: null },
  { name: 'icon-cart.png', type: 'image', category: 'ui', format: 'png', size: 8000, tags: ['icon', 'ui'], productId: null },
  { name: 'screenshot-dashboard.png', type: 'image', category: 'demo', format: 'png', size: 450000, tags: ['screenshot', 'demo'], productId: null },
  { name: 'config-site.json', type: 'config', category: 'system', format: 'json', size: 2000, tags: ['config', 'data'], productId: null },
  { name: 'hero-banner-main.jpg', type: 'image', category: 'marketing', format: 'jpg', size: 245000, tags: ['banner', 'hero'], productId: 'prd-mock-001' }
];

var MOCK_PRODUCTS = [
  { id: 'prd-mock-001', name: '酸辣粉-经典款', sku: 'SLF-001', category: '食品' },
  { id: 'prd-mock-002', name: '酸辣粉-升级款', sku: 'SLF-002', category: '食品' }
];

function collectMockAssets(assetReg) {
  var ids = [];
  MOCK_ASSETS.forEach(function (a) {
    var id = assetReg.register(a).id;
    ids.push(id);
  });
  return { count: ids.length, ids: ids };
}

function collectMockProducts(prodReg, assetReg) {
  MOCK_PRODUCTS.forEach(function (p) {
    var prod = prodReg.register(p);
    // Link related assets
    assetReg.list({ productId: p.id }).forEach(function (a) {
      prodReg.linkAsset(p.id, a.id);
    });
  });
  return MOCK_PRODUCTS.length;
}

function getMockAssets() { return MOCK_ASSETS; }
function getMockProducts() { return MOCK_PRODUCTS; }

module.exports = {
  collectMockAssets: collectMockAssets, collectMockProducts: collectMockProducts,
  getMockAssets: getMockAssets, getMockProducts: getMockProducts
};
