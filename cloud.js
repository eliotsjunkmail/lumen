import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js";
import { firebaseConfig, isCloudConfigured } from "./config.js";

let app = null;
let auth = null;
let db = null;
let storage = null;
let ready = null;

export function cloudConfigured() {
  return isCloudConfigured();
}

export async function initCloud() {
  if (!isCloudConfigured()) return null;
  if (ready) return ready;

  ready = (async () => {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);

    await new Promise((resolve, reject) => {
      const unsub = onAuthStateChanged(
        auth,
        async (user) => {
          try {
            if (!user) await signInAnonymously(auth);
            unsub();
            resolve(auth.currentUser);
          } catch (err) {
            unsub();
            reject(err);
          }
        },
        reject
      );
    });

    return {
      uid: auth.currentUser.uid,
      auth,
      db,
      storage,
    };
  })();

  return ready;
}

export function currentUid() {
  return auth?.currentUser?.uid || null;
}

/** Upload video + create a shared geo spot. */
export async function publishSpot({ file, name, lat, lng, heading = 0 }) {
  const session = await initCloud();
  if (!session) throw new Error("Cloud sharing is not configured");

  const uid = session.uid;
  const safe = String(name || "Untitled")
    .trim()
    .slice(0, 80);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `spots/${uid}/${id}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file, {
    contentType: file.type || "video/mp4",
    customMetadata: { name: safe },
  });
  const videoUrl = await getDownloadURL(storageRef);

  const docRef = await addDoc(collection(db, "spots"), {
    name: safe,
    lat,
    lng,
    heading,
    videoUrl,
    storagePath: path,
    uid,
    createdAt: serverTimestamp(),
  });

  return {
    id: docRef.id,
    name: safe,
    lat,
    lng,
    heading,
    videoUrl,
    storagePath: path,
    uid,
  };
}

/** Load recent spots (client filters by distance). */
export async function fetchSpots(max = 200) {
  const session = await initCloud();
  if (!session) return [];

  const q = query(collection(db, "spots"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteSpot(spot) {
  const session = await initCloud();
  if (!session) throw new Error("Cloud sharing is not configured");
  if (!spot?.id) return;
  if (spot.uid && spot.uid !== session.uid) {
    throw new Error("Only the uploader can delete this video");
  }

  await deleteDoc(doc(db, "spots", spot.id));
  if (spot.storagePath) {
    try {
      await deleteObject(ref(storage, spot.storagePath));
    } catch (err) {
      console.warn("Storage delete failed", err);
    }
  }
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** East / Up / North(-Z) meters from origin → local Three.js offset. */
export function enuFromOrigin(originLat, originLng, lat, lng) {
  const R = 6378137;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat - originLat);
  const dLng = toRad(lng - originLng);
  const east = dLng * Math.cos(toRad(originLat)) * R;
  const north = dLat * R;
  return { x: east, y: 0, z: -north };
}

export function offsetLatLng(lat, lng, eastM, northM) {
  const R = 6378137;
  const dLat = (northM / R) * (180 / Math.PI);
  const dLng =
    (eastM / (R * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}
