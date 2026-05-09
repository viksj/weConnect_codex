import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuid } from "uuid";
import { createDatabase } from "./db/index.js";
import { firebaseAdminAuth, verifyFirebaseToken } from "./firebaseAdmin.js";
import { detectLanguage, translateText } from "./translationService.js";
import { encryptMessage, decryptMessage } from "./encryptionService.js";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === "production";
const dbProvider = (process.env.DB_PROVIDER || "memory").toLowerCase();
const socketToUser = new Map();
const onlineUsers = new Set();
const database = createDatabase();

if (isProduction && dbProvider === "memory") {
  throw new Error("DB_PROVIDER=memory is not allowed when NODE_ENV=production.");
}

if (isProduction && !firebaseAdminAuth) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is required when NODE_ENV=production.");
}

function parseCsv(value) {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) || [];
}

const allowedOrigins = new Set(
  parseCsv(process.env.CLIENT_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
);
const allowedExpoOrigins = parseCsv(process.env.EXPO_ORIGINS || "exp://");

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  return allowedExpoOrigins.some((allowedOrigin) => origin.startsWith(allowedOrigin));
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin is not allowed by CORS."));
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "100kb" }));

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST"]
  }
});

function withOnlineStatus(user) {
  return {
    ...user,
    online: onlineUsers.has(user.id)
  };
}

function getPublicClientUrl() {
  return Array.from(allowedOrigins)[0] || "http://localhost:5173";
}

function getBearerToken(req) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : "";
}

async function requireFirebaseAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      res.status(401).json({ error: "Authentication token is required." });
      return;
    }

    req.firebaseUser = await verifyFirebaseToken(token);
    next();
  } catch (error) {
    console.error("Firebase token verification failed", error);
    res.status(401).json({ error: "Invalid authentication token." });
  }
}

async function requireUserParam(req, res, next) {
  if (req.params.userId !== req.authenticatedUser.id) {
    res.status(403).json({ error: "You cannot access another user's data." });
    return;
  }

  next();
}

async function loadAuthenticatedUser(req, res, next) {
  try {
    const user = await database.getUserById(req.params.userId);
    if (!user || user.firebaseUid !== req.firebaseUser.uid) {
      res.status(403).json({ error: "Authenticated user does not match request." });
      return;
    }

    req.authenticatedUser = user;
    next();
  } catch (error) {
    console.error("Unable to load authenticated user", error);
    res.status(500).json({ error: "Unable to authenticate user." });
  }
}

async function broadcastContacts() {
  const users = await database.listUsers();
  io.emit("contacts:update", users.map(withOnlineStatus));
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "translation-chat-server",
    database: dbProvider
  });
});

app.post("/api/register", requireFirebaseAuth, async (req, res) => {
  const { name, emailOrPhone } = req.body;

  if (!name || !emailOrPhone) {
    res.status(400).json({ error: "Name and email or phone are required." });
    return;
  }

  try {
    const user = await database.createUser({
      ...req.body,
      emailOrPhone: req.firebaseUser.phone_number || emailOrPhone,
      firebaseUid: req.firebaseUser.uid
    });
    res.status(201).json({ user: withOnlineStatus(user) });
  } catch (error) {
    console.error("Unable to register user", error);
    res.status(500).json({ error: "Unable to register user." });
  }
});

app.patch("/api/users/:userId", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  const { name, motherTongue, understands } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required." });
    return;
  }

  try {
    const user = await database.updateUser(req.params.userId, {
      name: name.trim(),
      motherTongue,
      understands
    });
    res.json({ user: withOnlineStatus(user) });
    await broadcastContacts();
  } catch (error) {
    console.error("Unable to update profile", error);
    res.status(500).json({ error: "Unable to update profile." });
  }
});

app.post("/api/verify-otp", (req, res) => {
  if (process.env.ENABLE_DEMO_OTP !== "true") {
    res.status(404).json({ error: "Demo OTP verification is disabled." });
    return;
  }

  const { code } = req.body;
  res.json({ verified: code === "123456" });
});

app.get("/api/users/:userId/contacts", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    const contacts = await database.getContacts(req.params.userId);
    res.json({ contacts: contacts.map(withOnlineStatus) });
  } catch (error) {
    console.error("Unable to fetch contacts", error);
    res.status(500).json({ error: "Unable to fetch contacts." });
  }
});

app.post("/api/users/:userId/contacts", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  const emailOrPhone = req.body.emailOrPhone?.trim();

  if (!emailOrPhone) {
    res.status(400).json({ error: "Phone number is required." });
    return;
  }

  if (emailOrPhone === req.authenticatedUser.emailOrPhone) {
    res.status(400).json({ error: "You cannot add yourself." });
    return;
  }

  try {
    const contact = await database.findUserByPhone(emailOrPhone);
    if (!contact) {
      const inviteLink = `${getPublicClientUrl()}?invite=${encodeURIComponent(emailOrPhone)}`;
      res.status(404).json({
        error: "User is not registered yet.",
        invite: {
          phone: emailOrPhone,
          link: inviteLink,
          message: `Join WeConnect so we can chat with live translation: ${inviteLink}`
        }
      });
      return;
    }

    const addedContact = await database.addContact(req.params.userId, contact.id);
    res.status(201).json({ contact: withOnlineStatus(addedContact) });
  } catch (error) {
    console.error("Unable to add contact", error);
    res.status(500).json({ error: "Unable to add contact." });
  }
});

app.get("/api/users/:userId/conversations/:contactId", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    const messages = await database.getConversation(req.params.userId, req.params.contactId);
    res.json({ messages });
  } catch (error) {
    console.error("Unable to fetch conversation", error);
    res.status(500).json({ error: "Unable to fetch conversation." });
  }
});

