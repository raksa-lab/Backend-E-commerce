const supabase = require('../config/supabase');

exports.getAllUsers = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at');

    if (error) return res.status(400).json(error);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, role, created_at')
      .eq('id', req.params.id)
      .single();

    if (error) return res.status(400).json(error);

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};