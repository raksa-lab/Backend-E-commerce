const db = require('../config/database');

exports.create = (data) => db.from('users').insert([data]).select('*').single();
exports.findById = (id) => db.from('users').select('*').eq('id', id).maybeSingle();
exports.findByEmail = (email) => db.from('users').select('*').eq('email', email).maybeSingle();
exports.findAll = () => db.from('users').select('id, full_name, email, role, created_at');