app.delete("/api/users/:userId/conversations/:contactId", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    await database.softDeleteConversation(req.params.userId, req.params.contactId);
    res.json({ deleted: true });
  } catch (error) {
    console.error("Unable to delete conversation", error);
    res.status(500).json({ error: "Unable to delete conversation." });
  }
});

app.post("/api/translate", requireFirebaseAuth, async (req, res) => {
  const { text, fromLanguage, toLanguage } = req.body;

  if (!text?.trim() || !fromLanguage || !toLanguage) {
    res.status(400).json({ error: "Text, source language, and target language are required." });
    return;
  }

  const sourceLanguage = detectLanguage(text, fromLanguage);
  res.json({
    originalText: text.trim(),
    translatedText: await translateText(text.trim(), sourceLanguage, toLanguage),
    sourceLanguage,
    targetLanguage: toLanguage
  });
});

app.get("/api/messages", async (_req, res) => {
  if (process.env.ENABLE_DEBUG_MESSAGES !== "true") {
    res.status(404).json({ error: "Debug messages endpoint is disabled." });
    return;
  }

  try {
    const messages = await database.listMessages();
    res.json({ messages });
  } catch (error) {
    console.error("Unable to fetch messages", error);
    res.status(500).json({ error: "Unable to fetch messages." });
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const userId = socket.handshake.auth?.userId;
    if (!token || !userId) {
      next(new Error("Authentication token and user id are required."));
      return;
    }

    const firebaseUser = await verifyFirebaseToken(token);
    const user = await database.getUserById(userId);
    if (!user || user.firebaseUid !== firebaseUser.uid) {
      next(new Error("Socket user does not match authentication token."));
      return;
    }

    socket.data.user = user;
    next();
  } catch (error) {
    next(error);
  }
});

io.on("connection", (socket) => {
  socket.on("user:online", async ({ userId }) => {
    const user = socket.data.user;
    if (userId && userId !== user.id) return;
    if (!user) return;

    socketToUser.set(socket.id, user.id);
    onlineUsers.add(user.id);
    socket.join(user.id);
    await broadcastContacts();
  });

  socket.on("message:send", async ({ receiverId, text }) => {
    const sender = socket.data.user;
    const receiver = await database.getUserById(receiverId);

    if (!sender || !receiver || !text?.trim()) return;

    // Decrypt the incoming encrypted message
    const decryptedText = decryptMessage(text);

    const sourceLanguage = detectLanguage(decryptedText, sender.motherTongue);
    const translatedText = await translateText(decryptedText, sourceLanguage, receiver.motherTongue);
    await database.addContact(sender.id, receiverId);
    await database.addContact(receiverId, sender.id);
    const message = await database.saveMessage({
      id: uuid(),
      senderId: sender.id,
      receiverId,
      originalText: encryptMessage(decryptedText.trim()),
      translatedText: encryptMessage(translatedText),
      sourceLanguage,
      targetLanguage: receiver.motherTongue,
      createdAt: new Date().toISOString(),
      status: "delivered"
    });

    io.to(sender.id).emit("message:new", message);
    io.to(receiverId).emit("message:new", message);
  });

  socket.on("message:read", async ({ contactId }) => {
    const reader = socket.data.user;
    if (!reader || !contactId) return;

    const result = await database.markConversationRead(reader.id, contactId);
    if (result.updatedIds.length === 0) return;

    io.to(reader.id).emit("message:status", {
      contactId,
      readerId: reader.id,
      messageIds: result.updatedIds,
      status: result.status,
      readAt: result.readAt
    });
    io.to(contactId).emit("message:status", {
      contactId: reader.id,
      readerId: reader.id,
      messageIds: result.updatedIds,
      status: result.status,
      readAt: result.readAt
    });
  });

  socket.on("typing", ({ receiverId, isTyping }) => {
    const sender = socket.data.user;
    if (!sender || !receiverId) return;

    io.to(receiverId).emit("typing", {
      senderId: sender.id,
      senderName: sender.name,
      isTyping: Boolean(isTyping)
    });
  });

  socket.on("call:invite", (payload) => {
    database.addContact(socket.data.user.id, payload.receiverId).catch(() => undefined);
    database.addContact(payload.receiverId, socket.data.user.id).catch(() => undefined);
    io.to(payload.receiverId).emit("call:incoming", {
      ...payload,
      senderId: socket.data.user.id,
      senderName: socket.data.user.name,
      createdAt: new Date().toISOString()
    });
  });

  socket.on("call:accept", (payload) => {
    io.to(payload.receiverId).emit("call:accepted", {
      ...payload,
      senderId: socket.data.user.id,
      senderName: socket.data.user.name
    });
  });

  socket.on("call:reject", (payload) => {
    io.to(payload.receiverId).emit("call:rejected", {
      ...payload,
      senderId: socket.data.user.id
    });
  });

  socket.on("call:end", (payload) => {
    io.to(payload.receiverId).emit("call:ended", {
      ...payload,
      senderId: socket.data.user.id
    });
  });

  socket.on("call:offer", (payload) => {
    io.to(payload.receiverId).emit("call:offer", {
      ...payload,
      senderId: socket.data.user.id
    });
  });

  socket.on("call:answer", (payload) => {
    io.to(payload.receiverId).emit("call:answer", {
      ...payload,
      senderId: socket.data.user.id
    });
  });

  socket.on("call:ice", (payload) => {
    io.to(payload.receiverId).emit("call:ice", {
      ...payload,
      senderId: socket.data.user.id
    });
  });

  socket.on("call:caption", (payload) => {
    io.to(payload.receiverId).emit("call:caption", {
      ...payload,
      senderId: socket.data.user.id,
      senderName: socket.data.user.name
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
