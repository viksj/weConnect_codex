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
  status VARCHAR(32) NOT NULL DEFAULT 'delivered',
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  INDEX idx_messages_conversation (sender_id, receiver_id, created_at),
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
