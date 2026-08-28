
// Firebase Configuration - SAVI SHAKTHI POS
const firebaseConfig = {
    apiKey: "AIzaSyAYw9Dm3cFW7Gwdyi2p2yxJGjPW5UAwo5U",
    authDomain: "savi-shakthi-pos.firebaseapp.com",
    projectId: "savi-shakthi-pos",
    storageBucket: "savi-shakthi-pos.firebasestorage.app",
    messagingSenderId: "257059040095",
    appId: "1:257059040095:web:638ac604a3993aa1b764ea"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const cloudDB = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
cloudDB.enablePersistence().catch((err) => {
    if (err.code == 'failed-precondition') {
        console.warn('Firestore Persistence failed: Multiple tabs open');
    } else if (err.code == 'unimplemented') {
        console.warn('Firestore Persistence failed: Browser not supported');
    }
});
