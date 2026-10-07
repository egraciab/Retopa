/**
 * RETOPA — Upload de imágenes
 *
 * Dos routers separados:
 *   adminUploadRouter  → montado en /api/v2/admin → POST /upload  (requiere x-admin-key)
 *   publicUploadRouter → montado en /api/v2        → POST /upload/public (abierto)
 *
 * Sharp comprime todo a WebP antes de guardar en disco.
 */

const express = require('express');
const multer  = require('multer');
const sharp   = require('sharp');
const path    = require('path');
const fs      = require('fs');
const rateLimit = require('express-rate-limit');

// SEGURIDAD: la subida pública (sin login) se limita por IP para evitar abuso de
// almacenamiento / spam de imágenes.
const publicUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 15,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: 'Demasiadas subidas. Probá de nuevo en unos minutos.' },
});

// ── Auth ──────────────────────────────────────────────────────────────────────
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../config/jwt');
const ROLE_LEVEL = { godmode: 4, admin: 3, client: 2, user: 1 };

function requireAdminJWT(req, res, next) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if ((ROLE_LEVEL[decoded.role] || 0) < ROLE_LEVEL['admin'])
            return res.status(403).json({ success: false, error: 'Sin permisos' });
        req.user = decoded;
        next();
    } catch(e) {
        return res.status(401).json({ success: false, error: 'Token inválido' });
    }
}

// ── Directorio de destino ─────────────────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads/images';
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Multer — memoria (sharp procesa antes de escribir en disco) ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // Multer 2.x: usar MulterError para rechazos de fileFilter
      const err = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
      err.message = 'Formato no soportado. Usá JPG, PNG, WebP o GIF.';
      cb(err, false);
    }
  },
});

// ── Helper: comprimir con sharp y guardar ─────────────────────────────────────
async function processAndSave(buffer, type, businessId) {
  const filename   = `${type}-${businessId || 'tmp'}-${Date.now()}.webp`;
  const outputPath = path.join(UPLOADS_DIR, filename);

  const config = {
    logo:    { w: 400,  h: 400,  quality: 85 },
    cover:   { w: 1200, h: 500,  quality: 82 },
    gallery: { w: 800,  h: 800,  quality: 85 },
    pub:     { w: 400,  h: 400,  quality: 85 },
  };
  const c = config[type] || config.pub;

  await sharp(buffer)
    .resize(c.w, c.h, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: c.quality, effort: 4 })
    .toFile(outputPath);

  return `/uploads/images/${filename}`;
}

// ── Router ADMIN (requiere x-admin-key) ───────────────────────────────────────
// Montado en /api/v2/admin → ruta final: POST /api/v2/admin/upload
const adminUploadRouter = express.Router();

