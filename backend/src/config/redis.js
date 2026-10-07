const redis = require('redis');

const client = redis.createClient({
    socket: {
        host: process.env.REDIS_HOST || 'redis',
        port: Number(process.env.REDIS_PORT || 6379),
    }
});

client.on('error', (err) => {
    console.error('Redis Client Error:', err.message);
});

client.connect().catch((err) => {
    console.error('Redis initial connect failed:', err.message);
});

module.exports = client;
