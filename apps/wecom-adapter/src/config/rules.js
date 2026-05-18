'use strict';

/**
 * rules.js - 运营规则阈值配置
 * v1.0 - 所有阈值集中管理，方便调整
 */

module.exports = {
  // GMV
  GMV_ZERO_ALERT:       true,        // GMV=0 时告警
  GMV_LOW_THRESHOLD:    100,         // 低于此值提示低

  // 订单
  ORDER_ZERO_ALERT:     true,        // 订单=0 时告警
  PENDING_SHIP_ALERT:   true,        // 有待发货时提醒

  // 售后/退款
  REFUND_RATE_HIGH:     0.30,       // 退款率 > 30% 高风险  
  REFUND_RATE_MEDIUM:   0.15,       // > 15% 中风险

  // 体验分
  EXPERIENCE_SCORE_LOW:      4.5,   // < 4.5 低分
  EXPERIENCE_SCORE_CRITICAL: 4.0,   // < 4.0 严重

  // SKU 利润
  MARGIN_LOW_THRESHOLD: 15,         // 毛利率 < 15% 提示

  // 活动建议
  ACTIVITY_SUGGEST_GMV:    500,     // GMV 高于此值建议关注活动
  ACTIVITY_SUGGEST_ORDERS: 10,     // 订单数高于此值建议关注活动

  // 补货（暂未用，预留）
  INVENTORY_LOW_DAYS:     3,       // 库存 < 3 天销量提示补货
};
