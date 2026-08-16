// Public Firebase web config (safe to ship — protect data with rules).
// Fill these from Firebase Console → Project settings → Your apps → SDK setup.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

export function isCloudConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.appId &&
      !String(firebaseConfig.apiKey).startsWith("YOUR_")
  );
}
