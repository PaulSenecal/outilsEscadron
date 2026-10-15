// Partie en direct : connexion Firebase et outils communs
// à animateur.html (grand écran) et joueur.html (téléphones).
//
// La configuration Firebase n'est pas secrète : elle identifie le projet.
// La sécurité repose sur les règles de la base (regles-firebase.json).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js';
export { ref, get, set, update, remove, onValue, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDFwa4Vw55B-c6_IwH2371zm0JxRarRhC0',
  authDomain: 'quizzer-90b2a.firebaseapp.com',
  databaseURL: 'https://quizzer-90b2a-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'quizzer-90b2a',
  storageBucket: 'quizzer-90b2a.firebasestorage.app',
  messagingSenderId: '214791487658',
  appId: '1:214791487658:web:4962b7cde1fe96d91050d3'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
export const db = getDatabase(app);

// Connexion anonyme : chaque navigateur garde le même identifiant d'une visite
// à l'autre, ce qui permet à un joueur qui recharge la page de retrouver sa place.
export async function connexion() {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

export function messageErreurFirebase(err) {
  const c = String(err && (err.code || err.message) || err);
  if (/operation-not-allowed|admin-restricted|configuration-not-found/.test(c))
    return "La connexion anonyme n'est pas activée dans Firebase (Authentication → Méthode de connexion → Anonyme).";
  if (/permission[_-]denied/i.test(c))
    return 'Accès refusé par les règles de la base.';
  if (/network/i.test(c))
    return 'Pas de connexion internet.';
  return esc(c);
}

// Heure du serveur, pour que chronos et points ne dépendent pas de l'horloge des appareils.
let decalage = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => { decalage = s.val() || 0; });
export const maintenant = () => Date.now() + decalage;

// ── outils d'affichage (mêmes conventions que quiz.html) ──────────
export const LETTRES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const $ = id => document.getElementById(id);

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export function melanger(t) {
  const a = t.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ecran(id) {
  document.querySelectorAll('.ecran').forEach(e => e.classList.toggle('actif', e.id === id));
  window.scrollTo({ top: 0 });
}

export function echec(titre, detail) {
  ecran('e-charge');
  const m = $('charge-msg');
  m.classList.add('erreur');
  m.innerHTML = '<strong>' + esc(titre) + '</strong>' + detail;
}

// Firebase renvoie parfois les tableaux sous forme d'objets {0:…, 1:…}.
export const liste = v => Array.isArray(v) ? v.filter(x => x != null) : (v ? Object.values(v) : []);

// Joueurs triés par score décroissant.
export function classement(salle) {
  const scores = (salle && salle.scores) || {};
  return Object.entries((salle && salle.joueurs) || {})
    .map(([id, j]) => Object.assign({ id: id, nom: j.nom, total: 0, gain: 0, bons: 0, juste: false, repondu: false }, scores[id]))
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
}
