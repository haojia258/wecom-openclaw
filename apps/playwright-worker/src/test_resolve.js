const path = require('path');
console.log('__dirname:', __dirname);
console.log('PROJECT_ROOT:', path.resolve(__dirname, '..', '..', '..'));
console.log('PROFILE:', path.join(path.resolve(__dirname, '..', '..', '..'), 'storage', 'browser-profile'));
