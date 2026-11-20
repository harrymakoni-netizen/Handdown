import { getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

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

// Public site key registered for Handdown Web in Firebase App Check.
// Initialize before any Auth, Firestore, Storage or AI Logic clients are used.
// Local development needs a separately registered App Check debug provider;
// never enable debug attestation automatically in a deployed build.
export const appCheck = typeof window !== 'undefined'
  ? initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(
        '6LcHSSouAAAAAA-2u6X5xcp08QKJYLUfbLcVEyli',
      ),
      isTokenAutoRefreshEnabled: true,
    })
  : undefined;
