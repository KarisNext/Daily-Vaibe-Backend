// backend/test-routes.js
const express = require('express');
const app = express();

app.use(express.json());

const systemServicesRoutes = require('./routes/admin/systemServices');
const geoRoutes = require('./routes/admin/geo');

app.use('/api/admin/system-services', systemServicesRoutes);
app.use('/api/admin/geo', geoRoutes);

app.get('/test', (req, res) => {
  res.json({ message: 'Test route working' });
});

const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test routes:`);
  console.log(`  GET  http://localhost:${PORT}/test`);
  console.log(`  GET  http://localhost:${PORT}/api/admin/system-services/cleanup/stats`);
  console.log(`  GET  http://localhost:${PORT}/api/admin/geo/stats`);
  console.log(`  POST http://localhost:${PORT}/api/admin/system-services/cleanup/manual`);
});