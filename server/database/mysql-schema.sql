CREATE DATABASE IF NOT EXISTS translation_chat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE translation_chat;

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
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  sender_id VARCHAR(64) NOT NULL,
  receiver_id VARCHAR(64) NOT NULL,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  source_language VARCHAR(16) NOT NULL,
  target_language VARCHAR(16) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  media_url VARCHAR(512) NULL,
  media_name VARCHAR(255) NULL,
  media_mime VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'delivered',
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_messages_conversation (sender_id, receiver_id, created_at),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_groups (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(140) NOT NULL,
  avatar VARCHAR(8) NOT NULL DEFAULT 'G',
  created_by VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_groups_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT fk_group_members_group FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  CONSTRAINT fk_group_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

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
);

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
);
