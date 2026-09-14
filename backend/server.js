const log = require('./src/services/log');
const { app, config } = require('./src/app');
const { startSlaWatch } = require('./src/services/sla');

// The app lives in src/app.js so it can be read without opening a port.
app.listen(config.port, () => {
  log.info('listening', { port: config.port, production: config.isProduction });
});

// Started here rather than in src/app.js, so reading the app for the API
// reference never begins sweeping tickets.
startSlaWatch();
