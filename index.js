import express from "express";
import cors from "cors";
import fs from "fs";
import fg from "fast-glob";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pipeline } from "@xenova/transformers";
import redis from "./db/db.js"; // ✅ import
import { Server } from "socket.io";
import http from "http";

dotenv.config();

// ---------- Setup ----------
const USE_GEMINI = process.env.USE_GEMINI?.toLowerCase() === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_LLM = process.env.GEMINI_LLM || "gemini-1.5-flash";

let embedder = null;
if (!USE_GEMINI) {
  embedder = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
}

import {
  updatemessages,
  getusermessages,
  deletemessages,
} from "./helper/helper.js";

// create HTTP server with Express app

// ---------- Embedding ----------
async function embedTexts(texts) {
  if (USE_GEMINI) {
    console.log("Processing with Gemini Embeddings...");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "models/text-embedding-004",
    });

    const embeddings = [];
    for (const text of texts) {
      const result = await model.embedContent({
        content: { parts: [{ text }] },
      });
      embeddings.push(Float32Array.from(result.embedding.values));
    }
    return embeddings;
  } else {
    const results = [];
    for (const text of texts) {
      const out = await embedder(text);
      results.push(Float32Array.from(out.data[0]));
    }
    return results;
  }
}
import { v4 as uuidv4 } from "uuid"; // For generating unique IDs

// ---------- Text Chunking ----------
function chunkText(text, size = 1000, overlap = 200) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
  }
  return chunks;
}

async function loadTxtFiles(folder = "data") {
  const texts = [];
  const metadata = [];
  const files = await fg([`${folder}/*.txt`]);

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const chunks = chunkText(content);
    chunks.forEach((chunk, idx) => {
      texts.push(chunk);
      metadata.push({ source: file, chunk: idx });
    });
  }
  return [texts, metadata];
}
import { QdrantClient } from "@qdrant/js-client-rest";
const client1 = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.ODRANT_PASSWORD,
});
// ---------- Chroma Index ----------
async function buildChromaIndex(embeddings, texts, metad, collectionName) {
  try {
    const collections = await client1.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === collectionName
    );

    if (!exists) {
      await client1.createCollection(collectionName, {
        vectors: {
          size: 768,
          distance: "Cosine",
        },
      });
      console.log("Collection created!");
    } else {
      console.log("Collection already exists");
    }

    const points = embeddings.map((vector, idx) => ({
      id: uuidv4(),
      vector: Array.from(vector),
      payload: { original_text: texts[idx], meta: metad[idx] },
    }));

    await client1.upsert(collectionName, {
      wait: true,
      points,
    });

    console.log("Index build completed!");
  } catch (err) {
    console.error(" Could not build collection:", err);
  }
}

async function queryQdrant(queryEmb, k = 5, collectionName) {
  const response = await client1.search(
    collectionName, // first argument
    {
      vector: Array.from(queryEmb),
      limit: k,
      with_payload: true,
    }
  );

  response.forEach((point, idx) => {
    console.log(
      `${idx + 1}:`,
      point.payload.original_text,
      "| Score:",
      point.score
    );
  });

  return response;
}

// ---------- Express Setup ----------
const app = express();
const server1 = http.createServer(app);

app.use(express.json());
app.use(cors({ origin: ["http://localhost:3000", "*"] }));

// ---------- Chat Endpoint ----------
app.post("/chat", async (req, res) => {
  const { question } = req.body;
  let answer = "No model configured";
  let results = [];

  try {
    const qEmb = (await embedTexts([question]))[0];
    const queryRes = await queryQdrant(qEmb, 5, "rag-collection");
    const results = queryRes.map((point) => ({
      text: point.payload.original_text,
      meta: point.payload.meta,
      score: point.score,
    }));
    const context = results
      .map((r) => `${r.text}\n[source: ${r.meta?.source || "unknown"}]`)
      .join("\n---\n");

    const prompt = `
You are a helpful assistant. Use the following context passages to answer the user question.
If the information is not present in the context, say you don't know.

CONTEXT:
${context}

USER QUESTION:
${question}
`;
    if (USE_GEMINI && GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_LLM });
      const resp = await model.generateContent(prompt);
      answer = resp.response.text();
    }
  } catch (err) {
    console.error("Error in /chat:", err);
    answer = `Error: ${err.message}`;
  }

  res.json({ answer, sources: results });
});

// ---------- Main ----------
async function main() {
  try {
    const [texts, metad] = await loadTxtFiles("data");
    console.log(` Found ${texts.length} chunks. Embedding...`);
    const embs = await embedTexts(texts);
    console.log(` Got ${embs.length} embeddings.`);
    await buildChromaIndex(embs, texts, metad, "rag-collection");
    console.log(" Index built successfully!");
  } catch (err) {
    console.error("Error in main:", err);
  }
}
// main();

async function getAIAnswer(query) {
  const question = query;
  let answer = "No model configured";
  let results = [];

  try {
    const qEmb = (await embedTexts([question]))[0];
    const queryRes = await queryQdrant(qEmb, 5, "rag-collection");
    const results = queryRes.map((point) => ({
      text: point.payload.original_text,
      meta: point.payload.meta,
      score: point.score,
    }));
    const context = results
      .map((r) => `${r.text}\n[source: ${r.meta?.source || "unknown"}]`)
      .join("\n---\n");

    const prompt = `
You are a helpful assistant. Use the following context passages to answer the user question.
If the information is not present in the context, say you don't know.

CONTEXT:
${context}

USER QUESTION:
${question}
`;
    if (USE_GEMINI && GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: GEMINI_LLM });
      const resp = await model.generateContent(prompt);
      answer = resp.response.text();
    }
  } catch (err) {
    console.error("Error in /chat:", err);
    answer = `Error: ${err.message}`;
  }

  return { answer, sources: results };
}

// attach Socket.IO to the HTTP server
const io = new Server(server1, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

app.use(cors());

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Listen for sending message
  socket.on("send_message", async (message) => {
    console.log(`Message received from ${socket.id}:`, message);

    // Store message in Redis per user
    const existingMessages = await getusermessages(socket.id);
    const AIanswer = await getAIAnswer(message);
    message = { userquery: message, answer: AIanswer.answer };
    const updatedMessages = existingMessages
      ? [...existingMessages, message]
      : [message];
    await updatemessages(socket.id, updatedMessages);

    // Broadcast message to all clients
    io.emit("receive_message", message);
  });

  socket.on("reset", async () => {
    try {
      await redis.flushall(); // clears entire Redis cache
      console.log("Redis cache cleared!");
      socket.emit("reset_done", []);
    } catch (err) {
      console.error("Error clearing cache:", err);
    }
  });

  // Handle user disconnect
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.id}`);

    // Delete cached messages for this user
    await deletemessages(socket.id);
    console.log(`Deleted messages for user: ${socket.id}`);
  });
});

// ---------- Server Start ----------
const PORT = process.env.PORT || 9000;
server1.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
