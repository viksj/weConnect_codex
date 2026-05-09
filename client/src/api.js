const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export async function registerUser(payload) {
  const response = await fetch(`${API_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) throw new Error("Registration failed");
  return response.json();
}

export async function verifyOtp(code) {
  const response = await fetch(`${API_URL}/api/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });

  if (!response.ok) throw new Error("OTP verification failed");
  return response.json();
}

export async function getContacts(userId) {
  const response = await fetch(`${API_URL}/api/users/${userId}/contacts`);
  if (!response.ok) throw new Error("Unable to fetch contacts");
  return response.json();
}

export async function getConversation(userId, contactId) {
  const response = await fetch(`${API_URL}/api/users/${userId}/conversations/${contactId}`);
  if (!response.ok) throw new Error("Unable to fetch conversation");
  return response.json();
}

export { API_URL };
