import { v4 as uuid } from "uuid";

export const users = new Map();
export const messages = [];

const seedUsers = [
  {
    id: "rahul",
    name: "Rahul",
    emailOrPhone: "+91 98765 43210",
    motherTongue: "hi",
    understands: "en",
    avatar: "R"
  },
  {
    id: "priya",
    name: "Priya",
    emailOrPhone: "+91 98765 43211",
    motherTongue: "hi",
    understands: "en",
    avatar: "P"
  },
  {
    id: "amit",
    name: "Amit",
    emailOrPhone: "+91 98765 43212",
    motherTongue: "en",
    understands: "hi",
    avatar: "A"
  }
];

seedUsers.forEach((user) => users.set(user.id, { ...user, online: false }));

export function createUser(payload) {
  const id = uuid();
  const user = {
    id,
    name: payload.name,
    emailOrPhone: payload.emailOrPhone,
    firebaseUid: payload.firebaseUid || null,
    motherTongue: payload.motherTongue || "hi",
    understands: payload.understands || "en",
    avatar: payload.name?.charAt(0)?.toUpperCase() || "U",
    online: true
  };
  users.set(id, user);
  return user;
}

export function getContacts(userId) {
  return Array.from(users.values()).filter((user) => user.id !== userId);
}

export function saveMessage(message) {
  messages.push(message);
  return message;
}

export function getConversation(userId, contactId) {
  return messages.filter((message) => {
    const sameSender = message.senderId === userId && message.receiverId === contactId;
    const sameReceiver = message.senderId === contactId && message.receiverId === userId;
    return sameSender || sameReceiver;
  });
}
