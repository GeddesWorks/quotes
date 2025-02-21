import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyDnnxtttNQgY3brFTKDs1BiUtWHKPRdMwM",
    authDomain: "bryce-1c78f.firebaseapp.com",
    projectId: "bryce-1c78f",
    storageBucket: "bryce-1c78f.firebasestorage.app",
    messagingSenderId: "673582282823",
    appId: "1:673582282823:web:13a8ea4bbaaf2a4db2d962",
    measurementId: "G-PQGTLZTWZ5"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
