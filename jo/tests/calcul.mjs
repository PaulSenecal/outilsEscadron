// Tests de la logique des JO (jo/calcul.js). Données fictives uniquement.
// Lancement : node jo/tests/calcul.mjs
import * as J from '../calcul.js';

let ok = 0, ko = 0;
function test(nom, fn) {
  try { fn(); ok++; } catch (e) { ko++; console.error('✗ ' + nom + '\n  ' + e.message); }
}
function egal(a, b, msg = '') {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(msg + ' attendu ' + y + ', obtenu ' + x);
}
const proche = (a, b, msg) => { if (Math.abs(a - b) > 1e-6) throw new Error(msg + ' attendu ' + b + ', obtenu ' + a); };
// Hasard déterministe pour les tirages
const suite = (graine = 1) => n => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % n; };

test('lecture des temps', () => {
  proche(J.lireTemps('1:05.3'), 65.3, '1:05.3');
  proche(J.lireTemps("1'05\"3"), 65.3, "1'05\"3");
  proche(J.lireTemps('65,3'), 65.3, '65,3');
  proche(J.lireTemps('1m05'), 65, '1m05');
  proche(J.lireTemps('1,05,3'), 65.3, '1,05,3');
  proche(J.lireTemps('0:58.25'), 58.25, '0:58.25');
  egal(isNaN(J.lireTemps('1:75')), true, '1:75');
  egal(isNaN(J.lireTemps('abc')), true, 'abc');
  egal(J.formatTemps(65.3), '1:05.3');
  egal(J.formatTemps(58.25), '58.25 s');
  egal(J.formatTemps(205), '3:25');
});

const eqs = J.EQUIPES_DEFAUT;
const R = J.REGLAGES_DEFAUT;
const t400 = (...t) => ({ l: t.map(x => typeof x === 'string' ? { t: x } : x) });

test('400 m : cumul, classement, barème 10/5/2', () => {
  const res = {
    p1: t400('1:10', '1:10', '1:10'),   // 210
    p2: t400('1:05', '1:10', '1:10'),   // 205
    p3: t400('1:20', '1:10', '1:10'),   // 220
    p4: t400('1:30', '1:10', '1:10'),   // 230
    pcl: t400('1:15', '1:10', '1:10')   // 215
  };
  const c = J.classerEpreuve(J.EPREUVE.c400, res, eqs, R);
  egal(c.terminee, true);
  egal(c.lignes.map(x => [x.eq.id, x.place, x.points]), [['p2', 1, 10], ['p1', 2, 5], ['pcl', 3, 2], ['p3', 4, 0], ['p4', 5, 0]]);
});

test('ex aequo : même place, place suivante sautée', () => {
  const res = { p1: t400('1:00', '1:00', '1:00'), p2: t400('1:00', '1:00', '1:00'), p3: t400('1:01', '1:00', '1:00'),
    p4: t400('1:02', '1:00', '1:00'), pcl: t400('1:03', '1:00', '1:00') };
  const c = J.classerEpreuve(J.EPREUVE.c400, res, eqs, R);
  egal(c.lignes.map(x => [x.place, x.points, x.medaille]), [[1, 10, 'or'], [1, 10, 'or'], [3, 2, 'bronze'], [4, 0, null], [5, 0, null]]);
});

test('abandon classé après, disqualification non classée', () => {
  const res = { p1: t400('1:00', '1:00', '1:00'), p2: t400('1:00', { s: 'ab' }, '1:00'), p3: t400({ s: 'dq' }, '1:00', '1:00'),
    p4: t400('1:05', '1:00', '1:00'), pcl: t400('1:10', '1:00', '1:00') };
  const c = J.classerEpreuve(J.EPREUVE.c400, res, eqs, R);
  egal(c.lignes.map(x => [x.eq.id, x.etat, x.place, x.points]),
    [['p1', 'ok', 1, 10], ['p4', 'ok', 2, 5], ['pcl', 'ok', 3, 2], ['p2', 'ab', 4, 0], ['p3', 'dq', undefined, 0]]);
});

test('épreuve incomplète : provisoire', () => {
  const c = J.classerEpreuve(J.EPREUVE.c400, { p1: t400('1:00', '1:00') }, eqs, R);
  egal(c.terminee, false);
  egal(c.lignes.find(x => x.eq.id === 'p1').etat, 'incomplet');
});

test('vortex : meilleur jet par lanceur, x = nul', () => {
  const e = J.evaluerEquipe(J.EPREUVE.vortex, { l: [{ e1: '30', e2: 'x', e3: '32,5' }, { e1: 'x', e2: 'x', e3: 'x' }, { e1: '20', e2: '25', e3: '21' }] }, R);
  egal(e.etat, 'ok'); proche(e.v, 57.5, 'cumul');
});

test('PO individuel et PO avec charge : pénalités', () => {
  const a = J.evaluerEquipe(J.EPREUVE.poi, { l: [{ t: '2:00', obs: '1' }, { t: '2:00' }, { t: '2:00', obs: '2' }] }, R);
  proche(a.v, 390, 'poi');
  const b = J.evaluerEquipe(J.EPREUVE.poc, { l: [{ t: '5:00', sol: '1', zone: '1', obs: '1' }] }, R);
  proche(b.v, 300 + 10 + 15 + 10, 'poc');
});

test('CO : balises et retard par tranche de 15 s entamée', () => {
  const r = { ...R, balises: '1 10\n2=20, 3:30' };
  const e = J.evaluerEquipe(J.EPREUVE.co, { l: [{ b: '1 2 3 2', r: '16' }, { b: '1', r: '0:15' }] }, r);
  // binôme 1 : 60 − 2 tranches × 10 = 40 ; binôme 2 : 10 − 10 = 0
  proche(e.v, 40, 'co');
  egal(J.evaluerLigne(J.EPREUVE.co, { b: '9' }, r).etat, 'err', 'balise inconnue');
  proche(J.evaluerLigne(J.EPREUVE.co, { b: '85' }, R).v, 85, 'sans barème : points directs');
});

