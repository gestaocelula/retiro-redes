import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import { getAuth } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { getFirestore } from
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDhleRcRHjEUmRRn638R5-L4B83t0HLLT4",
  authDomain: "gestao-de-retiro---redes.firebaseapp.com",
  projectId: "gestao-de-retiro---redes",
  storageBucket: "gestao-de-retiro---redes.firebasestorage.app",
  messagingSenderId: "1035765137992",
  appId: "1:1035765137992:web:faafa994c696ad0467ce7d",
  measurementId: "G-C0L89FE4X1"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

console.log("Firebase inicializado:", app.options.projectId);