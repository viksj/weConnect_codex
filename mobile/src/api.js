import { Platform } from "react-native";

const androidEmulatorUrl = "http://10.0.2.2:4000";
const localUrl = Platform.OS === "android" ? androidEmulatorUrl : "http://localhost:4000";

export const defaultApiUrl = process.env.EXPO_PUBLIC_API_URL || localUrl;

async function parseResponse(response, fallbackMessage) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || fallbackMessage);
  }
  return response.json();
}

export async function healthCheck(apiUrl) {
  const response = await fetch(`${apiUrl}/health`);
  return parseResponse(response, "Server is not reachable");
}

export async function registerUser(apiUrl, payload) {
  const response = await fetch(`${apiUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return parseResponse(response, "Registration failed");
}

export async function getContacts(apiUrl, userId) {
  const response = await fetch(`${apiUrl}/api/users/${userId}/contacts`);
  return parseResponse(response, "Unable to load contacts");
}

export async function getConversation(apiUrl, userId, contactId) {
  const response = await fetch(`${apiUrl}/api/users/${userId}/conversations/${contactId}`);
  return parseResponse(response, "Unable to load conversation");
}
