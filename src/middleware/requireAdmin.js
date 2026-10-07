const AuthService = require('../modules/auth/Service');

/**
 * Requires `Authorization: Bearer <session token>` from the admin wallet
 * sign-in (/api/auth/admin/verify). Sets req.admin = { address, expiresAt }.
 */
async function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Admin sign-in required' });
  }

  try {
    const session = await AuthService.resolveSession(token);
    if (!session) {
      return res.status(401).json({ success: false, message: 'Admin session expired — sign in again' });
    }
    req.admin = session;
    req.adminToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAdmin;
