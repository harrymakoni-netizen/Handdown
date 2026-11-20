import { getApps, initializeApp } from 'firebase/app';

// Public web configuration from the registered Handdown Web app.
// Replace this configuration when the temporary sprint project expires.
const firebaseConfig = {
  apiKey: 'AIzaSyCAJ5tZSJnQaEa-49SU8FqIN6LC6v9iOBs',
  authDomain: 'fbailogic26vrt-3048.firebaseapp.com',
  projectId: 'fbailogic26vrt-3048',
  storageBucket: 'fbailogic26vrt-3048.firebasestorage.app',
  messagingSenderId: '716617989572',
  appId: '1:716617989572:web:c74b46071759c700e83891',
};

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
