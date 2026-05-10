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
    groupId: row.group_id || null,
    originalText: row.original_text,
    translatedText: row.translated_text,
    sourceLanguage: row.source_language,
    targetLanguage: row.target_language,
    messageType: row.message_type || "text",
    mediaUrl: row.media_url || null,
    mediaName: row.media_name || null,
    mediaMime: row.media_mime || null,
    status: row.status,
    readAt: row.read_at instanceof Date ? row.read_at.toISOString() : row.read_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function mapGroup(row) {
  if (!row) return null;

  return {
    id: row.id,
    type: "group",
    name: row.name,
    avatar: row.avatar,
    createdBy: row.created_by,
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

    await pool.query("ALTER TABLE messages ADD COLUMN read_at DATETIME(3) NULL").catch((error) => {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    });
    await pool.query("ALTER TABLE messages ADD COLUMN message_type VARCHAR(32) NOT NULL DEFAULT 'text'").catch((error) => {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    });
    await pool.query("ALTER TABLE messages ADD COLUMN media_url VARCHAR(512) NULL").catch((error) => {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    });
    await pool.query("ALTER TABLE messages ADD COLUMN media_name VARCHAR(255) NULL").catch((error) => {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    });
    await pool.query("ALTER TABLE messages ADD COLUMN media_mime VARCHAR(120) NULL").catch((error) => {
      if (error.code !== "ER_DUP_FIELDNAME") throw error;
    });

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_groups (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(140) NOT NULL,
        avatar VARCHAR(8) NOT NULL DEFAULT 'G',
        created_by VARCHAR(64) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_chat_groups_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        role VARCHAR(32) NOT NULL DEFAULT 'member',
        joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_messages (
        id VARCHAR(64) PRIMARY KEY,
        group_id VARCHAR(64) NOT NULL,
        sender_id VARCHAR(64) NOT NULL,
        original_text TEXT NOT NULL,
        source_language VARCHAR(16) NOT NULL,
        message_type VARCHAR(32) NOT NULL DEFAULT 'text',
        media_url VARCHAR(512) NULL,
        media_name VARCHAR(255) NULL,
        media_mime VARCHAR(120) NULL,
        created_at DATETIME(3) NOT NULL,
        INDEX idx_group_messages (group_id, created_at),
        CONSTRAINT fk_group_messages_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_group_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_message_reads (
        group_id VARCHAR(64) NOT NULL,
        message_id VARCHAR(64) NOT NULL,
        user_id VARCHAR(64) NOT NULL,
        read_at DATETIME(3) NOT NULL,
        PRIMARY KEY (message_id, user_id),
        INDEX idx_group_reads_user (group_id, user_id),
        CONSTRAINT fk_group_reads_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
        CONSTRAINT fk_group_reads_message FOREIGN KEY (message_id) REFERENCES group_messages(id) ON DELETE CASCADE,
        CONSTRAINT fk_group_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
        understands: payload.understands || payload.motherTongue || "hi",
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
        understands: payload.understands || payload.motherTongue || "hi",
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

    async getConversationSummary(userId, contactId) {
      const [lastRows] = await pool.query(
        `SELECT *
         FROM messages
         WHERE (sender_id = :userId AND receiver_id = :contactId)
            OR (sender_id = :contactId AND receiver_id = :userId)
         ORDER BY created_at DESC
         LIMIT 1`,
        { userId, contactId }
      );
      const [unreadRows] = await pool.query(
        `SELECT COUNT(*) AS unreadCount
         FROM messages
         WHERE sender_id = :contactId
           AND receiver_id = :userId
           AND status <> 'read'`,
        { userId, contactId }
      );

      return {
        unreadCount: Number(unreadRows[0]?.unreadCount || 0),
        lastMessage: mapMessage(lastRows[0])
      };
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
      const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
      const formattedCreatedAt = `${createdAt.toISOString().slice(0, 19).replace("T", " ")}`;

      await pool.query(
        `INSERT INTO messages
          (id, sender_id, receiver_id, original_text, translated_text, source_language, target_language, message_type, media_url, media_name, media_mime, status, created_at)
         VALUES
          (:id, :senderId, :receiverId, :originalText, :translatedText, :sourceLanguage, :targetLanguage, :messageType, :mediaUrl, :mediaName, :mediaMime, :status, :createdAt)`,
        {
          ...message,
          messageType: message.messageType || "text",
          mediaUrl: message.mediaUrl || null,
          mediaName: message.mediaName || null,
          mediaMime: message.mediaMime || null,
          createdAt: formattedCreatedAt
        }
      );

      return { ...message, createdAt: formattedCreatedAt };
    },

    async createGroup(payload) {
      const group = {
        id: payload.id || uuid(),
        name: payload.name,
        avatar: payload.name?.charAt(0)?.toUpperCase() || "G",
        createdBy: payload.createdBy
      };
      const memberIds = Array.from(new Set([payload.createdBy, ...(payload.memberIds || [])]));

      await pool.query(
        `INSERT INTO chat_groups (id, name, avatar, created_by)
         VALUES (:id, :name, :avatar, :createdBy)`,
        group
      );
      await Promise.all(
        memberIds.map((memberId) =>
          pool.query(
            `INSERT IGNORE INTO group_members (group_id, user_id, role)
             VALUES (:groupId, :userId, :role)`,
            {
              groupId: group.id,
              userId: memberId,
              role: memberId === payload.createdBy ? "admin" : "member"
            }
          )
        )
      );

      return group;
    },

    async getGroups(userId) {
      const [rows] = await pool.query(
        `SELECT chat_groups.*
         FROM group_members
         INNER JOIN chat_groups ON chat_groups.id = group_members.group_id
         WHERE group_members.user_id = :userId
         ORDER BY chat_groups.created_at DESC`,
        { userId }
      );
      return rows.map(mapGroup);
    },

    async getGroupByIdForUser(groupId, userId) {
      const [rows] = await pool.query(
        `SELECT chat_groups.*
         FROM group_members
         INNER JOIN chat_groups ON chat_groups.id = group_members.group_id
         WHERE chat_groups.id = :groupId
           AND group_members.user_id = :userId
         LIMIT 1`,
        { groupId, userId }
      );
      return mapGroup(rows[0]);
    },

    async getGroupMembers(groupId) {
      const [rows] = await pool.query(
        `SELECT users.*
         FROM group_members
         INNER JOIN users ON users.id = group_members.user_id
         WHERE group_members.group_id = :groupId
         ORDER BY users.name ASC`,
        { groupId }
      );
      return rows.map(mapUser);
    },

    async getGroupSummary(userId, groupId) {
      const [lastRows] = await pool.query(
        `SELECT group_messages.*, NULL AS receiver_id, group_id, 'delivered' AS status, NULL AS read_at
         FROM group_messages
         WHERE group_id = :groupId
         ORDER BY created_at DESC
         LIMIT 1`,
        { groupId }
      );
      const [unreadRows] = await pool.query(
        `SELECT COUNT(*) AS unreadCount
         FROM group_messages
         LEFT JOIN group_message_reads
           ON group_message_reads.message_id = group_messages.id
          AND group_message_reads.user_id = :userId
         WHERE group_messages.group_id = :groupId
           AND group_messages.sender_id <> :userId
           AND group_message_reads.message_id IS NULL`,
        { userId, groupId }
      );

      return {
        unreadCount: Number(unreadRows[0]?.unreadCount || 0),
        lastMessage: mapMessage(lastRows[0])
      };
    },

    async saveGroupMessage(message) {
      const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();
      const formattedCreatedAt = `${createdAt.toISOString().slice(0, 19).replace("T", " ")}`;

      await pool.query(
        `INSERT INTO group_messages
          (id, group_id, sender_id, original_text, source_language, message_type, media_url, media_name, media_mime, created_at)
         VALUES
          (:id, :groupId, :senderId, :originalText, :sourceLanguage, :messageType, :mediaUrl, :mediaName, :mediaMime, :createdAt)`,
        {
          ...message,
          messageType: message.messageType || "text",
          mediaUrl: message.mediaUrl || null,
          mediaName: message.mediaName || null,
          mediaMime: message.mediaMime || null,
          createdAt: formattedCreatedAt
        }
      );

      return { ...message, createdAt: formattedCreatedAt };
    },

    async getGroupMessages(groupId, userId) {
      const [rows] = await pool.query(
        `SELECT group_messages.*, NULL AS receiver_id, group_messages.group_id, 'delivered' AS status, group_message_reads.read_at
         FROM group_messages
         LEFT JOIN group_message_reads
           ON group_message_reads.message_id = group_messages.id
          AND group_message_reads.user_id = :userId
         WHERE group_messages.group_id = :groupId
         ORDER BY group_messages.created_at ASC`,
        { groupId, userId }
      );
      return rows.map(mapMessage);
    },

    async markGroupRead(userId, groupId) {
      const readAt = new Date();
      const formattedReadAt = readAt.toISOString().slice(0, 19).replace("T", " ");
      const [rows] = await pool.query(
        `SELECT id
         FROM group_messages
         WHERE group_id = :groupId
           AND sender_id <> :userId
           AND id NOT IN (
             SELECT message_id
             FROM group_message_reads
             WHERE group_id = :groupId
               AND user_id = :userId
           )`,
        { userId, groupId }
      );
      const updatedIds = rows.map((row) => row.id);

      if (updatedIds.length > 0) {
        await Promise.all(
          updatedIds.map((messageId) =>
            pool.query(
              `INSERT IGNORE INTO group_message_reads (group_id, message_id, user_id, read_at)
               VALUES (:groupId, :messageId, :userId, :readAt)`,
              { groupId, messageId, userId, readAt: formattedReadAt }
            )
          )
        );
      }

      return { updatedIds, status: "read", readAt: readAt.toISOString() };
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

    async markConversationRead(userId, contactId) {
      const readAt = new Date();
      const formattedReadAt = readAt.toISOString().slice(0, 19).replace("T", " ");
      const [rows] = await pool.query(
        `SELECT id
         FROM messages
         WHERE sender_id = :contactId
           AND receiver_id = :userId
           AND status <> 'read'`,
        { userId, contactId }
      );
      const updatedIds = rows.map((row) => row.id);

      if (updatedIds.length > 0) {
        await pool.query(
          `UPDATE messages
           SET status = 'read',
               read_at = :readAt
           WHERE id IN (:updatedIds)`,
          { readAt: formattedReadAt, updatedIds }
        );
      }

      return { updatedIds, status: "read", readAt: readAt.toISOString() };
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
