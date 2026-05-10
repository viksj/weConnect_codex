import { MongoClient } from "mongodb";
import { v4 as uuid } from "uuid";
import { seedUsers } from "./seedUsers.js";

function mapUser(document) {
  if (!document) return null;

  return {
    id: document.id,
    name: document.name,
    emailOrPhone: document.emailOrPhone,
    firebaseUid: document.firebaseUid || null,
    motherTongue: document.motherTongue,
    understands: document.understands,
    avatar: document.avatar
  };
}

function mapMessage(document) {
  if (!document) return null;

  return {
    id: document.id,
    senderId: document.senderId,
    receiverId: document.receiverId,
    originalText: document.originalText,
    translatedText: document.translatedText,
    sourceLanguage: document.sourceLanguage,
    targetLanguage: document.targetLanguage,
    groupId: document.groupId || null,
    messageType: document.messageType || "text",
    mediaUrl: document.mediaUrl || null,
    mediaName: document.mediaName || null,
    mediaMime: document.mediaMime || null,
    status: document.status,
    readAt: document.readAt,
    createdAt: document.createdAt
  };
}

function mapGroup(document) {
  if (!document) return null;

  return {
    id: document.id,
    type: "group",
    name: document.name,
    avatar: document.avatar,
    createdBy: document.createdBy,
    createdAt: document.createdAt
  };
}

