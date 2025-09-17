# Backend Setup

In this backend, I have implemented the following features:

## 1. Redis Connection (Upstash)
- Set up the Redis connection using **Upstash**.
- Steps:
  1. Visit the official [Upstash site](https://upstash.com/).
  2. Register and fetch the **Redis URL** and **Redis Token**.
  3. Use the URL and token to establish a connection with Upstash Redis.

## 2. Qdrant Database Integration
- Registered and connected to **Qdrant** using its API.
- Used Qdrant to store **Google GenAI generated embeddings**.

## 3. Google Generative AI Embeddings
- Configured **Google Generative AI** model.
- Converted text into embeddings for storage and querying.

## 4. Document Processing
- Placed documents inside the `data/` folder.
- A main method:
  - Converts all documents into embeddings.
  - Stores the embeddings inside **Qdrant** database.

## 5. WebSocket Communication
- Connected the backend with WebSockets to listen for frontend messages.
- Steps:
  1. Receive user messages via WebSocket.
  2. Convert user messages into embeddings.
  3. Query Qdrant database for relevant documents.

## 6. Response Generation
- Passed relevant documents (as context) along with user queries to **Google GenAI**.
- Generated the final AI response.
- Sent the response back to the user through WebSockets.