import { readFileSync } from "fs";
import { isAbsolute, resolve } from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

function resolveServiceAccountPath(filePath) {
  if (isAbsolute(filePath)) return filePath;
  return resolve(process.cwd(), filePath);
}

function createFirebaseAuth() {
  if (!serviceAccountPath) {
    return null;
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(readFileSync(resolveServiceAccountPath(serviceAccountPath), "utf8"));
    initializeApp({
      credential: cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
    });
  }

  return getAuth();
}

export const firebaseAdminAuth = createFirebaseAuth();

export function isDemoAuthEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_DEMO_OTP === "true";
}

export function createDemoAuthToken(phoneNumber) {
  const normalizedPhone = phoneNumber?.trim();
  if (!normalizedPhone) {
    throw new Error("Phone number is required for demo auth.");
  }

  const payload = {
    demo: true,
    uid: `demo:${normalizedPhone}`,
    phone_number: normalizedPhone
  };

  return `demo.${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

function verifyDemoToken(idToken) {
  if (!isDemoAuthEnabled() || !idToken?.startsWith("demo.")) {
    return null;
  }

  const encodedPayload = idToken.slice("demo.".length);
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  if (!payload?.demo || !payload.uid || !payload.phone_number) {
    throw new Error("Invalid demo auth token.");
  }

  return payload;
}

export async function verifyFirebaseToken(idToken) {
  const demoUser = verifyDemoToken(idToken);
  if (demoUser) {
    return demoUser;
  }

  if (!firebaseAdminAuth) {
    throw new Error("Firebase Admin is not configured.");
  }

  return firebaseAdminAuth.verifyIdToken(idToken);
}
