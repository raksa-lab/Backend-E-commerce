const AuthService = require('../services/AuthService');

exports.register = async (req, res) => {
  try {
    const user = await AuthService.register(req.body);
    res.status(201).json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await AuthService.login(email, password);
    res.json({
      message: "Login successful ✅",
      token: user.token,
      user
    });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
};

exports.googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    const user = await AuthService.googleLogin(idToken);
    res.json({
      message: "Google login successful ✅",
      token: user.token,
      user
    });
  } catch (error) {
    res.status(401).json({
      message: "Google authentication failed",
      error: error.message
    });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const profile = await AuthService.getProfile(req.user.id);
    res.json(profile);
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};