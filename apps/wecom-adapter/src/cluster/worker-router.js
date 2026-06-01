var ROUTES={web:'main',kpi:'main',board:'main',brain:'main',dispatch:'main',analysis:'node-a',content:'node-a',risk:'node-a',oss_radar:'japan',review:'japan',memory:'japan'};
function route(type){return ROUTES[type]||'auto'}
module.exports={route:route,ROUTES:ROUTES};
