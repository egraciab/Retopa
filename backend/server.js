const express = require("express");
const redis = require("redis");

const app = express();
const port = process.env.PORT || 3000;
const categoriesRoutes = require('./src/routes/categories.routes');
const citiesRoutes = require('./src/routes/cities.routes');
const businessesRoutes = require('./src/routes/businesses.routes');
const claimsRoutes = require('./src/routes/claims.routes');
const pool = require('./src/db');
const authRoutes = require('./src/routes/auth.routes');
const adminBusinessesRoutes = require('./src/routes/admin.businesses.routes');
const adminClaimsRoutes = require('./src/routes/admin.claims.routes');

app.use(express.json());
app.use('/api/categories', categoriesRoutes);
app.use('/api/cities', citiesRoutes);
app.use('/api/businesses', businessesRoutes);
app.use('/api/business-claims', claimsRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/admin/businesses', adminBusinessesRoutes);
app.use('/api/admin/claims', adminClaimsRoutes);
app.use('/api/admin/categories', categoriesRoutes);

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
  },
});

redisClient.on("error", (err) => {
  console.error("Redis error:", err.message);
});

async function start() {
  try {
    await redisClient.connect();
    console.log("Connected to Redis");
  } catch (err) {
    console.error("Redis connect failed:", err.message);
  }

  app.get("/health", async (req, res) => {
    try {
      const db = await pool.query("SELECT NOW() AS now");
      let redisStatus = "ok";
      try {
        await redisClient.ping();
      } catch {
        redisStatus = "error";
      }

      res.json({
        status: "ok",
        app: "retopa-backend",
        db: db.rows[0].now,
        redis: redisStatus,
      });
    } catch (err) {
      res.status(500).json({
        status: "error",
        message: err.message,
      });
    }
  });

  app.get("/", (req, res) => {
    res.json({
      name: "Retopa API",
      message: "Backend online",
    });
  });

app.post("/businesses", async (req, res) => {
  try {
    const {
      name,
      address,
      phone,
      email,
      website,
      city_id,
      category_id,
      source,
      claimed,
      latitude,
      longitude
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "name es requerido" });
    }

    const lat = latitude !== undefined && latitude !== null ? Number(latitude) : null;
    const lng = longitude !== undefined && longitude !== null ? Number(longitude) : null;

    const result = await pool.query(
      `
      WITH inserted AS (
        INSERT INTO businesses
        (
          name, address, phone, email, website,
          city_id, category_id, source, claimed,
          latitude, longitude
        )
        VALUES
        (
          $1,$2,$3,$4,$5,
          $6,$7,COALESCE($8,'manual'),COALESCE($9,false),
          $10,$11
        )
        RETURNING id, name, latitude, longitude
      ),
      updated AS (
        UPDATE businesses b
        SET geom = CASE
          WHEN i.latitude IS NOT NULL AND i.longitude IS NOT NULL
          THEN ST_SetSRID(
            ST_MakePoint(
              i.longitude::double precision,
              i.latitude::double precision
            ),
            4326
          )
          ELSE NULL
        END,
        updated_at = NOW()
        FROM inserted i
        WHERE b.id = i.id
        RETURNING b.id, b.name
      )
      SELECT * FROM updated
      `,
      [
        name,
        address || null,
        phone || null,
        email || null,
        website || null,
        city_id || null,
        category_id || null,
        source || "manual",
        claimed ?? false,
        lat,
        lng
      ]
    );

    res.status(201).json({
      message: "Negocio creado",
      data: result.rows[0],
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: err.message,
    });
  }
});
  app.listen(port, "0.0.0.0", () => {
    console.log(`Backend running on port ${port}`);
  });
}

start();
