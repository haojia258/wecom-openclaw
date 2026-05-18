'use strict';

require('dotenv').config({ path: '../../.env' });

const axios = require('axios');

const WECOM_ADAPTER_URL = process.env.WECOM_ADAPTER_URL || 'http://wecom-adapter:3001';
const WECOM_WEBHOOK_URL = process.env.WECOM_WEBHOOK_URL || '';

// ─── Mock 数据生成 ──────────────────────────────────────────────────
function getMockData() {
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  return {
    date: new Date().toLocaleDateString('zh-CN'),
    gmv: rand(18000, 35000),
    orders: rand(80, 200),
    refunds: rand(2, 15),
    pendingShipment: rand(5, 30),
    avgOrderValue: rand(150, 350),
    topProduct: '爆款商品A',
    topProductSales: rand(30, 80),
  };
}

// ─── 生成建议（基于 Mock 数据）──────────────────────────────────────
function generateAdvice(data) {
  const advice = [];

  if (data.refunds > 10) {
    advice.push('退款数较高，建议检查商品质量和描述准确性');
  } else {
    advice.push('退款率正常，继续保持商品质量');
  }

  if (data.pendingShipment > 20) {
    advice.push(`待发货订单积压 ${data.pendingShipment} 单，需加快发货速度`);
  }

  if (data.gmv > 25000) {
    advice.push(`今日 GMV 表现良好（¥${data.gmv.toLocaleString()}），可适当加大投流`);
  }

  advice.push('建议在下午 3-5 点流量高峰期发布新品或优惠活动');

  return advice;
}

// ─── 格式化日报文本 ─────────────────────────────────────────────────
function formatReport(data) {
  const advice = generateAdvice(data);
  const adviceText = advice.map((a, i) => `${i + 1}. ${a}`).join('\n');

  return `【抖店日报】
日期：${data.date}
GMV：¥ ${data.gmv.toLocaleString()}
订单数：${data.orders}
退款数：${data.refunds}
待发货：${data.pendingShipment}
核心建议：
${adviceText}

📊 数据来源：Mock（MVP 阶段）
🕐 生成时间：${new Date().toLocaleTimeString('zh-CN')}`;
}

// ─── 推送到企业微信群机器人 ─────────────────────────────────────────
async function pushToWecom(reportText) {
  if (!WECOM_WEBHOOK_URL) {
    console.log('[Report] 未配置 WECOM_WEBHOOK_URL，跳过推送');
    return false;
  }

  try {
    const response = await axios.post(
      WECOM_WEBHOOK_URL,
      {
        msgtype: 'text',
        text: {
          content: reportText,
        },
      },
      { timeout: 10000 }
    );

    if (response.data?.errcode === 0) {
      console.log('[Report] ✅ 日报已推送到企业微信');
      return true;
    } else {
      console.error('[Report] 推送失败:', response.data);
      return false;
    }
  } catch (e) {
    console.error('[Report] 推送异常:', e.message);
    return false;
  }
}

// ─── 主入口 ─────────────────────────────────────────────────────────
async function generateAndPushReport() {
  console.log('[Report] 开始生成日报...');

  const data = getMockData();
  const reportText = formatReport(data);

  console.log('\n' + '='.repeat(50));
  console.log(reportText);
  console.log('='.repeat(50) + '\n');

  const pushed = await pushToWecom(reportText);

  return {
    report: reportText,
    data,
    pushed,
    time: new Date().toISOString(),
  };
}

// 直接运行时立即生成日报
if (require.main === module) {
  generateAndPushReport()
    .then((result) => {
      console.log('[Report] 完成，推送状态:', result.pushed ? '成功' : '跳过/失败');
      process.exit(0);
    })
    .catch((e) => {
      console.error('[Report] 生成失败:', e);
      process.exit(1);
    });
}

module.exports = { generateAndPushReport, getMockData, formatReport };
