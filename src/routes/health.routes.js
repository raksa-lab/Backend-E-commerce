const router = require('express').Router();
const supabase = require('../config/supabase');

router.get('/db-check', async (req, res) => {
  try {
    const { data, error } = await supabase.storage.listBuckets();

    if (error) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed ❌',
        error: error.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Database connected successfully ✅',
      bucketsCount: Array.isArray(data) ? data.length : 0
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Unexpected error',
      error: err.message
    });
  }
});

module.exports = router;