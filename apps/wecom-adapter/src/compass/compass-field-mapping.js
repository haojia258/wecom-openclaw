// P51 Compass Field Mapping — 8 data types with full field mappings
var MAPPINGS = {
  overview: {
    name: '核心概览', fields: {
      '日期': 'date', '成交金额': 'pay_amount', '成交订单数': 'order_cnt', '成交人数': 'user_cnt',
      '商品总访客数': 'uv_total', '商品点击人数': 'click_uv', '退款金额': 'refund_amount', '支付ROI': 'roi'
    }
  },
  transaction: {
    name: '成交分析', fields: {
      '日期': 'date', '成交金额': 'pay_amount', '成交订单数': 'order_cnt', '成交人数': 'user_cnt',
      '客单价': 'avg_price', '退款金额': 'refund_amount', '退款率': 'refund_rate'
    }
  },
  products: {
    name: '商品明细', fields: {
      '商品ID': 'product_id', '商品标题': 'product_name', '类目': 'category', '价格': 'price',
      '访客数': 'uv', '点击数': 'click_cnt', '点击率': 'ctr', '成交订单': 'order_cnt',
      '成交金额': 'gmv', '转化率': 'cvr', '退款订单': 'refund_order_cnt', '退款金额': 'refund_amount',
      '库存': 'stock', '上架时间': 'listed_at'
    }
  },
  videos: {
    name: '短视频明细', fields: {
      '视频ID': 'video_id', '发布时间': 'publish_time', '标题': 'title', '播放量': 'play_cnt',
      '完播率': 'finish_rate', '点赞': 'like_cnt', '评论': 'comment_cnt', '转发': 'share_cnt',
      '带货点击': 'product_click_cnt', '成交订单': 'order_cnt', '成交金额': 'gmv', 'ROI': 'roi'
    }
  },
  live: {
    name: '直播明细', fields: {
      '直播ID': 'live_id', '开播时间': 'start_time', '时长': 'duration', '观看人数': 'watch_uv',
      '人均观看时长': 'avg_watch_duration', '互动率': 'interaction_rate', '成交订单': 'order_cnt',
      '成交金额': 'gmv', '转化率': 'cvr', '场均UV价值': 'uv_value'
    }
  },
  audience: {
    name: '人群画像', fields: {
      '人群类型': 'audience_type', '性别占比': 'gender_ratio', '年龄分布': 'age_dist',
      '地域': 'province', '城市': 'city', '消费层级': 'consume_level',
      '兴趣标签': 'interest_tags', '设备类型': 'device_type'
    }
  },
  service: {
    name: '售后客服', fields: {
      '日期': 'date', '退款订单数': 'refund_order_cnt', '退款金额': 'refund_amount',
      '退款率': 'refund_rate', '客服响应时长': 'service_response_time',
      '满意度': 'satisfaction_score', '差评数': 'bad_review_cnt'
    }
  },
  product_card: {
    name: '商品卡', fields: {
      '日期': 'date', '商品卡访客': 'card_uv', '商品卡成交金额': 'card_gmv',
      '商品卡订单': 'card_order_cnt', '搜索流量占比': 'search_ratio', '商城推荐占比': 'mall_recommend_ratio'
    }
  }
};

function detectType(headers) {
  if (!headers || !headers.length) return null;
  var best = null, bestScore = 0;
  Object.keys(MAPPINGS).forEach(function (type) {
    var fields = Object.keys(MAPPINGS[type].fields);
    var matches = headers.filter(function (h) { return fields.indexOf(h) >= 0; }).length;
    var score = matches / Math.max(fields.length, 1);
    if (score > bestScore && score > 0.2) { bestScore = score; best = type; }
  });
  return best;
}

function mapRow(type, row) {
  var mapping = MAPPINGS[type];
  if (!mapping) return null;
  var mapped = {};
  Object.keys(row).forEach(function (key) {
    var target = mapping.fields[key];
    if (target) mapped[target] = row[key];
  });
  return mapped;
}

function getMapping(type) { return MAPPINGS[type] || null; }
function getTypes() { return Object.keys(MAPPINGS).map(function (k) { return { type: k, name: MAPPINGS[k].name, fieldCount: Object.keys(MAPPINGS[k].fields).length }; }); }
function getRequiredFields(type) { var m = MAPPINGS[type]; return m ? Object.keys(m.fields) : []; }
function getMissingFields(type, headers) { var required = getRequiredFields(type); return required.filter(function (f) { return headers.indexOf(f) === -1; }); }

module.exports = { detectType: detectType, mapRow: mapRow, getMapping: getMapping, getTypes: getTypes, getRequiredFields: getRequiredFields, getMissingFields: getMissingFields, MAPPINGS: MAPPINGS };
