// Firebase Configuration
// REPLACE the object below with your own config from Firebase Console
const firebaseConfig = {
    apiKey: "AIzaSyAYw9Dm3cFW7Gwdyi2p2yxJGjPW5UAwo5U",
    authDomain: "savi-shakthi-pos.firebaseapp.com",
    projectId: "savi-shakthi-pos",
    storageBucket: "savi-shakthi-pos.firebasestorage.app",
    messagingSenderId: "257059040095",
    appId: "1:257059040095:web:a67bb71293a5b40fb764ea"
};

// Initialize Firebase (Compat mode)
firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

console.log("Firebase initialized");
