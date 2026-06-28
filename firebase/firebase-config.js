// ================================================================
// firebase/firebase-config.js - Firebase Initialization
// ================================================================

// ඔබේ සැබෑ Firebase Config එක (ඔබ දුන්නු එක)
const firebaseConfig = {
  apiKey: "AIzaSyBopvCfBcrP-RNvGiho53qfAlbtQqepn4Q",
  authDomain: "jdms-prod.firebaseapp.com",
  projectId: "jdms-prod",
  storageBucket: "jdms-prod.firebasestorage.app",
  messagingSenderId: "357773037935",
  appId: "1:357773037935:web:4d2e233855109f6c64589a",
  measurementId: "G-Y6LY2V1G9H"
};

// Firebase Initialize කරන්න (Compat SDK සඳහා)
firebase.initializeApp(firebaseConfig);

// පහසුව සඳහා Global References හදාගන්න
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Firestore Offline Persistence Enable කරන්න (අන්තර්ජාලය නැති වෙලාවට)
db.enablePersistence()
  .then(() => console.log('🔥 Offline persistence enabled'))
  .catch(err => console.warn('Firestore persistence error:', err));

console.log('✅ Firebase initialized successfully!');
