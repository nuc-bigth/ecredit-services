const authenticationMiddleware = require('./authentication');

function optionalAuthentication(req, res, next) {
  if (!req.get('Authorization')) return next();
  return authenticationMiddleware(req, res, next);
}

module.exports = optionalAuthentication;