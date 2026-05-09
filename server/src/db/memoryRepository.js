import { v4 as uuid } from "uuid";
import { seedUsers } from "./seedUsers.js";

export function createMemoryRepository() {
  const users = new Map();
  const messages = [];
  const contacts = new Map();
  const deletedConversations = new Map();

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

    async updateUser(userId, payload) {
      const existingUser = users.get(userId);
      if (!existingUser) return null;

      const user = {
        ...existingUser,
        name: payload.name,
        motherTongue: payload.motherTongue || existingUser.motherTongue,
        understands: payload.understands || existingUser.understands,
        avatar: payload.name?.charAt(0)?.toUpperCase() || existingUser.avatar
      };
      users.set(userId, user);
      return user;
    },

    async findUserByPhone(emailOrPhone) {
      return Array.from(users.values()).find((user) => user.emailOrPhone === emailOrPhone) || null;
    },

    async listUsers() {
      return Array.from(users.values());
    },

    async getContacts(userId) {
      return Array.from(contacts.get(userId) || []).map((contactId) => users.get(contactId)).filter(Boolean);
    },

    async addContact(userId, contactId) {
      const userContacts = contacts.get(userId) || new Set();
      userContacts.add(contactId);
      contacts.set(userId, userContacts);
      return users.get(contactId) || null;
    },

    async saveMessage(message) {
      messages.push(message);
      return message;
    },

    async getConversation(userId, contactId) {
      const deletedAt = deletedConversations.get(`${userId}:${contactId}`);
      return messages.filter((message) => {
        const sent = message.senderId === userId && message.receiverId === contactId;
        const received = message.senderId === contactId && message.receiverId === userId;
        const visible = !deletedAt || new Date(message.createdAt) > new Date(deletedAt);
        return (sent || received) && visible;
      });
    },

    async markConversationRead(userId, contactId) {
      const readAt = new Date().toISOString();
      const updatedIds = [];

      messages.forEach((message) => {
        if (message.senderId === contactId && message.receiverId === userId && message.status !== "read") {
          message.status = "read";
          message.readAt = readAt;
          updatedIds.push(message.id);
        }
      });

      return { updatedIds, status: "read", readAt };
    },

    async softDeleteConversation(userId, contactId) {
      deletedConversations.set(`${userId}:${contactId}`, new Date().toISOString());
      return { deleted: true };
    },

    async listMessages() {
      return messages;
    }
  };
}
