import redis from "../db/db.js"; // ✅ ESM import


export async function updatemessages(username, messagedata) {
  await redis.set(`username:${username}`, JSON.stringify(messagedata));
}

export async function getusermessages(username) {
  const data = await redis.get(`username:${username}`);
  return data ? JSON.parse(data) : null;
}

export async function deletemessages(username) {
  await redis.del(`username:${username}`);
}

export async function getmessages() {
  const keys = await redis.keys("username:*");
  if (keys.length === 0) return [];

  const values = await redis.mget(keys);
  return values.map((v) => JSON.parse(v));
}