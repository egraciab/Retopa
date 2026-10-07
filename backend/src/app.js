const express = require("express");
const rateLimit = require("express-rate-limit");

const app = express();

// Middlewares
app.use(express.json({ limit: '10mb' }));

// ── Rate limiting ────────────────────────────────────────────────
// Confiar en el proxy de Nginx delante (para leer IP real del cliente)
app.set('trust proxy', 1);

// Límite general para toda la API pública: 300 req/min por IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas solicitudes. Intentá en un momento.' },
    skip: (req) => req.path === '/health',
});

// Límite estricto para endpoints de escritura pública (reseñas, leads)
const writeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Límite de envíos alcanzado. Intentá más tarde.' },
});

app.use('/api/v2', apiLimiter);

// Exportar writeLimiter para uso en rutas específicas
app.locals.writeLimiter = writeLimiter;

// ============================================
// API v2 (RetoPA Directory)
// ============================================
const directoryRoutes   = require('./routes/directory');
const hybridRoutes      = require('./routes/search-hybrid');
const citiesRoutes      = require('./routes/cities');
const authPublicRoutes  = require('./routes/auth-public');
const adminRoutes       = require('./routes/admin');
const adminNotifyRoutes = require('./routes/admin.notify.routes');
const prospectsRoutes   = require('./routes/prospects.routes');
const claimV2Routes     = require('./routes/claim.routes');
const clientRoutes      = require('./routes/client');
const { adminUploadRouter, publicUploadRouter, clientUploadRouter, ambassadorUploadRouter } = require('./routes/upload');

app.use('/api/v2', hybridRoutes);
app.use('/api/v2', directoryRoutes);
app.use('/api/v2', citiesRoutes);
app.use('/api/v2/auth', authPublicRoutes);
app.use('/api/v2/admin/prospects', prospectsRoutes); // Prospectos (antes que adminRoutes por especificidad)
app.use('/api/v2/admin', adminRoutes);
app.use('/api/v2/admin/notify', adminNotifyRoutes);
app.use('/api/v2/claim',        claimV2Routes);
app.use('/api/v2/client', clientRoutes);
app.use('/api/v2/admin', adminUploadRouter);
app.use('/api/v2/client', clientUploadRouter);
app.use('/api/v2/ambassador', ambassadorUploadRouter);
app.use('/api/v2', publicUploadRouter);

// Promociones — S6.1
const { publicRouter: promoPublic, clientRouter: promoClient, adminRouter: promoAdmin } = require('./routes/promotions.routes');
app.use('/api/v2/promotions',        promoPublic);
app.use('/api/v2/client/promotions', promoClient);
app.use('/api/v2/admin/promotions',  promoAdmin);

// Embajadores — Sprint Embajador v2
const { ambRouter, adminAmbRouter } = require('./routes/ambassador.routes');
app.use('/api/v2/ambassador', ambRouter);      // panel embajador
app.use('/api/v2/admin',      adminAmbRouter); // cola admin → /api/v2/admin/ambassador/...

// Integración interna Hepta Cloud
const internalRoutes = require('./routes/internal.routes');
app.use('/api/v2/internal', internalRoutes);

// Health + root
app.get("/", (req, res) => {
    res.json({
        name: "Retopa API",
        message: "Backend online",
        version: "2.2.0",
        features: ["directory", "auth", "admin", "geo-search", "redis-cache", "fuzzy-search", "reviews", "cities"]
    });
});

module.exports = app;