export function createMongoRepository() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
  const databaseName = process.env.MONGODB_DATABASE || "translation_chat";
  const client = new MongoClient(uri);
  let database;

  function usersCollection() {
    return database.collection("users");
  }

  function messagesCollection() {
    return database.collection("messages");
  }

  function contactsCollection() {
    return database.collection("contacts");
  }

  function conversationDeletionsCollection() {
    return database.collection("conversation_deletions");
  }

  function groupsCollection() {
    return database.collection("groups");
  }

  function groupMembersCollection() {
    return database.collection("group_members");
  }

  function groupMessagesCollection() {
    return database.collection("group_messages");
  }

  function groupReadsCollection() {
    return database.collection("group_message_reads");
  }

  return {
    async init() {
      await client.connect();
      database = client.db(databaseName);

      await usersCollection().createIndex({ id: 1 }, { unique: true });
      await usersCollection().createIndex({ emailOrPhone: 1 }, { unique: true });
      await usersCollection().createIndex({ firebaseUid: 1 }, { unique: true, sparse: true });
      await messagesCollection().createIndex({ senderId: 1, receiverId: 1, createdAt: 1 });
      await contactsCollection().createIndex({ userId: 1, contactId: 1 }, { unique: true });
      await conversationDeletionsCollection().createIndex({ userId: 1, contactId: 1 }, { unique: true });
      await groupsCollection().createIndex({ id: 1 }, { unique: true });
      await groupMembersCollection().createIndex({ groupId: 1, userId: 1 }, { unique: true });
      await groupMessagesCollection().createIndex({ groupId: 1, createdAt: 1 });
      await groupReadsCollection().createIndex({ messageId: 1, userId: 1 }, { unique: true });

      if (process.env.DB_SEED_DEMO_USERS !== "false" && (await usersCollection().countDocuments()) === 0) {
        await usersCollection().insertMany(seedUsers.map((user) => ({ ...user, createdAt: new Date().toISOString() })));
      }
    },

    async createUser(payload) {
      const existingUser = await this.findUserByIdentity(payload);
      const user = {
        id: existingUser?.id || uuid(),
        name: payload.name,
        emailOrPhone: payload.emailOrPhone,
        firebaseUid: payload.firebaseUid || existingUser?.firebaseUid || null,
        motherTongue: payload.motherTongue || "hi",
        understands: payload.understands || payload.motherTongue || "hi",
        avatar: payload.name?.charAt(0)?.toUpperCase() || "U",
        updatedAt: new Date().toISOString()
      };

      await usersCollection().updateOne(
        { id: user.id },
        {
          $set: user,
          $setOnInsert: { createdAt: new Date().toISOString() }
        },
        { upsert: true }
      );

      return user;
    },

    async findUserByIdentity(payload) {
      const filters = [{ emailOrPhone: payload.emailOrPhone }];
      if (payload.firebaseUid) filters.push({ firebaseUid: payload.firebaseUid });
      return mapUser(await usersCollection().findOne({ $or: filters }));
    },

    async getUserById(userId) {
      return mapUser(await usersCollection().findOne({ id: userId }));
    },

    async updateUser(userId, payload) {
      const user = {
        name: payload.name,
        motherTongue: payload.motherTongue || "hi",
        understands: payload.understands || payload.motherTongue || "hi",
        avatar: payload.name?.charAt(0)?.toUpperCase() || "U",
        updatedAt: new Date().toISOString()
      };
      await usersCollection().updateOne({ id: userId }, { $set: user });
      return this.getUserById(userId);
    },

    async findUserByPhone(emailOrPhone) {
      return mapUser(await usersCollection().findOne({ emailOrPhone }));
    },

    async listUsers() {
      return (await usersCollection().find({}).sort({ createdAt: 1 }).toArray()).map(mapUser);
    },

    async getContacts(userId) {
      const contacts = await contactsCollection().find({ userId }).toArray();
      const contactIds = contacts.map((contact) => contact.contactId);
      if (contactIds.length === 0) return [];
      return (await usersCollection().find({ id: { $in: contactIds } }).sort({ name: 1 }).toArray()).map(mapUser);
    },

    async getConversationSummary(userId, contactId) {
      const lastMessage = await messagesCollection()
        .find({
          $or: [
            { senderId: userId, receiverId: contactId },
            { senderId: contactId, receiverId: userId }
          ]
        })
        .sort({ createdAt: -1 })
        .limit(1)
        .next();
      const unreadCount = await messagesCollection().countDocuments({
        senderId: contactId,
        receiverId: userId,
        status: { $ne: "read" }
      });

      return {
        unreadCount,
        lastMessage: mapMessage(lastMessage)
      };
    },

    async addContact(userId, contactId) {
      await contactsCollection().updateOne(
        { userId, contactId },
        { $setOnInsert: { userId, contactId, createdAt: new Date().toISOString() } },
        { upsert: true }
      );
      return this.getUserById(contactId);
    },

    async saveMessage(message) {
      await messagesCollection().insertOne(message);
      return message;
    },

    async createGroup(payload) {
      const group = {
        id: payload.id || uuid(),
        name: payload.name,
        avatar: payload.name?.charAt(0)?.toUpperCase() || "G",
        createdBy: payload.createdBy,
        createdAt: new Date().toISOString()
      };
      const memberIds = Array.from(new Set([payload.createdBy, ...(payload.memberIds || [])]));

      await groupsCollection().insertOne(group);
      await groupMembersCollection().insertMany(
        memberIds.map((memberId) => ({
          groupId: group.id,
          userId: memberId,
          role: memberId === payload.createdBy ? "admin" : "member",
          joinedAt: new Date().toISOString()
        }))
      );

      return mapGroup(group);
    },

    async getGroups(userId) {
      const memberships = await groupMembersCollection().find({ userId }).toArray();
      const groupIds = memberships.map((membership) => membership.groupId);
      if (groupIds.length === 0) return [];
      return (await groupsCollection().find({ id: { $in: groupIds } }).sort({ createdAt: -1 }).toArray()).map(mapGroup);
    },

    async getGroupByIdForUser(groupId, userId) {
      const membership = await groupMembersCollection().findOne({ groupId, userId });
      if (!membership) return null;
      return mapGroup(await groupsCollection().findOne({ id: groupId }));
    },

    async getGroupMembers(groupId) {
      const memberships = await groupMembersCollection().find({ groupId }).toArray();
      const userIds = memberships.map((membership) => membership.userId);
      if (userIds.length === 0) return [];
      return (await usersCollection().find({ id: { $in: userIds } }).sort({ name: 1 }).toArray()).map(mapUser);
    },

    async getGroupSummary(userId, groupId) {
      const lastMessage = await groupMessagesCollection().find({ groupId }).sort({ createdAt: -1 }).limit(1).next();
      const readMessageIds = (
        await groupReadsCollection().find({ groupId, userId }).project({ messageId: 1 }).toArray()
      ).map((read) => read.messageId);
      const unreadCount = await groupMessagesCollection().countDocuments({
        groupId,
        senderId: { $ne: userId },
        id: { $nin: readMessageIds }
      });
      return { unreadCount, lastMessage: mapMessage(lastMessage) };
    },

    async saveGroupMessage(message) {
      await groupMessagesCollection().insertOne(message);
      return message;
    },

    async getGroupMessages(groupId) {
      return (await groupMessagesCollection().find({ groupId }).sort({ createdAt: 1 }).toArray()).map(mapMessage);
    },

    async markGroupRead(userId, groupId) {
      const readAt = new Date().toISOString();
      const unreadMessages = await groupMessagesCollection()
        .find({ groupId, senderId: { $ne: userId } })
        .project({ id: 1 })
        .toArray();
      const updatedIds = [];

      await Promise.all(
        unreadMessages.map(async (message) => {
          const result = await groupReadsCollection().updateOne(
            { messageId: message.id, userId },
            { $setOnInsert: { groupId, messageId: message.id, userId, readAt } },
            { upsert: true }
          );
          if (result.upsertedCount > 0) updatedIds.push(message.id);
        })
      );

      return { updatedIds, status: "read", readAt };
    },

    async getConversation(userId, contactId) {
      const deletion = await conversationDeletionsCollection().findOne({ userId, contactId });
      const documents = await messagesCollection()
        .find({
          $and: [
            {
              $or: [
                { senderId: userId, receiverId: contactId },
                { senderId: contactId, receiverId: userId }
              ]
            },
            deletion ? { createdAt: { $gt: deletion.deletedAt } } : {}
          ]
        })
        .sort({ createdAt: 1 })
        .toArray();

      return documents.map(mapMessage);
    },

    async markConversationRead(userId, contactId) {
      const readAt = new Date().toISOString();
      const unreadMessages = await messagesCollection()
        .find({
          senderId: contactId,
          receiverId: userId,
          status: { $ne: "read" }
        })
        .project({ id: 1 })
        .toArray();
      const updatedIds = unreadMessages.map((message) => message.id);

      if (updatedIds.length > 0) {
        await messagesCollection().updateMany(
          { id: { $in: updatedIds } },
          {
            $set: {
              status: "read",
              readAt
            }
          }
        );
      }

      return { updatedIds, status: "read", readAt };
    },

    async softDeleteConversation(userId, contactId) {
      await conversationDeletionsCollection().updateOne(
        { userId, contactId },
        { $set: { userId, contactId, deletedAt: new Date().toISOString() } },
        { upsert: true }
      );
      return { deleted: true };
    },

    async listMessages() {
      return (await messagesCollection().find({}).sort({ createdAt: 1 }).toArray()).map(mapMessage);
    }
  };
}
