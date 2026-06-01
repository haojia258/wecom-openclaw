function render() {
  return { generatedAt: new Date().toISOString(), revenue: { total: 158000, trend: '+2.5%', status: 'green' }, profit: { total: 25500, margin: '16.1%', status: 'green' }, roi: { value: 1.8, status: 'green' }, risk: { level: 'medium', alerts: 4 }, budget: { allocated: 50000, spent: 32000, remaining: 18000 }, cashflow: { inflow: 158000, outflow: 132500, net: 25500 }, activities: { revenue: 45000, roi: 2.1 }, assets: { total: 12, score: 78 }, reviewOnly: true };
}
module.exports = { render: render };
