const express = require("express");

const app = express();

// Middlewares
app.use(express.json());

// Routes
const categoriesRoutes = require('./routes/categories.routes');
const citiesRoutes = require('./routes/cities.routes');
const businessesRoutes = require('./routes/businesses.routes');
const claimsRoutes = require('./routes/claims.routes');
const authRoutes = require('./routes/auth.routes');
const adminBusinessesRoutes = require('./routes/admin.businesses.routes');
const adminClaimsRoutes = require('./routes/admin.claims.routes');

// Public API
app.use('/api/categories', categoriesRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/businesses', businessesRoutes);
app.use('/api/business-claims', claimsRoutes);

// Auth
app.use('/api/auth', authRoutes);

// Admin
app.use('/api/admin/businesses', adminBusinessesRoutes);
app.use('/api/admin/claims', adminClaimsRoutes);
app.use('/api/admin/categories', categoriesRoutes);

// Health + root
app.get("/", (req, res) => {
  res.json({
    name: "Retopa API",
    message: "Backend online",
  });
});

module.exports = app;
