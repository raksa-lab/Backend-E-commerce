const db = require('../config/database');
const HttpError = require('../utils/http-error');
const { requireUuid } = require('../utils/uuid');

exports.getAllUsers = async (req, res) => {
  const { data, error } = await db
    .from('users')
    .select('id, full_name, email, role, created_at');

  if (error) throw error;

  res.json(data);
};

exports.getUserById = async (req, res) => {
  requireUuid(req.params.id, 'id');
  const { data, error } = await db
    .from('users')
    .select('id, full_name, email, role, created_at')
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new HttpError(404, 'User not found');

  res.json(data);
};
