const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

function authHeaders(token) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

export async function registerUser(payload, token) {
  const response = await fetch(`${API_URL}/api/register`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Registration failed");
  return response.json();
}

export async function updateUser(userId, payload, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Unable to update profile");
  return response.json();
}

export async function verifyOtp(code, phone) {
  const response = await fetch(`${API_URL}/api/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, phone })
  });

  if (!response.ok) throw new Error("OTP verification failed");
  return response.json();
}

export async function getContacts(userId, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/contacts`, {
    headers: authHeaders(token)
  });
  if (!response.ok) throw new Error("Unable to fetch contacts");
  return response.json();
}

export async function addContact(userId, payload, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/contacts`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(body.error || "Unable to add contact");
    error.invite = body.invite;
    throw error;
  }
  return body;
}

export async function getGroups(userId, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/groups`, {
    headers: authHeaders(token)
  });
  if (!response.ok) throw new Error("Unable to fetch groups");
  return response.json();
}

export async function createGroup(userId, payload, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/groups`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Unable to create group");
  return response.json();
}

export async function getConversation(userId, contactId, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/conversations/${contactId}`, {
    headers: authHeaders(token)
  });
  if (!response.ok) throw new Error("Unable to fetch conversation");
  return response.json();
}

export async function getGroupConversation(userId, groupId, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/groups/${groupId}/messages`, {
    headers: authHeaders(token)
  });
  if (!response.ok) throw new Error("Unable to fetch group conversation");
  return response.json();
}

export async function uploadLocalMedia(userId, payload, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/uploads`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Unable to upload media");
  return response.json();
}

export async function deleteConversation(userId, contactId, token) {
  const response = await fetch(`${API_URL}/api/users/${userId}/conversations/${contactId}`, {
    method: "DELETE",
    headers: authHeaders(token)
  });

  if (!response.ok) throw new Error("Unable to delete conversation");
  return response.json();
}

export async function translateCaption(payload, token) {
  const response = await fetch(`${API_URL}/api/translate`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Unable to translate caption");
  return response.json();
}

export { API_URL };
