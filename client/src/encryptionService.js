import CryptoJS from 'crypto-js';

// Shared secret for encryption (in production, use proper key management)
// This should match the server key
const ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'weconnect-translation-chat-secret-key-2024';

export function encryptMessage(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decryptMessage(encryptedText) {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('Failed to decrypt message:', error);
    return encryptedText; // Return encrypted text if decryption fails
  }
}