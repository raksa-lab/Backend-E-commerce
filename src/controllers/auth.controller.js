const AuthService = require('../services/AuthService');
const HttpError = require('../utils/http-error');

const isEmail = (email) => typeof email === 'string'
  && email.length <= 254
  && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

const requireObjectBody = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object');
  }
};

const handleError = (res, error, fallback, defaultStatus = 500) => {
  if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
  if (error.code === '23505') return res.status(409).json({ message: 'Email is already registered' });
  return res.status(defaultStatus).json({ message: fallback });
};

exports.register = async (req, res) => {
  try {
    requireObjectBody(req.body);
    const { full_name, email, password } = req.body;
    if (typeof full_name !== 'string' || full_name.trim().length < 2 || full_name.trim().length > 100) {
      throw new HttpError(400, 'full_name must be between 2 and 100 characters');
    }
    if (!isEmail(email)) throw new HttpError(400, 'A valid email is required');
    if (typeof password !== 'string' || password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new HttpError(400, 'password must be at least 10 characters and at most 72 bytes');
    }
    const user = await AuthService.register({ full_name: full_name.trim(), email: email.trim().toLowerCase(), password });
    res.status(201).json(user);
  } catch (err) {
    return handleError(res, err, 'Registration failed');
  }
};

exports.login = async (req, res) => {
  try {
    requireObjectBody(req.body);
    const { email, password } = req.body;
    if (!isEmail(email) || typeof password !== 'string' || password.length < 1 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new HttpError(400, 'A valid email and password are required');
    }
    const user = await AuthService.login(email.trim().toLowerCase(), password);
    res.json({
      message: "Login successful ✅",
      token: user.token,
      user
    });
  } catch (err) {
    return handleError(res, err, 'Login failed');
  }
};

exports.googleLogin = async (req, res) => {
  try {
    requireObjectBody(req.body);
    const { idToken } = req.body;
    if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 8192) {
      throw new HttpError(400, 'A valid Google ID token is required');
    }
    const user = await AuthService.googleLogin(idToken);
    res.json({
      message: "Google login successful ✅",
      token: user.token,
      user
    });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ message: error.message });
    return res.status(401).json({ message: 'Google authentication failed' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const profile = await AuthService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    return handleError(res, err, 'Profile lookup failed');
  }
};
