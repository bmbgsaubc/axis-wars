import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBO2MTjG8HZQEbtpqpQSIqWYFof3QH1j8E",
  authDomain: "axiswars.firebaseapp.com",
  projectId: "axiswars",
  storageBucket: "axiswars.firebasestorage.app",
  messagingSenderId: "187923812440",
  appId: "1:187923812440:web:2a9c1ed299cf6081bdba2d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

export async function ensureAnonAuth() {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}