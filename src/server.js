// حاويات برو — الخادم الرئيسي
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { login } = require('./auth');
const { startJobs } = require('./cron');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// الواجهات البرمجية
app.post('/api/login', login);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/co', require('./routes/company'));
app.use('/api/hr', require('./routes/hr'));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date() }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ حاويات برو يعمل على http://localhost:${PORT}`);
  startJobs();
});
