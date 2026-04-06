// Add the production hostname (e.g. dashboard.buildesk.ae) under Firebase Console → Authentication →
// Settings → Authorized domains, or OAuth popups/redirects will warn and fail on that domain.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBvmpkHnv_HspgNKQkjzHR5cCmKh7sbabU",
  authDomain: "buildesk-auth-otp.firebaseapp.com",
  projectId: "buildesk-auth-otp",
  storageBucket: "buildesk-auth-otp.firebasestorage.app",
  messagingSenderId: "192818163772",
  appId: "1:192818163772:web:f5104aa2b8989709d61339",
  measurementId: "G-D2DWKGTVXE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const analytics = getAnalytics(app);