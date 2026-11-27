import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, deleteDoc, onSnapshot, collection, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { initializeFirestore } from 'firebase/firestore';
import { authFormError } from '@hub/src/authForm.js';
import { sanitizeRoadmapForStore } from '@hub/src/lib/roadmapStore.js';
import { APP_ID, firebaseConfig } from './config.js';
import { apiPost } from './api.js';
import { googleSignIn as nativeGoogle } from './native.js';
import { logNativeEvent } from './native.js';

const app = getApps()[0] || initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
const db = initializeFirestore(app, { experimentalForceLongPolling: true });

const AuthContext = createContext(null);
export function useAuth() {
  return useContext(AuthContext);
}

const AUTH_ERRORS = {
  'auth/invalid-email': 'That email address does not look valid.',
  'auth/user-not-found': 'No account uses that email yet.',
  'auth/wrong-password': 'That password is not right.',
  'auth/invalid-credential': 'Email or password is not right.',
  'auth/email-already-in-use': 'An account already uses that email. Try signing in.',
  'auth/weak-password': 'Please use a password with at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/network-request-failed': 'The network request failed. Check your connection and try again.'
};

export function authMessage(err) {
  return AUTH_ERRORS[err?.code] || err?.message || 'Something went wrong. Try again.';
}

async function trackAuth(cred) {
  const info = getAdditionalUserInfo(cred);
  const method = cred?.user?.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'password';
  await logNativeEvent(info?.isNewUser ? 'sign_up' : 'login', { method });
  if (info?.isNewUser) {
    try {
      const token = await cred.user.getIdToken();
      await apiPost('/api/account', { action: 'signup-notify' }, token);
    } catch {
      /* the account still exists if the alert email fails */
    }
  }
}

export function AuthProvider({ children, analyticsOn }) {
  const [user, setUser] = useState(undefined);
  const [plans, setPlans] = useState([]);
  const [plansError, setPlansError] = useState('');

  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next)), []);

  useEffect(() => {
    if (!user) {
      setPlans([]);
      setPlansError('');
      return undefined;
    }
    const col = collection(db, 'artifacts', APP_ID, 'users', user.uid, 'roadmaps');
    return onSnapshot(
      col,
      (snap) => {
        setPlansError('');
        setPlans(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => setPlansError(authMessage(err))
    );
  }, [user]);

  const api = useMemo(() => {
    const token = () => user?.getIdToken() || Promise.resolve(null);
    return {
      user: user || null,
      ready: user !== undefined,
      plans,
      plansError,
      analyticsOn,
      async signUp(email, password) {
        const problem = authFormError({ email, password, mode: 'signup' });
        if (problem) throw new Error(problem.message);
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await trackAuth(cred);
        return cred.user;
      },
      async signIn(email, password) {
        const problem = authFormError({ email, password, mode: 'login' });
        if (problem) throw new Error(problem.message);
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        await trackAuth(cred);
        return cred.user;
      },
      async signInGoogle() {
        const out = await nativeGoogle();
        if (!out || out.error) throw new Error(out?.error || 'Google sign-in is not available.');
        if (!out.idToken) throw new Error(out.message || 'Google sign-in did not return a token.');
        const cred = await signInWithCredential(auth, GoogleAuthProvider.credential(out.idToken));
        await trackAuth(cred);
        return cred.user;
      },
      async reset(email) {
        const problem = authFormError({ email, mode: 'reset' });
        if (problem) throw new Error(problem.message);
        await sendPasswordResetEmail(auth, email.trim());
      },
      async signOut() {
        await signOut(auth);
      },
      async deleteAccount(confirm) {
        if (confirm !== 'DELETE') throw new Error('Type DELETE to confirm.');
        const access = await token();
        await apiPost('/api/account', { action: 'delete', confirm: 'DELETE' }, access);
        await signOut(auth).catch(() => {});
      },
      async savePlan(roadmap) {
        if (!user) throw new Error('Sign in to save a plan.');
        const id = String(roadmap.id || `${roadmap.exam}-${roadmap.level}-${roadmap.days}`);
        const clean = sanitizeRoadmapForStore({ ...roadmap, id }, id);
        if (!clean) throw new Error('This plan could not be saved.');
        await setDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'roadmaps', id), clean);
        return id;
      },
      async togglePhaseTask(roadmap, key) {
        if (!user || !roadmap?.id) return;
        const was = !!roadmap.completedTasks?.[key];
        await updateDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'roadmaps', roadmap.id), {
          [`completedTasks.${key}`]: !was
        });
      },
      async toggleCalendarTask(roadmap, taskKey) {
        if (!user || !roadmap?.id || !taskKey) return;
        const was = roadmap.progress?.done && taskKey in roadmap.progress.done;
        const ref = doc(db, 'artifacts', APP_ID, 'users', user.uid, 'roadmaps', roadmap.id);
        if (was) await updateDoc(ref, { [`progress.done.${taskKey}`]: deleteField() });
        else await updateDoc(ref, { [`progress.done.${taskKey}`]: Math.floor(Date.now() / 1000) });
      },
      async deletePlan(id) {
        if (!user || !id) return;
        await deleteDoc(doc(db, 'artifacts', APP_ID, 'users', user.uid, 'roadmaps', id));
      }
    };
  }, [user, plans, plansError, analyticsOn]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}
