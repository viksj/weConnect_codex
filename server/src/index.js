import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { createUser, getContacts, getConversation, messages, saveMessage, users } from "./store.js";
import { detectLanguage, translateText } from "./translationService.js";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const socketToUser = new Map();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "translation-chat-server" });
});

app.post("/api/register", (req, res) => {
  const { name, emailOrPhone } = req.body;

  if (!name || !emailOrPhone) {
    res.status(400).json({ error: "Name and email or phone are required." });
    return;
  }

  const user = createUser(req.body);
  res.status(201).json({ user, otp: "123456" });
});

app.post("/api/verify-otp", (req, res) => {
  const { code } = req.body;
  res.json({ verified: code === "123456" });
});

app.get("/api/users/:userId/contacts", (req, res) => {
  res.json({ contacts: getContacts(req.params.userId) });
});

app.get("/api/users/:userId/conversations/:contactId", (req, res) => {
  res.json({ messages: getConversation(req.params.userId, req.params.contactId) });
});

app.get("/api/messages", (_req, res) => {
  res.json({ messages });
});

io.on("connection", (socket) => {
  socket.on("user:online", ({ userId }) => {
    if (!users.has(userId)) return;

    socketToUser.set(socket.id, userId);
    users.get(userId).online = true;
    socket.join(userId);
    io.emit("contacts:update", Array.from(users.values()));
  });

  socket.on("message:send", ({ senderId, receiverId, text }) => {
    const sender = users.get(senderId);
    const receiver = users.get(receiverId);

    if (!sender || !receiver || !text?.trim()) return;

    const sourceLanguage = detectLanguage(text, sender.motherTongue);
    const translatedText = translateText(text, sourceLanguage, receiver.motherTongue);
    const message = saveMessage({
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

    if (userId && users.has(userId)) {
      users.get(userId).online = false;
      io.emit("contacts:update", Array.from(users.values()));
    }
  });
});

server.listen(port, () => {
  console.log(`Translation chat server running on http://localhost:${port}`);
});
