import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "fs/promises";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import { createDatabase } from "./db/index.js";
import { createDemoAuthToken, firebaseAdminAuth, verifyFirebaseToken } from "./firebaseAdmin.js";
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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");

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
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "10mb" }));
app.use("/uploads", express.static(uploadsDir));

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

async function withConversationSummary(userId, contact) {
  const summary = await database.getConversationSummary(userId, contact.id);
  return {
    ...withOnlineStatus(contact),
    unreadCount: summary.unreadCount,
    lastMessage: summary.lastMessage
  };
}

async function formatGroupMessageForUser(message, user) {
  const originalText = decryptMessage(message.originalText);
  const translatedText = await translateText(originalText, message.sourceLanguage, user.motherTongue);

  return {
    ...message,
    receiverId: user.id,
    originalText: encryptMessage(originalText),
    translatedText: encryptMessage(translatedText),
    targetLanguage: user.motherTongue,
    status: "delivered"
  };
}

async function withGroupSummary(userId, group) {
  const user = await database.getUserById(userId);
  const summary = await database.getGroupSummary(userId, group.id);
  return {
    ...group,
    unreadCount: summary.unreadCount,
    lastMessage: summary.lastMessage && user ? await formatGroupMessageForUser(summary.lastMessage, user) : null
  };
}

function safeUploadName(name = "upload.bin") {
  const extension = path.extname(name).slice(0, 16);
  const baseName = path.basename(name, extension).replace(/[^a-z0-9_-]/gi, "-").slice(0, 48) || "upload";
  return `${Date.now()}-${uuid()}-${baseName}${extension}`;
}

async function saveDataUrlUpload(dataUrl, fileName) {
  const match = dataUrl?.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid file data.");
  }

  const [, mimeType, base64Data] = match;
  const buffer = Buffer.from(base64Data, "base64");
  const maxBytes = Number(process.env.LOCAL_UPLOAD_MAX_BYTES || 8 * 1024 * 1024);
  if (buffer.byteLength > maxBytes) {
    throw new Error("File is too large.");
  }

  await fs.mkdir(uploadsDir, { recursive: true });
  const storedName = safeUploadName(fileName);
  await fs.writeFile(path.join(uploadsDir, storedName), buffer);

  return {
    url: `/uploads/${storedName}`,
    mimeType,
    name: fileName || storedName,
    size: buffer.byteLength
  };
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
  const { name, motherTongue } = req.body;

  if (!name?.trim()) {
    res.status(400).json({ error: "Name is required." });
    return;
  }

  try {
    const user = await database.updateUser(req.params.userId, {
      name: name.trim(),
      motherTongue,
      understands: motherTongue
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

  const { code, phone } = req.body;
  const verified = code === "123456";
  res.json({
    verified,
    token: verified && phone ? createDemoAuthToken(phone) : null
  });
});

app.get("/api/users/:userId/contacts", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    const contacts = await database.getContacts(req.params.userId);
    const contactsWithSummaries = await Promise.all(
      contacts.map((contact) => withConversationSummary(req.params.userId, contact))
    );
    res.json({ contacts: contactsWithSummaries });
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

app.get("/api/users/:userId/groups", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    const groups = await database.getGroups(req.params.userId);
    const groupsWithSummaries = await Promise.all(groups.map((group) => withGroupSummary(req.params.userId, group)));
    res.json({ groups: groupsWithSummaries });
  } catch (error) {
    console.error("Unable to fetch groups", error);
    res.status(500).json({ error: "Unable to fetch groups." });
  }
});

app.post("/api/users/:userId/groups", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  const name = req.body.name?.trim();
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];

  if (!name || memberIds.length === 0) {
    res.status(400).json({ error: "Group name and at least one member are required." });
    return;
  }

  try {
    const group = await database.createGroup({
      name,
      memberIds,
      createdBy: req.params.userId
    });
    const members = await database.getGroupMembers(group.id);
    const groupWithSummary = await withGroupSummary(req.params.userId, group);
    members.forEach((member) => io.to(member.id).emit("groups:update"));
    res.status(201).json({ group: groupWithSummary });
  } catch (error) {
    console.error("Unable to create group", error);
    res.status(500).json({ error: "Unable to create group." });
  }
});

app.get(
  "/api/users/:userId/groups/:groupId/messages",
  requireFirebaseAuth,
  loadAuthenticatedUser,
  requireUserParam,
  async (req, res) => {
    try {
      const group = await database.getGroupByIdForUser(req.params.groupId, req.params.userId);
      if (!group) {
        res.status(404).json({ error: "Group not found." });
        return;
      }

      const messages = await database.getGroupMessages(req.params.groupId, req.params.userId);
      const translatedMessages = await Promise.all(
        messages.map((message) => formatGroupMessageForUser(message, req.authenticatedUser))
      );
      res.json({ messages: translatedMessages });
    } catch (error) {
      console.error("Unable to fetch group messages", error);
      res.status(500).json({ error: "Unable to fetch group messages." });
    }
  }
);

