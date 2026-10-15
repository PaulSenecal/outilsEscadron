// Saisie à plusieurs : la même base Firebase que la partie en direct du Quizzer.
//
// Qui peut quoi (appliqué par les règles de la base, quizzer/regles-firebase.json, nœud « jo ») :
//   - l'organisateur (le navigateur qui a ouvert la saisie à plusieurs) lit et écrit tout ;
//   - un juge demande l'accès avec son nom ; il ne peut rien lire ni écrire tant que
//     l'organisateur ne l'a pas validé, puis seulement les épreuves qui lui sont attribuées.
// Aucun nom de cadet n'est envoyé : seulement les noms des équipes, les résultats et le nom des juges.
import { db, connexion, ref, set, remove, onValue, serverTimestamp, messageErreurFirebase } from '../quizzer/direct.js';

export { connexion, messageErreurFirebase };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function nouveauCode() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map(x => ALPHABET[x % ALPHABET.length]).join('');
}

const chemin = (code, ...p) => ref(db, ['jo', code, ...p].join('/'));
// Firebase refuse les valeurs undefined.
const propre = v => JSON.parse(JSON.stringify(v == null ? null : v));

export const infosDe = etat => propre({ equipes: etat.equipes, reglages: etat.reglages });

// ── organisateur ────────────────────────────────────────────────

export async function creer(etat) {
  const u = await connexion();
  const code = nouveauCode();
  await set(chemin(code), propre({
    proprio: u.uid, cree: serverTimestamp(), infos: infosDe(etat),
    resultats: etat.resultats || {}, bonus: etat.bonus || {}
  }));
  return code;
}

export async function suivreOrga(code, cb) {
  await connexion();
  const stop = [];
  const ecoute = (p, f) => stop.push(onValue(chemin(code, p), s => f(s.val()), e => cb.erreur && cb.erreur(e)));
  ecoute('proprio', v => cb.proprio && cb.proprio(v));
  ecoute('resultats', v => cb.resultats(v || {}));
  ecoute('bonus', v => cb.bonus(v || {}));
  ecoute('demandes', v => cb.demandes(v || {}));
  ecoute('juges', v => cb.juges(v || {}));
  return () => stop.forEach(f => f());
}

export const ecrireInfos = (code, etat) => set(chemin(code, 'infos'), infosDe(etat));
export const ecrireResultat = (code, ep, eq, res, par) =>
  set(chemin(code, 'resultats', ep, eq), propre({ l: res.l, par: par || '', t: serverTimestamp() }));
export const ecrireBonus = (code, eq, b) => set(chemin(code, 'bonus', eq), propre(b));

export async function valider(code, uid, nom, droits) {
  await set(chemin(code, 'juges', uid), propre({ nom, ...droits }));
  await remove(chemin(code, 'demandes', uid));
}
export const refuser = (code, uid) => remove(chemin(code, 'demandes', uid));
export const retirer = (code, uid) => remove(chemin(code, 'juges', uid));
export const supprimer = code => remove(chemin(code));

// ── juge ────────────────────────────────────────────────────────

export async function demander(code, nom, souhait) {
  const u = await connexion();
  await set(chemin(code, 'demandes', u.uid), { nom, souhait: souhait || '', t: serverTimestamp() });
}
export async function annulerDemande(code) {
  const u = await connexion();
  await remove(chemin(code, 'demandes', u.uid));
}

// Statut du juge : 'aucun' | 'attente' | 'valide' (avec ses droits).
export async function suivreJuge(code, cb) {
  const u = await connexion();
  let juge, demande;
  const emettre = () => {
    if (juge === undefined || demande === undefined) return;
    cb(juge ? { statut: 'valide', ...juge } : { statut: demande ? 'attente' : 'aucun', nom: demande && demande.nom });
  };
  const a = onValue(chemin(code, 'juges', u.uid), s => { juge = s.val(); emettre(); }, cb.erreur);
  const b = onValue(chemin(code, 'demandes', u.uid), s => { demande = s.val(); emettre(); }, cb.erreur);
  return () => { a(); b(); };
}

export function suivreDonnees(code, cb, erreur) {
  const stop = ['infos', 'resultats', 'bonus'].map(p =>
    onValue(chemin(code, p), s => cb(p, s.val() || {}), erreur));
  return () => stop.forEach(f => f());
}

