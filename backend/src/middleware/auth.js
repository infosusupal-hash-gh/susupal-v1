const crypto = require('crypto');
const prisma = require('../prisma/client');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }

  const token = authHeader.split(' ')[1];
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  try {
    const session = await prisma.userSession.findUnique({
      where: { token_hash: tokenHash },
      include: { user: { select: { id: true, phone: true, name: true, is_active: true } } },
    });

    if (!session || session.expires_at < new Date()) {
      return res.status(401).json({ error: 'Session expired. Please login again.' });
    }

    if (!session.user.is_active) {
      return res.status(403).json({ error: 'Account suspended. Please contact support.' });
    }

    req.user = session.user;
    req.sessionId = session.id;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate };