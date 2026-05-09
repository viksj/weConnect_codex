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

  return {
    async init() {
      await client.connect();
      database = client.db(databaseName);

      await usersCollection().createIndex({ id: 1 }, { unique: true });
      await usersCollection().createIndex({ emailOrPhone: 1 }, { unique: true });
      await usersCollection().createIndex({ firebaseUid: 1 }, { unique: true, sparse: true });
      await messagesCollection().createIndex({ senderId: 1, receiverId: 1, createdAt: 1 });

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

    async listUsers() {
      return (await usersCollection().find({}).sort({ createdAt: 1 }).toArray()).map(mapUser);
    },

    async getContacts(userId) {
      return (await usersCollection().find({ id: { $ne: userId } }).sort({ name: 1 }).toArray()).map(mapUser);
    },

    async saveMessage(message) {
      await messagesCollection().insertOne(message);
      return message;
    },

    async getConversation(userId, contactId) {
      const documents = await messagesCollection()
        .find({
          $or: [
            { senderId: userId, receiverId: contactId },
            { senderId: contactId, receiverId: userId }
          ]
        })
        .sort({ createdAt: 1 })
        .toArray();

      return documents.map(mapMessage);
    },

    async listMessages() {
      return (await messagesCollection().find({}).sort({ createdAt: 1 }).toArray()).map(mapMessage);
    }
  };
}
