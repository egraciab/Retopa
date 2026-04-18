// src/utils/response.js

function success(res, data = [], meta = null) {
  return res.json({
    success: true,
    data,
    ...(meta && { meta })
  });
}

function error(res, message = 'Error', status = 500, errors = null) {
  return res.status(status).json({
    success: false,
    message,
    ...(errors && { errors })
  });
}

module.exports = {
  success,
  error
};