test('relais : meilleure manche, manche non courue', () => {
  const ep = J.EPREUVE.relais;
  proche(J.evaluerEquipe(ep, { l: [{ t: '58', z: '1' }, { t: '1:00' }] }, R).v, 60, 'meilleure');
  egal(J.evaluerEquipe(ep, { l: [{ t: '58' }] }, R).etat, 'incomplet');
  proche(J.evaluerEquipe(ep, { l: [{ t: '58' }, { s: 'nc' }] }, R).v, 58, 'nc');
  egal(J.evaluerEquipe(ep, { l: [{ s: 'dq' }, { s: 'dq' }] }, R).etat, 'dq');
});

test('général : départage aux médailles, bonus plafonné', () => {
  const e = J.etatVide();
  // 400 : p1 or, p2 argent, p3 bronze ; vortex : p2 or, p1 argent, p4 bronze
  e.resultats.c400 = { p1: t400('1'), p2: t400('2'), p3: t400('3'), p4: t400('4'), pcl: t400('5') };
  for (const id in e.resultats.c400) e.resultats.c400[id].l = [{ t: e.resultats.c400[id].l[0].t }, { t: '0' }, { t: '0' }];
  const v = (x) => ({ l: [{ e1: x, e2: 'x', e3: 'x' }, { e1: '0', e2: '0', e3: '0' }, { e1: '0', e2: '0', e3: '0' }] });
  e.resultats.vortex = { p2: v('50'), p1: v('40'), p4: v('30'), p3: v('20'), pcl: v('10') };
  e.bonus = { p3: { cri: '15' } };   // plafonné à 10
  const g = J.classementGeneral(e);
  egal(g.terminees, 2);
  egal(g.lignes.map(r => r.place), [1, 1, 3, 4, 5]);
  const p1 = g.lignes.find(r => r.eq.id === 'p1'), p2 = g.lignes.find(r => r.eq.id === 'p2'), p3 = g.lignes.find(r => r.eq.id === 'p3');
  egal([p1.total, p2.total, p3.total], [15, 15, 12]);
  egal([p1.place, p2.place, p3.place], [1, 1, 3], 'égalité parfaite (1 or, 1 argent chacun)');
});

function equipeFictive(n = 20) {
  const e = J.etatVide();
  for (const eq of e.equipes) {
    const k = eq.id === J.PCL ? 6 : n;
    for (let i = 1; i <= k; i++) e.personnes.push({ id: eq.id + '-' + i, nom: eq.nom + ' n°' + i, origine: eq.id, equipe: eq.id });
  }
  return e;
}

test('tirage : places désignées gardées, priorité aux sans-épreuve, joker', () => {
  const e = equipeFictive();
  J.fixerPlaces(e, 'c400', 'p1', [{ p: 'p1-1', o: 'd' }, { p: null }, { p: null }]);
  const r = J.tirerPlaces(e, 'c400', 'p1', { hasard: suite(7) });
  egal(r.tires.length, 2);
  const pl = J.places(e, 'c400', 'p1');
  egal(pl[0], { p: 'p1-1', o: 'd' });
  egal(pl.slice(1).every(x => x.o === 't' && x.p !== 'p1-1'), true);
  const j = J.jouerJoker(e, 'c400', 'p1', 1, { hasard: suite(9) });
  egal(J.places(e, 'c400', 'p1')[1].p !== j.retire, true, 'le retiré ne revient pas');
  let refuse = false; try { J.jouerJoker(e, 'c400', 'p1', 2); } catch { refuse = true; }
  egal(refuse, true, 'un seul joker');
});

test('tirage : pas d\'épreuves enchaînées, 2 épreuves max', () => {
  const e = equipeFictive(4);
  // 4 personnes : vortex rempli par 1,2,3 ; le tirage du 400 (qui précède le vortex) ne peut prendre que 4.
  J.fixerPlaces(e, 'vortex', 'p1', [{ p: 'p1-1' }, { p: 'p1-2' }, { p: 'p1-3' }]);
  const r = J.tirerPlaces(e, 'c400', 'p1', { hasard: suite(1) });
  egal(r.tires, ['p1-4']); egal(r.manque, 2);
});

test('vérifications', () => {
  const e = equipeFictive(2);
  J.fixerPlaces(e, 'c400', 'p1', [{ p: 'p1-1' }, { p: 'p1-1' }, { p: null }]);
  J.fixerPlaces(e, 'vortex', 'p1', [{ p: 'p1-1' }, { p: null }, { p: null }]);
  const pb = J.verifier(e).filter(x => x.eq === 'p1');
  const msgs = pb.map(x => x.niveau + ' ' + x.msg).join('\n');
  for (const attendu of ['deux places', 'enchaîne', 'ne suffisent pas'])
    if (!msgs.includes(attendu)) throw new Error('manque « ' + attendu + ' » dans\n' + msgs);
});

test('normaliser : tableaux Firebase sous forme d\'objets', () => {
  const e = J.normaliser({ equipes: { 0: { id: 'a', nom: 'A' } }, reglages: { bareme: { 0: 10, 1: 5, 2: 2 } } });
  egal(e.equipes, [{ id: 'a', nom: 'A' }]); egal(e.reglages.bareme, [10, 5, 2]); egal(e.reglages.pen.coPoints, 10);
});

console.log(ok + ' réussi(s), ' + ko + ' échec(s)');
process.exit(ko ? 1 : 0);
