const categoriesRoutes = require('./routes/categories.routes');
const citiesRoutes = require('./routes/cities.routes');
const businessesRoutes = require('./routes/businesses.routes');

app.use('/api/categories', categoriesRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/businesses', businessesRoutes);
