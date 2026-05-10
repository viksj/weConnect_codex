import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "../client/node_modules/socket.io-client/build/esm/index.js";
import { decryptMessage, encryptMessage } from "../server/src/encryptionService.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.TEST_PORT || 4022);
const baseUrl = `http://localhost:${port}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function waitForServer() {
  const deadline = Date.now() + 10_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw new Error(`Server did not become healthy: ${lastError?.message || "timeout"}`);
}

async function post(path, body, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${payload.error || "unknown error"}`);
  }

  return payload;
}

async function postExpectError(path, body, token, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status !== expectedStatus) {
    throw new Error(`${path} expected ${expectedStatus}, got ${response.status}: ${payload.error || "unknown error"}`);
  }

  return payload;
}

async function get(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${payload.error || "unknown error"}`);
  }

  return payload;
}

async function del(path, token) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${payload.error || "unknown error"}`);
  }

  return payload;
}

async function verifyDemoUser(phone) {
  const result = await post("/api/verify-otp", { code: "123456", phone });
  assert(result.verified, `Demo OTP was not verified for ${phone}`);
  assert(result.token, `Demo token was not returned for ${phone}`);
  return result.token;
}

async function connectSocket(user, token) {
  const socket = io(baseUrl, {
    auth: {
      token,
      userId: user.id
    },
    transports: ["websocket", "polling"],
    reconnection: false,
    timeout: 5_000
  });

  await once(socket, "connect");
  socket.emit("user:online", { userId: user.id });
  return socket;
}

function waitForMessage(socket) {
  return new Promise((resolveMessage, rejectMessage) => {
    const timeout = setTimeout(() => {
      socket.off("message:new", handleMessage);
      rejectMessage(new Error("Timed out waiting for Socket.IO message:new"));
    }, 5_000);

    function handleMessage(message) {
      clearTimeout(timeout);
      resolveMessage(message);
    }

    socket.on("message:new", handleMessage);
  });
}

function waitForEvent(socket, eventName) {
  return new Promise((resolveEvent, rejectEvent) => {
    const timeout = setTimeout(() => {
      socket.off(eventName, handleEvent);
      rejectEvent(new Error(`Timed out waiting for Socket.IO ${eventName}`));
    }, 5_000);

    function handleEvent(payload) {
      clearTimeout(timeout);
      resolveEvent(payload);
    }

    socket.on(eventName, handleEvent);
  });
}

async function sendAndAssertMessage({ senderSocket, receiverSocket, sender, receiver, text, expectedTranslation }) {
  const incomingMessage = waitForMessage(receiverSocket);
  senderSocket.emit("message:send", {
    receiverId: receiver.id,
    text: encryptMessage(text)
  });

  const message = await incomingMessage;
  assert(message.senderId === sender.id, `Message sender is not ${sender.name}`);
  assert(message.receiverId === receiver.id, `Message receiver is not ${receiver.name}`);
  assert(message.sourceLanguage === "hi", `Expected source language hi, got ${message.sourceLanguage}`);
  assert(message.targetLanguage === "en", `Expected target language en, got ${message.targetLanguage}`);
  assert(decryptMessage(message.originalText) === text, "Original message did not round-trip");
  assert(
    decryptMessage(message.translatedText) === expectedTranslation,
    `Expected translation "${expectedTranslation}", got "${decryptMessage(message.translatedText)}"`
  );

  return message;
}

async function sendAndAssertVoiceMessage({ senderSocket, receiverSocket, sender, receiver, transcript, expectedTranslation }) {
  const incomingMessage = waitForMessage(receiverSocket);
  senderSocket.emit("message:send", {
    receiverId: receiver.id,
    text: encryptMessage(transcript),
    messageType: "audio",
    mediaUrl: "/uploads/test-voice-message.webm",
    mediaName: "test-voice-message.webm",
    mediaMime: "audio/webm"
  });

  const message = await incomingMessage;
  assert(message.senderId === sender.id, `Voice message sender is not ${sender.name}`);
  assert(message.receiverId === receiver.id, `Voice message receiver is not ${receiver.name}`);
  assert(message.messageType === "audio", `Expected audio message type, got ${message.messageType}`);
  assert(message.mediaUrl === "/uploads/test-voice-message.webm", "Original voice audio URL was not preserved");
  assert(message.mediaMime === "audio/webm", "Original voice audio MIME was not preserved");
  assert(decryptMessage(message.originalText) === transcript, "Voice transcript did not round-trip");
  assert(
    decryptMessage(message.translatedText) === expectedTranslation,
    `Expected voice translation "${expectedTranslation}", got "${decryptMessage(message.translatedText)}"`
  );

  return message;
}

