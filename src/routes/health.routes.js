const router = require('express').Router();
const database = require('../config/database');

router.get('/db-check', async (req, res) => {
  try {
    await database.checkConnection();

    res.status(200).json({
      success: true,
      message: 'Database connected successfully ✅',
      database: 'postgresql'
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
