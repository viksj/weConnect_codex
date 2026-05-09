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
    status: document.status,
    readAt: document.readAt,
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
        understands: payload.understands || "en",
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
        understands: payload.understands || "en",
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
