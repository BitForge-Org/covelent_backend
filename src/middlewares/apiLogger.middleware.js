import logger from '../utils/logger.js';

const apiLogger = (req, res, next) => {
  const now = new Date();

  res.on('finish', () => {
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;
    const contentLength = res.get('Content-Length') || 0;
    const responseTime = Date.now() - now.getTime();

    logger.http(
      `${method} ${url} ${status} ${contentLength} - ${responseTime} ms`
    );
  });

  next();
};

export default apiLogger;
