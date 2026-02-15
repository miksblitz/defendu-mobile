// Same Firebase project as defendu-app (web) - Realtime Database
import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBKq8u_QrSt5jontBA338Fk9PEjnD4pmdA',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'defendu-e7970.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'defendu-e7970',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'defendu-e7970.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '256989481360',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:256989481360:web:458b011aa0089b3a940b15',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-613DQ6W3FX',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? 'https://defendu-e7970-default-rtdb.asia-southeast1.firebasedatabase.app',
};

const app = initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // Fallback so app always loads: use default auth (memory persistence)
  auth = getAuth(app);
}

export { auth };
export const db = getDatabase(app);
export default app;
