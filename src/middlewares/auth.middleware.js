const jwt = require('jsonwebtoken');
const { isUuid } = require('../utils/uuid');

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  const match = typeof authorization === 'string' && authorization.match(/^Bearer ([^\s]+)$/i);
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  if (!process.env.JWT_SECRET) return res.status(500).json({ message: 'Authentication is not configured' });

  try {
    const user = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!isUuid(user.id) || !['customer', 'admin'].includes(user.role)
      || !Number.isFinite(user.exp) || user.exp <= Math.floor(Date.now() / 1000)) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

exports.verifyToken = verifyToken;
exports.protect = verifyToken;
