// require('dotenv').config();
// const app = require('./app');

// const PORT = process.env.PORT || 5000;

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


require('dotenv').config();
const app = require('./app');
const supabase = require('./config/supabase');

const PORT = process.env.PORT || 5000;

// Function to check database connection
async function checkDatabaseConnection() {
  try {
    const { error } = await supabase.storage.listBuckets();

    if (error) {
      console.log('❌ Database connection failed:', error.message);
    } else {
      console.log('✅ Database connected successfully');
    }
  } catch (err) {
    console.log('❌ Database error:', err.message);
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  await checkDatabaseConnection();
});