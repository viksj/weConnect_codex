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

export async function verifyFirebaseToken(idToken) {
  if (!firebaseAdminAuth) {
    throw new Error("Firebase Admin is not configured.");
  }

  return firebaseAdminAuth.verifyIdToken(idToken);
}
