// P52 Browser Operator — simulated browser operations (REVIEW_ONLY)
var REVIEW_ONLY = true;
function navigate(page) { return { success: true, page: page, status: 'simulated', message: 'Navigated to ' + page + ' (REVIEW_ONLY, no real browser)' }; }
function click(selector) { return { success: true, clicked: selector, status: 'simulated' }; }
function fill(selector, value) { return { success: true, filled: selector, value: value, status: 'simulated' }; }
module.exports = { navigate: navigate, click: click, fill: fill, REVIEW_ONLY: REVIEW_ONLY };
