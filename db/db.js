// redisClient.js
import { createClient } from "redis";
import dotenv from "dotenv";
dotenv.config();

const redis = createClient({
  // url: `redis://${process.env.REDIS_HOST || "localhost"}:${process.env.REDIS_PORT || 6379}`,
    url: `rediss://default:${process.env.REDIS_TOKEN}@exotic-raccoon-51584.upstash.io:6379`

});

redis.on('error', (err) => console.error('❌ Redis Error:', err));
redis.on('connect', () => console.log('✅ Connected to Redis'));

(async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
})();

// module.exports = redis
export default redis;
// import { createClient } from "redis";

// const redis = createClient({
//   url: `rediss://default:${process.env.REDIS_TOKEN}@exotic-raccoon-51584.upstash.io:6379`,
// });

// redis.on("error", (err) => console.error("❌ Redis Error:", err));
// redis.on("connect", () => console.log("✅ Connected to Redis"));

// if (!redis.isOpen) {
//   await redis.connect();
// }

// export default redis;