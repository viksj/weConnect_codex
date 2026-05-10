import { v4 as uuid } from "uuid";
import { seedUsers } from "./seedUsers.js";

export function createMemoryRepository() {
  const users = new Map();
  const messages = [];
  const groups = new Map();
  const groupMembers = new Map();
  const groupMessages = [];
  const groupReads = new Set();
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
        understands: payload.understands || payload.motherTongue || "hi",
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
        understands: payload.understands || payload.motherTongue || existingUser.understands,
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

    async getConversationSummary(userId, contactId) {
      const deletedAt = deletedConversations.get(`${userId}:${contactId}`);
      const conversation = messages
        .filter((message) => {
          const sent = message.senderId === userId && message.receiverId === contactId;
          const received = message.senderId === contactId && message.receiverId === userId;
          const visible = !deletedAt || new Date(message.createdAt) > new Date(deletedAt);
          return (sent || received) && visible;
        })
        .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));
      const lastMessage = conversation[conversation.length - 1] || null;
      const unreadCount = conversation.filter(
        (message) => message.senderId === contactId && message.receiverId === userId && message.status !== "read"
      ).length;

      return {
        unreadCount,
        lastMessage
      };
    },

    async addContact(userId, contactId) {
      const userContacts = contacts.get(userId) || new Set();
      userContacts.add(contactId);
      contacts.set(userId, userContacts);
      return users.get(contactId) || null;
    },

    async saveMessage(message) {
      const storedMessage = {
        ...message,
        reactions: message.reactions || []
      };
      messages.push(storedMessage);
      return storedMessage;
    },

    async getMessageById(messageId) {
      return messages.find((message) => message.id === messageId) || null;
    },

    async updateMessageReaction(messageId, userId, emoji) {
      const message = messages.find((item) => item.id === messageId);
      if (!message) return null;

      const reactions = (message.reactions || []).filter((reaction) => reaction.userId !== userId);
      if (emoji) {
        reactions.push({
          userId,
          emoji,
          createdAt: new Date().toISOString()
        });
      }
      message.reactions = reactions;
      return message;
    },

    async createGroup(payload) {
      const group = {
        id: payload.id || uuid(),
        type: "group",
        name: payload.name,
        avatar: payload.name?.charAt(0)?.toUpperCase() || "G",
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString()
      };
      groups.set(group.id, group);
      groupMembers.set(group.id, new Set([payload.createdBy, ...(payload.memberIds || [])]));
      return group;
    },

    async getGroups(userId) {
      return Array.from(groups.values()).filter((group) => groupMembers.get(group.id)?.has(userId));
    },

    async getGroupByIdForUser(groupId, userId) {
      return groupMembers.get(groupId)?.has(userId) ? groups.get(groupId) || null : null;
    },

    async getGroupMembers(groupId) {
      return Array.from(groupMembers.get(groupId) || []).map((userId) => users.get(userId)).filter(Boolean);
    },

    async getGroupSummary(userId, groupId) {
      const conversation = groupMessages
        .filter((message) => message.groupId === groupId)
        .sort((first, second) => new Date(first.createdAt) - new Date(second.createdAt));
      const lastMessage = conversation[conversation.length - 1] || null;
      const unreadCount = conversation.filter(
        (message) => message.senderId !== userId && !groupReads.has(`${message.id}:${userId}`)
      ).length;
      return { unreadCount, lastMessage };
    },

    async saveGroupMessage(message) {
      groupMessages.push(message);
      return message;
    },

    async getGroupMessages(groupId) {
      return groupMessages.filter((message) => message.groupId === groupId);
    },

    async markGroupRead(userId, groupId) {
      const readAt = new Date().toISOString();
      const updatedIds = [];
      groupMessages.forEach((message) => {
        if (message.groupId === groupId && message.senderId !== userId && !groupReads.has(`${message.id}:${userId}`)) {
          groupReads.add(`${message.id}:${userId}`);
          updatedIds.push(message.id);
        }
      });
      return { updatedIds, status: "read", readAt };
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
