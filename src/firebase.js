import { initializeApp } from "firebase/app";
import {
  getDatabase, ref, get, set, remove, onValue, query, orderByChild,
} from "firebase/database";

// 環境変数（.env または Vercel ダッシュボードで設定）
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MSG_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ── ルーム操作 API（window.storage 互換ラッパー） ──────────
export const roomRef  = (code) => ref(db, `rooms/${code}`);
export const getRoom  = async (code) => {
  const snap = await get(roomRef(code));
  if (!snap.exists()) throw new Error("not found");
  return snap.val();
};
export const setRoom  = (code, data) => set(roomRef(code), data);
export const delRoom  = (code) => remove(roomRef(code));

// リアルタイム監視（Firebaseの強み：ポーリング不要）
export const watchRoom = (code, callback) => {
  return onValue(roomRef(code), (snap) => {
    callback(snap.exists() ? snap.val() : null);
  });
};

// 古いルーム取得（クリーンアップ用）
export const listRooms = async () => {
  const snap = await get(ref(db, "rooms"));
  if (!snap.exists()) return {};
  return snap.val();
};
