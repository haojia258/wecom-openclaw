var MockProvider = require('./mock-provider');
var PlaywrightProvider = null;
var OpenAPIProvider = null;
try { PlaywrightProvider = require('./playwright-provider'); } catch (e) {}
try { OpenAPIProvider = require('./openapi-provider'); } catch (e) {}

var activeProvider = 'mock';
var PROVIDERS = { mock: MockProvider };
if (PlaywrightProvider) PROVIDERS.playwright = PlaywrightProvider;
if (OpenAPIProvider) PROVIDERS.openapi = OpenAPIProvider;

function getProvider(name) { return PROVIDERS[name || activeProvider] || MockProvider; }
function setActive(name) { if (PROVIDERS[name]) activeProvider = name; return activeProvider; }
function getActive() { return activeProvider; }

module.exports = { getProvider: getProvider, setActive: setActive, getActive: getActive, PROVIDERS: PROVIDERS };