adminUploadRouter.post('/upload',
  requireAdminJWT,
  upload.fields([
    { name: 'logo',  maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const businessId = req.body.business_id || null;
      const result = {};

      if (req.files?.logo?.[0]) {
        const url = await processAndSave(req.files.logo[0].buffer, 'logo', businessId);
        result.logo_url  = url;
        result.image_url = url;
      }
      if (req.files?.cover?.[0]) {
        result.cover_url = await processAndSave(req.files.cover[0].buffer, 'cover', businessId);
      }

      if (!result.logo_url && !result.cover_url)
        return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });

      res.json({ success: true, data: result });
    } catch (err) {
      console.error('[Upload/admin]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── Router PÚBLICO (sin auth, solo logo) ─────────────────────────────────────
// Montado en /api/v2 → ruta final: POST /api/v2/upload/public
const publicUploadRouter = express.Router();

publicUploadRouter.post('/upload/public',
  publicUploadLimiter,
  upload.fields([{ name: 'logo', maxCount: 1 }]),
  async (req, res) => {
    try {
      if (!req.files?.logo?.[0])
        return res.status(400).json({ success: false, error: 'No se recibió imagen' });

      const url = await processAndSave(req.files.logo[0].buffer, 'logo', 'pub');
      res.json({ success: true, data: { image_url: url } });
    } catch (err) {
      console.error('[Upload/public]', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ── GET /upload/health (sin auth, para verificar que la ruta existe) ─────────
adminUploadRouter.get('/upload/health', (req, res) => {
  const fs = require('fs');
  const UPLOADS_DIR = process.env.UPLOADS_DIR || '/uploads/images';
  const dirOk = fs.existsSync(UPLOADS_DIR);
  let sharpOk = false;
  try { require('sharp'); sharpOk = true; } catch(e) {}
  res.json({ ok: true, sharp: sharpOk, uploads_dir: UPLOADS_DIR, dir_exists: dirOk });
});

// ── Router CLIENTE (requiere JWT, logo + cover por empresa propia) ────────────
// Montado en /api/v2/client → ruta final: POST /api/v2/client/upload
const clientUploadRouter = express.Router();
const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST || 'postgres', port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || process.env.POSTGRES_DB,
    user: process.env.DB_USER || process.env.POSTGRES_USER,
    password: process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD,
});

clientUploadRouter.post('/upload',
    upload.fields([
        { name: 'logo',    maxCount: 1 },
        { name: 'cover',   maxCount: 1 },
        { name: 'gallery', maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const token = (req.headers.authorization || '').replace('Bearer ', '');
            if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
            let decoded;
            try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) {
                return res.status(401).json({ success: false, error: 'Token inválido' });
            }

            const { business_slug, focal_x, focal_y } = req.body;
            if (!business_slug) return res.status(400).json({ success: false, error: 'business_slug requerido' });

            const check = await pool.query(
                `SELECT b.id FROM businesses b
                 JOIN user_businesses ub ON ub.business_id=b.id
                 WHERE b.slug=$1 AND ub.user_id=$2 AND ub.can_edit=TRUE`,
                [business_slug, decoded.id]
            );
            if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso a esta empresa' });

            const bizId = check.rows[0].id;
            const result = {};

            if (req.files?.logo?.[0]) {
                const url = await processAndSave(req.files.logo[0].buffer, 'logo', bizId);
                result.logo_url = url; result.image_url = url;
                await pool.query('UPDATE businesses SET image_url=$1, updated_at=NOW() WHERE id=$2', [url, bizId]);
            }
            if (req.files?.cover?.[0]) {
                const url = await processAndSave(req.files.cover[0].buffer, 'cover', bizId);
                result.cover_url = url;
                const fx = Math.min(100, Math.max(0, parseInt(focal_x) || 50));
                const fy = Math.min(100, Math.max(0, parseInt(focal_y) || 50));
                await pool.query(
                    'UPDATE businesses SET cover_url=$1, cover_focal_x=$2, cover_focal_y=$3, updated_at=NOW() WHERE id=$4',
                    [url, fx, fy, bizId]
                );
                result.focal_x = fx; result.focal_y = fy;
            }
            if (req.files?.gallery?.[0]) {
                const { getPlanLimits } = require('../utils/plan-limits');
                const planRes = await pool.query(
                    `SELECT plan_type, (SELECT COUNT(*) FROM business_gallery WHERE business_id=$1) AS count
                     FROM businesses WHERE id=$1`,
                    [bizId]
                );
                const planRow   = planRes.rows[0];
                const limits    = await getPlanLimits(planRow.plan_type);
                const maxGallery = limits.max_gallery;
                if (!limits.has_gallery || maxGallery === 0)
                    return res.status(400).json({ success: false, error: 'Tu plan no incluye galería de imágenes' });
                if (parseInt(planRow.count) >= maxGallery)
                    return res.status(400).json({ success: false, error: `Límite de ${maxGallery} imágenes para tu plan` });

                const url = await processAndSave(req.files.gallery[0].buffer, 'gallery', bizId);
                result.gallery_url = url;
            }

            if (!result.logo_url && !result.cover_url && !result.gallery_url)
                return res.status(400).json({ success: false, error: 'No se recibió ninguna imagen' });

            res.json({ success: true, data: result });
        } catch(err) {
            res.status(500).json({ success: false, error: err.message });
        }
    }
);

// ── PATCH /focal — guardar focal point sin subir nueva imagen ────────────────
clientUploadRouter.patch('/focal', async (req, res) => {
    try {
        const token = (req.headers.authorization || '').replace('Bearer ', '');
        if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
        let decoded;
        try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) {
            return res.status(401).json({ success: false, error: 'Token inválido' });
        }
        const { business_slug, focal_x, focal_y } = req.body;
        if (!business_slug) return res.status(400).json({ success: false, error: 'business_slug requerido' });

        const check = await pool.query(
            `SELECT b.id FROM businesses b JOIN user_businesses ub ON ub.business_id=b.id
             WHERE b.slug=$1 AND ub.user_id=$2 AND ub.can_edit=TRUE`,
            [business_slug, decoded.id]
        );
        if (!check.rows.length) return res.status(403).json({ success: false, error: 'Sin acceso' });

        const fx = Math.min(100, Math.max(0, parseInt(focal_x) || 50));
        const fy = Math.min(100, Math.max(0, parseInt(focal_y) || 50));
        await pool.query(
            'UPDATE businesses SET cover_focal_x=$1, cover_focal_y=$2, updated_at=NOW() WHERE id=$3',
            [fx, fy, check.rows[0].id]
        );
        res.json({ success: true, data: { focal_x: fx, focal_y: fy } });
    } catch(err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = { adminUploadRouter, publicUploadRouter, clientUploadRouter };

// ── Router EMBAJADOR (JWT, solo logo de fichas propias) ───────────────────────
// Montado en /api/v2/ambassador → POST /api/v2/ambassador/upload
const ambassadorUploadRouter = express.Router();

ambassadorUploadRouter.post('/upload',
    upload.fields([{ name: 'logo', maxCount: 1 }]),
    async (req, res) => {
        try {
            const token = (req.headers.authorization || '').replace('Bearer ', '');
            if (!token) return res.status(401).json({ success: false, error: 'Token requerido' });
            let decoded;
            try { decoded = jwt.verify(token, JWT_SECRET); } catch(e) {
                return res.status(401).json({ success: false, error: 'Token inválido' });
            }

            const { business_id } = req.body;
            if (!business_id) return res.status(400).json({ success: false, error: 'business_id requerido' });

            // Verificar que la ficha pertenezca al embajador
            const check = await pool.query(
                `SELECT b.id FROM businesses b
                 JOIN ambassador_businesses ab ON ab.business_id = b.id
                 WHERE b.id = $1 AND ab.ambassador_id = $2`,
                [parseInt(business_id), decoded.id]
            );
            // Admin/godmode pueden subir a cualquier ficha
            const isAdmin = ['admin','godmode'].includes(decoded.role);
            if (!check.rows.length && !isAdmin)
                return res.status(403).json({ success: false, error: 'Sin acceso a esta ficha' });

            const bizId = parseInt(business_id);
            if (!req.files?.logo?.[0])
                return res.status(400).json({ success: false, error: 'Adjuntá un archivo de logo' });

            const url = await processAndSave(req.files.logo[0].buffer, 'logo', bizId);
            await pool.query('UPDATE businesses SET image_url=$1, updated_at=NOW() WHERE id=$2', [url, bizId]);

            res.json({ success: true, data: { image_url: url, logo_url: url } });
        } catch(err) {
            console.error('[Upload/ambassador]', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    }
);

module.exports = { adminUploadRouter, publicUploadRouter, clientUploadRouter, ambassadorUploadRouter };