app.post("/api/users/:userId/uploads", requireFirebaseAuth, loadAuthenticatedUser, requireUserParam, async (req, res) => {
  try {
    const upload = await saveDataUrlUpload(req.body.dataUrl, req.body.name);
    res.status(201).json({ upload });
  } catch (error) {
    console.error("Unable to save upload", error);
    res.status(400).json({ error: error.message || "Unable to save upload." });
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
    const groups = await database.getGroups(user.id);
    groups.forEach((group) => socket.join(`group:${group.id}`));
    await broadcastContacts();
  });

  socket.on("message:send", async ({
    receiverId,
    text,
    messageType = "text",
    mediaUrl,
    mediaName,
    mediaMime,
    replyToMessageId,
    replyPreviewText
  }) => {
    const sender = socket.data.user;
    const receiver = await database.getUserById(receiverId);

    if (!sender || !receiver || (!text?.trim() && !mediaUrl)) return;

    // Decrypt the incoming encrypted message
    const decryptedText = text?.trim() ? decryptMessage(text) : mediaName || "Attachment";

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
      messageType,
      mediaUrl,
      mediaName,
      mediaMime,
      replyToMessageId: replyToMessageId || null,
      replyPreviewText: replyPreviewText ? encryptMessage(decryptMessage(replyPreviewText).trim()) : null,
      reactions: [],
      createdAt: new Date().toISOString(),
      status: "delivered"
    });

    io.to(sender.id).emit("message:new", message);
    io.to(receiverId).emit("message:new", message);
  });

  socket.on("message:react", async ({ messageId, emoji }) => {
    const user = socket.data.user;
    if (!user || !messageId) return;

    const message = await database.getMessageById?.(messageId);
    const isParticipant = message && (message.senderId === user.id || message.receiverId === user.id);
    if (!isParticipant) return;

    const cleanEmoji = typeof emoji === "string" && emoji.trim() ? emoji.trim().slice(0, 8) : "";
    const updatedMessage = await database.updateMessageReaction?.(messageId, user.id, cleanEmoji);
    if (!updatedMessage) return;

    const payload = {
      messageId,
      reactions: updatedMessage.reactions || []
    };
    io.to(updatedMessage.senderId).emit("message:reaction", payload);
    io.to(updatedMessage.receiverId).emit("message:reaction", payload);
  });

  socket.on("group:message:send", async ({ groupId, text, messageType = "text", mediaUrl, mediaName, mediaMime }) => {
    const sender = socket.data.user;
    if (!sender || !groupId || (!text?.trim() && !mediaUrl)) return;

    const group = await database.getGroupByIdForUser(groupId, sender.id);
    if (!group) return;

    const decryptedText = text?.trim() ? decryptMessage(text) : mediaName || "Attachment";
    const sourceLanguage = detectLanguage(decryptedText, sender.motherTongue);
    const message = await database.saveGroupMessage({
      id: uuid(),
      groupId,
      senderId: sender.id,
      originalText: encryptMessage(decryptedText.trim()),
      sourceLanguage,
      messageType,
      mediaUrl,
      mediaName,
      mediaMime,
      createdAt: new Date().toISOString()
    });
    const members = await database.getGroupMembers(groupId);

    await Promise.all(
      members.map(async (member) => {
        const translatedMessage = await formatGroupMessageForUser(message, member);
        io.to(member.id).emit("message:new", translatedMessage);
      })
    );
    members.forEach((member) => io.to(member.id).emit("groups:update"));
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

  socket.on("group:read", async ({ groupId }) => {
    const reader = socket.data.user;
    if (!reader || !groupId) return;

    const group = await database.getGroupByIdForUser(groupId, reader.id);
    if (!group) return;

    const result = await database.markGroupRead(reader.id, groupId);
    if (result.updatedIds.length === 0) return;

    io.to(reader.id).emit("message:status", {
      groupId,
      readerId: reader.id,
      messageIds: result.updatedIds,
      status: result.status,
      readAt: result.readAt
    });
    io.to(`group:${groupId}`).emit("groups:update");
  });

  socket.on("typing", ({ receiverId, groupId, isTyping }) => {
    const sender = socket.data.user;
    if (!sender || (!receiverId && !groupId)) return;

    const payload = {
      senderId: sender.id,
      senderName: sender.name,
      groupId,
      isTyping: Boolean(isTyping)
    };

    if (groupId) {
      socket.to(`group:${groupId}`).emit("typing", payload);
      return;
    }

    io.to(receiverId).emit("typing", {
      ...payload,
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
