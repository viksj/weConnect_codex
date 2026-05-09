import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { createDatabase } from "./db/index.js";
import { detectLanguage, translateText } from "./translationService.js";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const socketToUser = new Map();
const onlineUsers = new Set();
const database = createDatabase();

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || origin.startsWith("exp://")) {
      callback(null, true);
      return;
    }
    callback(null, true);
  }
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: true, methods: ["GET", "POST"] }
});

function withOnlineStatus(user) {
  return {
    ...user,
    online: onlineUsers.has(user.id)
  };
}

async function broadcastContacts() {
  const users = await database.listUsers();
  io.emit("contacts:update", users.map(withOnlineStatus));
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "translation-chat-server",
    database: process.env.DB_PROVIDER || "memory"
  });
});

app.post("/api/register", async (req, res) => {
  const { name, emailOrPhone } = req.body;

  if (!name || !emailOrPhone) {
    res.status(400).json({ error: "Name and email or phone are required." });
    return;
  }

  try {
    const user = await database.createUser(req.body);
    res.status(201).json({ user: withOnlineStatus(user) });
  } catch (error) {
    console.error("Unable to register user", error);
    res.status(500).json({ error: "Unable to register user." });
  }
});

app.post("/api/verify-otp", (req, res) => {
  const { code } = req.body;
  res.json({ verified: code === "123456" });
});

app.get("/api/users/:userId/contacts", async (req, res) => {
  try {
    const contacts = await database.getContacts(req.params.userId);
    res.json({ contacts: contacts.map(withOnlineStatus) });
  } catch (error) {
    console.error("Unable to fetch contacts", error);
    res.status(500).json({ error: "Unable to fetch contacts." });
  }
});

app.get("/api/users/:userId/conversations/:contactId", async (req, res) => {
  try {
    const messages = await database.getConversation(req.params.userId, req.params.contactId);
    res.json({ messages });
  } catch (error) {
    console.error("Unable to fetch conversation", error);
    res.status(500).json({ error: "Unable to fetch conversation." });
  }
});

app.get("/api/messages", async (_req, res) => {
  try {
    const messages = await database.listMessages();
    res.json({ messages });
  } catch (error) {
    console.error("Unable to fetch messages", error);
    res.status(500).json({ error: "Unable to fetch messages." });
  }
});

io.on("connection", (socket) => {
  socket.on("user:online", async ({ userId }) => {
    const user = await database.getUserById(userId);
    if (!user) return;

    socketToUser.set(socket.id, userId);
    onlineUsers.add(userId);
    socket.join(userId);
    await broadcastContacts();
  });

  socket.on("message:send", async ({ senderId, receiverId, text }) => {
    const sender = await database.getUserById(senderId);
    const receiver = await database.getUserById(receiverId);

    if (!sender || !receiver || !text?.trim()) return;

    const sourceLanguage = detectLanguage(text, sender.motherTongue);
    const translatedText = translateText(text, sourceLanguage, receiver.motherTongue);
    const message = await database.saveMessage({
      id: uuid(),
      senderId,
      receiverId,
      originalText: text.trim(),
      translatedText,
      sourceLanguage,
      targetLanguage: receiver.motherTongue,
      createdAt: new Date().toISOString(),
      status: "delivered"
    });

    io.to(senderId).emit("message:new", message);
    io.to(receiverId).emit("message:new", message);
  });

  socket.on("call:signal", (payload) => {
    io.to(payload.receiverId).emit("call:incoming", {
      ...payload,
      createdAt: new Date().toISOString()
    });
  });

  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);
    socketToUser.delete(socket.id);

    if (userId) {
      onlineUsers.delete(userId);
      broadcastContacts().catch((error) => console.error("Unable to broadcast contacts", error));
    }
  });
});

database
  .init()
  .then(() => {
    server.listen(port, () => {
      console.log(`Translation chat server running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed", error);
    process.exit(1);
  });
