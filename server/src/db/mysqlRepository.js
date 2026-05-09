import mysql from "mysql2/promise";
import { v4 as uuid } from "uuid";
import { seedUsers } from "./seedUsers.js";

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    emailOrPhone: row.email_or_phone,
    firebaseUid: row.firebase_uid,
    motherTongue: row.mother_tongue,
    understands: row.understands,
    avatar: row.avatar
  };
}

function mapMessage(row) {
  if (!row) return null;

  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    originalText: row.original_text,
    translatedText: row.translated_text,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export function createMySqlRepository() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "localhost",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "translation_chat",
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    namedPlaceholders: true
  });

  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        email_or_phone VARCHAR(160) NOT NULL UNIQUE,
        firebase_uid VARCHAR(160) NULL UNIQUE,
        mother_tongue VARCHAR(16) NOT NULL DEFAULT 'hi',
        understands VARCHAR(16) NOT NULL DEFAULT 'en',
        avatar VARCHAR(8) NOT NULL DEFAULT 'U',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id VARCHAR(64) PRIMARY KEY,
        sender_id VARCHAR(64) NOT NULL,
        receiver_id VARCHAR(64) NOT NULL,
        original_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_language VARCHAR(16) NOT NULL,
        target_language VARCHAR(16) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'delivered',
        created_at DATETIME(3) NOT NULL,
        INDEX idx_messages_conversation (sender_id, receiver_id, created_at),
        CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        user_id VARCHAR(64) NOT NULL,
        contact_id VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, contact_id),
        CONSTRAINT fk_contacts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_contacts_contact FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversation_deletions (
        user_id VARCHAR(64) NOT NULL,
        contact_id VARCHAR(64) NOT NULL,
        deleted_at DATETIME(3) NOT NULL,
        PRIMARY KEY (user_id, contact_id),
        CONSTRAINT fk_conversation_deletions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_conversation_deletions_contact FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  }

  async function seedDemoUsers() {
    const [rows] = await pool.query("SELECT COUNT(*) AS count FROM users");
    if (rows[0].count > 0) return;

    await Promise.all(
      seedUsers.map((user) =>
        pool.query(
          `INSERT INTO users
            (id, name, email_or_phone, firebase_uid, mother_tongue, understands, avatar)
           VALUES
            (:id, :name, :emailOrPhone, :firebaseUid, :motherTongue, :understands, :avatar)`,
          user
        )
      )
    );
  }

  return {
    async init() {
      if (process.env.DB_INIT_SCHEMA !== "false") {
        await ensureSchema();
      }

      if (process.env.DB_SEED_DEMO_USERS !== "false") {
        await seedDemoUsers();
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
        avatar: payload.name?.charAt(0)?.toUpperCase() || "U"
      };

      await pool.query(
        `INSERT INTO users
          (id, name, email_or_phone, firebase_uid, mother_tongue, understands, avatar)
         VALUES
          (:id, :name, :emailOrPhone, :firebaseUid, :motherTongue, :understands, :avatar)
         ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          firebase_uid = VALUES(firebase_uid),
          mother_tongue = VALUES(mother_tongue),
          understands = VALUES(understands),
          avatar = VALUES(avatar)`,
        user
      );

      return user;
    },

    async findUserByIdentity(payload) {
      const [rows] = await pool.query(
        `SELECT * FROM users
         WHERE email_or_phone = :emailOrPhone
            OR (:firebaseUid IS NOT NULL AND firebase_uid = :firebaseUid)
         LIMIT 1`,
        {
          emailOrPhone: payload.emailOrPhone,
          firebaseUid: payload.firebaseUid || null
        }
      );

      return mapUser(rows[0]);
    },

    async getUserById(userId) {
      const [rows] = await pool.query("SELECT * FROM users WHERE id = :userId LIMIT 1", { userId });
      return mapUser(rows[0]);
    },

    async updateUser(userId, payload) {
      const user = {
        userId,
        name: payload.name,
        motherTongue: payload.motherTongue || "hi",
        understands: payload.understands || "en",
        avatar: payload.name?.charAt(0)?.toUpperCase() || "U"
      };

      await pool.query(
        `UPDATE users
         SET name = :name,
             mother_tongue = :motherTongue,
             understands = :understands,
             avatar = :avatar
         WHERE id = :userId`,
        user
      );

      return this.getUserById(userId);
    },

    async findUserByPhone(emailOrPhone) {
      const [rows] = await pool.query("SELECT * FROM users WHERE email_or_phone = :emailOrPhone LIMIT 1", {
        emailOrPhone
      });
      return mapUser(rows[0]);
    },

    async listUsers() {
      const [rows] = await pool.query("SELECT * FROM users ORDER BY created_at ASC");
      return rows.map(mapUser);
    },

    async getContacts(userId) {
      const [rows] = await pool.query(
        `SELECT users.*
         FROM contacts
         INNER JOIN users ON users.id = contacts.contact_id
         WHERE contacts.user_id = :userId
         ORDER BY users.name ASC`,
        { userId }
      );
      return rows.map(mapUser);
    },

    async addContact(userId, contactId) {
      await pool.query(
        `INSERT IGNORE INTO contacts (user_id, contact_id)
         VALUES (:userId, :contactId)`,
        { userId, contactId }
      );
      return this.getUserById(contactId);
    },

    async saveMessage(message) {
      await pool.query(
        `INSERT INTO messages
          (id, sender_id, receiver_id, original_text, translated_text, source_language, target_language, status, created_at)
         VALUES
          (:id, :senderId, :receiverId, :originalText, :translatedText, :sourceLanguage, :targetLanguage, :status, :createdAt)`,
        message
      );

      return message;
    },

    async getConversation(userId, contactId) {
      const [rows] = await pool.query(
        `SELECT messages.*
         FROM messages
         LEFT JOIN conversation_deletions
           ON conversation_deletions.user_id = :userId
          AND conversation_deletions.contact_id = :contactId
         WHERE (
             (sender_id = :userId AND receiver_id = :contactId)
             OR (sender_id = :contactId AND receiver_id = :userId)
           )
           AND (
             conversation_deletions.deleted_at IS NULL
             OR messages.created_at > conversation_deletions.deleted_at
           )
         ORDER BY messages.created_at ASC`,
        { userId, contactId }
      );

      return rows.map(mapMessage);
    },

    async softDeleteConversation(userId, contactId) {
      await pool.query(
        `INSERT INTO conversation_deletions (user_id, contact_id, deleted_at)
         VALUES (:userId, :contactId, :deletedAt)
         ON DUPLICATE KEY UPDATE deleted_at = VALUES(deleted_at)`,
        { userId, contactId, deletedAt: new Date().toISOString() }
      );
      return { deleted: true };
    },

    async listMessages() {
      const [rows] = await pool.query("SELECT * FROM messages ORDER BY created_at ASC");
      return rows.map(mapMessage);
    }
  };
}
