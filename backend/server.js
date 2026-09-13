const log = require('./src/services/log');
const { app, config } = require('./src/app');

// The app lives in src/app.js so it can be read without opening a port.
app.listen(config.port, () => {
  log.info('listening', { port: config.port, production: config.isProduction });
});
