import { ApiError } from '../utils/ApiError.js';
import logger from '../utils/logger.js';

const errorHandler = (
  err,
  req,
  res,
  next
) => {
  if (err instanceof ApiError) {
    logger.error('Error Handler:: Err: ', err);
    res.status(err.statusCode).json({ message: err.message });

  }
  else{

  res.status(500).json({ message: err.message });
  // console.log('Req.body: ', req);
  logger.error('Error Handler:: Err: ', err);
  logger.error(err);
  }
};
export default errorHandler;