function startServer() {
  return spawn("node", ["server/src/index.js"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      DB_PROVIDER: "memory",
      ENABLE_DEMO_OTP: "true",
      TRANSLATION_PROVIDER: "local",
      FIREBASE_SERVICE_ACCOUNT_PATH: "",
      CLIENT_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
      EXPO_ORIGINS: "exp://"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function run() {
  const server = startServer();
  const serverOutput = [];
  let aliceSocket;
  let bobSocket;

  server.stdout.on("data", (chunk) => serverOutput.push(chunk.toString()));
  server.stderr.on("data", (chunk) => serverOutput.push(chunk.toString()));

  try {
    await waitForServer();

    const alicePhone = "+919000000101";
    const bobPhone = "+919000000102";
    const aliceToken = await verifyDemoUser(alicePhone);
    const bobToken = await verifyDemoUser(bobPhone);

    const { user: alice } = await post(
      "/api/register",
      {
        name: "Alice Local",
        emailOrPhone: alicePhone,
        motherTongue: "hi"
      },
      aliceToken
    );
    const { user: bob } = await post(
      "/api/register",
      {
        name: "Bob Local",
        emailOrPhone: bobPhone,
        motherTongue: "en"
      },
      bobToken
    );

    await post(`/api/users/${alice.id}/contacts`, { emailOrPhone: bobPhone }, aliceToken);
    const { contacts } = await get(`/api/users/${alice.id}/contacts`, aliceToken);
    assert(contacts.some((contact) => contact.id === bob.id), "Bob was not added to Alice contacts");
    const inviteResult = await postExpectError(
      `/api/users/${alice.id}/contacts`,
      { emailOrPhone: "+919999999999" },
      aliceToken,
      404
    );
    assert(inviteResult.invite?.link, "Unregistered contact did not return invite link");
    assert(inviteResult.invite?.message?.includes(inviteResult.invite.link), "Invite message does not include invite link");

    aliceSocket = await connectSocket(alice, aliceToken);
    bobSocket = await connectSocket(bob, bobToken);

    await sendAndAssertMessage({
      senderSocket: aliceSocket,
      receiverSocket: bobSocket,
      sender: alice,
      receiver: bob,
      text: "Kaise ho?",
      expectedTranslation: "How are you?"
    });
    await sendAndAssertMessage({
      senderSocket: aliceSocket,
      receiverSocket: bobSocket,
      sender: alice,
      receiver: bob,
      text: "kya kar rhe ho",
      expectedTranslation: "What are you doing?"
    });
    await sendAndAssertVoiceMessage({
      senderSocket: aliceSocket,
      receiverSocket: bobSocket,
      sender: alice,
      receiver: bob,
      transcript: "kya kar rhe ho",
      expectedTranslation: "What are you doing?"
    });

    const { messages } = await get(`/api/users/${bob.id}/conversations/${alice.id}`, bobToken);
    assert(messages.length === 3, `Expected three stored conversation messages, got ${messages.length}`);
    assert(decryptMessage(messages[0].translatedText) === "How are you?", "Stored translation was not English");
    assert(
      decryptMessage(messages[1].translatedText) === "What are you doing?",
      "Stored Roman Hindi variant translation was not English"
    );
    assert(messages[2].messageType === "audio", "Stored voice message type was not audio");
    assert(messages[2].mediaUrl === "/uploads/test-voice-message.webm", "Stored original voice audio URL was not preserved");
    assert(
      decryptMessage(messages[2].translatedText) === "What are you doing?",
      "Stored voice transcript translation was not English"
    );

    const incomingCaption = waitForEvent(bobSocket, "call:caption");
    aliceSocket.emit("call:caption", {
      callId: "test-call-caption",
      receiverId: bob.id,
      originalText: "kya kar rhe ho",
      translatedText: "What are you doing?",
      sourceLanguage: "hi",
      targetLanguage: "en",
      isInterim: false
    });
    const caption = await incomingCaption;
    assert(caption.callId === "test-call-caption", "Call caption id did not relay");
    assert(caption.senderId === alice.id, "Call caption sender id did not relay");
    assert(caption.senderName === alice.name, "Call caption sender name did not relay");
    assert(caption.originalText === "kya kar rhe ho", "Call caption original text did not relay");
    assert(caption.translatedText === "What are you doing?", "Call caption translation did not relay");

    const deleteResult = await del(`/api/users/${bob.id}/conversations/${alice.id}`, bobToken);
    assert(deleteResult.deleted === true, "Delete conversation did not return deleted=true");
    const { messages: messagesAfterDelete } = await get(`/api/users/${bob.id}/conversations/${alice.id}`, bobToken);
    assert(messagesAfterDelete.length === 0, "Deleted conversation is still visible to deleting user");
    const { contacts: bobContactsAfterDelete } = await get(`/api/users/${bob.id}/contacts`, bobToken);
    const aliceContactAfterDelete = bobContactsAfterDelete.find((contact) => contact.id === alice.id);
    assert(aliceContactAfterDelete, "Deleting a conversation removed the contact");
    assert(!aliceContactAfterDelete.lastMessage, "Deleted conversation still shows a last message preview");
    assert(Number(aliceContactAfterDelete.unreadCount || 0) === 0, "Deleted conversation still shows unread messages");
    const { messages: aliceMessagesAfterBobDelete } = await get(`/api/users/${alice.id}/conversations/${bob.id}`, aliceToken);
    assert(aliceMessagesAfterBobDelete.length === 3, "Delete-for-me removed messages for the other user");

    console.log("Local flow test passed: demo OTP, registration, contacts, Socket.IO messaging, and translation.");
  } finally {
    aliceSocket?.disconnect();
    bobSocket?.disconnect();
    server.kill("SIGTERM");

    const [code, signal] = await once(server, "exit");
    if (code && code !== 0 && signal !== "SIGTERM") {
      console.error(serverOutput.join(""));
      throw new Error(`Server exited unexpectedly with code ${code}`);
    }
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
