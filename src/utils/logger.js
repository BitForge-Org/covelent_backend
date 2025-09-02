import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'blue',
  },
};

winston.addColors(customLevels.colors);

const logFormat = printf(({ level, message, timestamp, stack }) => {
  return `${timestamp} [${level}]: ${stack || message}`;
});

const logger = winston.createLogger({
  levels: customLevels.levels,

  level: 'http',
  format: combine(
    colorize(), // colors in console
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }), // include stack traces for errors
    logFormat
  ),
  transports: [
    new winston.transports.Console(), // log to console
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If in production, don’t use console transport
if (process.env.NODE_ENV === 'production') {
  logger.remove(new winston.transports.Console());
}

export default logger;
