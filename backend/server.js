const redis = require("redis");
const app = require("./src/app");
const pool = require("./src/db");

const port = process.env.PORT || 3000;

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

  // Health endpoint
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

  app.listen(port, "0.0.0.0", () => {
    console.log(`Backend running on port ${port}`);
  });
}

start();
