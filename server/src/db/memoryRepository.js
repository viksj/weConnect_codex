import { v4 as uuid } from "uuid";
import { seedUsers } from "./seedUsers.js";

export function createMemoryRepository() {
  const users = new Map();
  const messages = [];

  seedUsers.forEach((user) => users.set(user.id, { ...user }));

  return {
    async init() {
      return undefined;
    },

    async createUser(payload) {
      const existingUser = Array.from(users.values()).find((user) => {
        const sameFirebaseUid = payload.firebaseUid && user.firebaseUid === payload.firebaseUid;
        const samePhone = user.emailOrPhone === payload.emailOrPhone;
        return sameFirebaseUid || samePhone;
      });

      const user = {
        id: existingUser?.id || uuid(),
        name: payload.name,
        emailOrPhone: payload.emailOrPhone,
        firebaseUid: payload.firebaseUid || existingUser?.firebaseUid || null,
        motherTongue: payload.motherTongue || "hi",
        understands: payload.understands || "en",
        avatar: payload.name?.charAt(0)?.toUpperCase() || "U"
      };

      users.set(user.id, user);
      return user;
    },

    async getUserById(userId) {
      return users.get(userId) || null;
    },

    async listUsers() {
      return Array.from(users.values());
    },

    async getContacts(userId) {
      return Array.from(users.values()).filter((user) => user.id !== userId);
    },

    async saveMessage(message) {
      messages.push(message);
      return message;
    },

    async getConversation(userId, contactId) {
      return messages.filter((message) => {
        const sent = message.senderId === userId && message.receiverId === contactId;
        const received = message.senderId === contactId && message.receiverId === userId;
        return sent || received;
      });
    },

    async listMessages() {
      return messages;
    }
  };
}
