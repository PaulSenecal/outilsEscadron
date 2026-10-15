// JO du 5ESC — logique pure (aucun DOM) : épreuves, calcul des résultats,
// classements, composition des équipes et tirages au sort.
// Partagé par index.html (organisation), juge.html (téléphones) et affichage.html,
// et testé par tests/calcul.mjs.

export const PENALITES_DEFAUT = {
  poiObstacle: 10,   // PO individuel : obstacle raté ou contourné (s)
  pocSol: 10,        // PO avec charge : sac qui touche le sol (s) — « à définir » dans le règlement
  pocZone: 15,       // PO avec charge : charge posée hors zone (s)
  pocObstacle: 10,   // PO avec charge : obstacle raté (s)
  relaisZone: 5,     // Relais : passage de témoin hors zone (s)
  coTranche: 15,     // CO : durée d'une tranche de retard (s)
  coPoints: 10       // CO : points de balises retirés par tranche entamée
};

export const REGLAGES_DEFAUT = { bareme: [10, 5, 2], pen: PENALITES_DEFAUT, balises: '' };

export const EQUIPES_DEFAUT = [
  { id: 'p1', nom: 'Pon 1' }, { id: 'p2', nom: 'Pon 2' }, { id: 'p3', nom: 'Pon 3' },
  { id: 'p4', nom: 'Pon 4' }, { id: 'pcl', nom: 'PCL' }
];
export const PCL = 'pcl';

const STATUT_INDIV = [['', 'Terminé'], ['ab', 'Abandon'], ['dq', 'Disqualifié']];
const STATUT_MANCHE = [['', 'Courue'], ['dq', 'Disqualifiée'], ['nc', 'Non courue']];

// Chaque épreuve : « lignes » à saisir par équipe (coureurs, lanceurs, binômes, manches),
// et comment les agréger. places = nombre de personnes à désigner dans la composition.
export const EPREUVES = [
  {
    id: 'c400', nom: '400 m', court: '400 m', places: 3, tirage: true,
    ligne: 'Coureur', lignes: 3, sens: 'min', unite: 'temps', agregat: 'somme',
    champs: [{ k: 't', label: 'Temps', type: 'temps' }],
    statuts: STATUT_INDIV,
    regle: 'Cumul des temps des 3 coureurs. 2e faux départ = disqualification.'
  },
  {
    id: 'vortex', nom: 'Lancer de vortex', court: 'Vortex', places: 3, tirage: true,
    ligne: 'Lanceur', lignes: 3, sens: 'max', unite: 'm', agregat: 'somme',
    champs: [
      { k: 'e1', label: 'Essai 1', type: 'essai' },
      { k: 'e2', label: 'Essai 2', type: 'essai' },
      { k: 'e3', label: 'Essai 3', type: 'essai' }
    ],
    statuts: STATUT_INDIV,
    regle: 'Meilleur des 3 essais de chaque lanceur, puis cumul des 3 lanceurs. « x » = essai nul.'
  },
  {
    id: 'poi', nom: 'PO individuel', court: 'PO indiv.', places: 3, tirage: true,
    ligne: 'Athlète', lignes: 3, sens: 'min', unite: 'temps', agregat: 'somme',
    champs: [
      { k: 't', label: 'Temps', type: 'temps' },
      { k: 'obs', label: 'Obst. ratés', type: 'entier', pen: 'poiObstacle' }
    ],
    statuts: STATUT_INDIV,
    regle: 'Cumul des temps des 3 athlètes, pénalités incluses.'
  },
  {
    id: 'poc', nom: 'PO avec charge', court: 'PO charge', places: 4, tirage: false,
    ligne: 'Équipe', lignes: 1, sens: 'min', unite: 'temps', agregat: 'somme',
    champs: [
      { k: 't', label: 'Temps', type: 'temps' },
      { k: 'sol', label: 'Sac au sol', type: 'entier', pen: 'pocSol' },
      { k: 'zone', label: 'Hors zone', type: 'entier', pen: 'pocZone' },
      { k: 'obs', label: 'Obst. ratés', type: 'entier', pen: 'pocObstacle' }
    ],
    statuts: STATUT_INDIV,
    regle: 'Temps de l\'équipe, pénalités incluses.'
  },
  {
    id: 'co', nom: 'CO au score', court: 'CO', places: 4, tirage: false, continu: true,
    ligne: 'Binôme', lignes: 2, sens: 'max', unite: 'pts', agregat: 'somme',
    champs: [
      { k: 'b', label: 'Balises', type: 'balises' },
      { k: 'r', label: 'Retard', type: 'temps', optionnel: true }
    ],
    statuts: STATUT_INDIV,
    regle: 'Cumul des points de balises des 2 binômes, après pénalités de retard.'
  },
  {
    id: 'relais', nom: 'Relais 4×100 m', court: 'Relais', places: 4, tirage: false,
    ligne: 'Manche', lignes: 2, sens: 'min', unite: 'temps', agregat: 'meilleur',
    champs: [
      { k: 't', label: 'Temps', type: 'temps' },
      { k: 'z', label: 'Hors zone', type: 'entier', pen: 'relaisZone' }
    ],
    statuts: STATUT_MANCHE,
    regle: 'Meilleur temps des 2 manches, pénalités incluses. Témoin perdu = manche disqualifiée.'
  }
];
export const EPREUVE = Object.fromEntries(EPREUVES.map(e => [e.id, e]));

// Ordre de passage dans la journée (la CO, en continu, n'y figure pas).
export const ORDRE = ['c400', 'vortex', 'poi', 'poc', 'relais'];

export const DEROULE = [
  { debut: '08:00', fin: '08:45', titre: 'Rassemblement, tirage au sort, mercato PCL, briefing sécurité' },
  { debut: '08:45', fin: '09:15', titre: 'Échauffement collectif' },
  { debut: '09:15', fin: '09:45', titre: '400 m', ep: 'c400', note: 'Début de la CO en continu' },
  { debut: '10:00', fin: '10:45', titre: 'Lancer de vortex', ep: 'vortex' },
  { debut: '10:45', fin: '11:45', titre: 'PO individuel', ep: 'poi' },
  { debut: '12:00', fin: '13:30', titre: 'Repas' },
  { debut: '13:45', fin: '14:30', titre: 'PO avec charge', ep: 'poc' },
  { debut: '15:00', fin: '15:20', titre: 'Relais — manche 1', ep: 'relais', note: 'Fin de la CO' },
  { debut: '15:20', fin: '15:50', titre: 'Cri de guerre et tenue', note: 'Bonus' },
  { debut: '16:00', fin: '16:30', titre: 'Relais — manche 2 (finale)', ep: 'relais' },
  { debut: '16:30', fin: '17:00', titre: 'Proclamation, podium, médailles' }
];

export const BONUS = [
  { k: 'cri', nom: 'Cri de guerre' },
  { k: 'tenue', nom: 'Tenue / déguisement' },
  { k: 'fairplay', nom: 'Fair-play' }
];

// ── état ─────────────────────────────────────────────────────────

export function etatVide() {
  return {
    v: 1,
    equipes: EQUIPES_DEFAUT.map(e => ({ ...e })),
    personnes: [],
    compo: {},
    jokers: {},
    mercato: null,
    resultats: {},
    bonus: {},
    reglages: structuredClone(REGLAGES_DEFAUT),
    journal: [],
    ecran: { mode: 'classement', tirage: null, podium: 0 },
    enLigne: null
  };
}

// Complète un état lu (stockage, sauvegarde, Firebase) avec les valeurs par défaut.
export function normaliser(e) {
  const v = etatVide();
  if (!e || typeof e !== 'object') return v;
  const r = Object.assign(v, e);
  r.reglages = Object.assign(structuredClone(REGLAGES_DEFAUT), e.reglages || {});
  r.reglages.pen = Object.assign({}, PENALITES_DEFAUT, (e.reglages && e.reglages.pen) || {});
  r.reglages.bareme = liste(r.reglages.bareme).map(Number);
  r.equipes = liste(r.equipes).length ? liste(r.equipes) : v.equipes;
  r.personnes = liste(r.personnes);
  r.journal = liste(r.journal);
  r.ecran = Object.assign(v.ecran, e.ecran || {});
  return r;
}

// Firebase renvoie parfois les tableaux sous forme d'objets {0:…, 1:…}.
export function liste(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  return Object.keys(v).sort((a, b) => a - b).map(k => v[k]);
}

// ── saisies ──────────────────────────────────────────────────────

// Temps : « 1:05.3 », « 1'05"3 », « 1m05 », « 1,05,3 » (clavier numérique), « 65.3 » ou « 65,3 » → secondes.
// NaN si illisible.
export function lireTemps(s) {
  const t = String(s == null ? '' : s).trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!t) return NaN;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const p = t.match(/^(\d+)\.(\d{2})\.(\d+)$/);
  if (p) return Number(p[2]) >= 60 ? NaN : Number(p[1]) * 60 + Number(p[2]) + Number('0.' + p[3]);
  const m = t.match(/^(\d+)(?::|'|m|min)(\d{1,2})(?:(?:\.|"|''|s)(\d*))?$/);
  if (!m) return NaN;
  const sec = Number(m[2]);
  if (sec >= 60) return NaN;
  return Number(m[1]) * 60 + sec + (m[3] ? Number('0.' + m[3]) : 0);
}

export function formatTemps(v) {
  if (!isFinite(v)) return '—';
  const c = Math.round(v * 100);
  const m = Math.floor(c / 6000), s = Math.floor(c / 100) % 60, f = c % 100;
  const frac = f ? '.' + String(f).padStart(2, '0').replace(/0$/, '') : '';
  return m ? m + ':' + String(s).padStart(2, '0') + frac : s + frac + ' s';
}

export function formatValeur(ep, v) {
  if (!isFinite(v)) return '—';
  if (ep.unite === 'temps') return formatTemps(v);
  const n = Math.round(v * 100) / 100;
  return String(n).replace('.', ',') + (ep.unite === 'm' ? ' m' : ' pts');
}

const lireNombre = s => {
  const t = String(s == null ? '' : s).trim().replace(',', '.');
  return t === '' ? NaN : (/^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN);
};
const lireEntier = s => {
  const t = String(s == null ? '' : s).trim();
  return t === '' ? 0 : (/^\d+$/.test(t) ? Number(t) : NaN);
};
const vide = s => String(s == null ? '' : s).trim() === '';

// Barème des balises de la CO : « 31 10 », « 31=10 » ou « 31:10 », séparés par lignes, virgules ou « ; ».
export function lireBalises(texte) {
  const m = new Map();
  String(texte || '').split(/[\n,;]+/).forEach(x => {
    const p = x.trim().match(/^([A-Za-z0-9]+)\s*[=: ]\s*(-?\d+(?:[.,]\d+)?)$/);
    if (p) m.set(p[1].toUpperCase(), Number(p[2].replace(',', '.')));
  });
  return m;
}

// Points d'une saisie de balises : liste de codes si un barème existe, sinon nombre de points.
export function pointsBalises(saisie, bareme) {
  if (vide(saisie)) return { v: NaN };
  if (!bareme || !bareme.size) {
    const n = lireNombre(saisie);
    return isNaN(n) ? { v: NaN, err: 'nombre de points attendu' } : { v: n };
  }
  const codes = [...new Set(String(saisie).toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  const inconnues = codes.filter(c => !bareme.has(c));
  if (inconnues.length) return { v: NaN, err: 'balise inconnue : ' + inconnues.join(', ') };
  return { v: codes.reduce((s, c) => s + bareme.get(c), 0), n: codes.length };
}

// Une ligne (coureur, lanceur, binôme, manche) → { etat: 'vide'|'incomplet'|'ok'|'ab'|'dq'|'nc'|'err', v, detail }.
export function evaluerLigne(ep, l, reglages) {
  l = l || {};
  const pen = (reglages && reglages.pen) || PENALITES_DEFAUT;
  if (l.s === 'ab' || l.s === 'dq' || l.s === 'nc') return { etat: l.s, v: NaN };
  const remplis = ep.champs.filter(c => !vide(l[c.k]));
  if (!remplis.length) return { etat: 'vide', v: NaN };

  if (ep.id === 'vortex') {
    const essais = ep.champs.map(c => l[c.k]);
    const valeurs = essais.filter(x => !vide(x)).map(x => /^(x|nul|n)$/i.test(String(x).trim()) ? 0 : lireNombre(x));
    if (valeurs.some(isNaN)) return { etat: 'err', v: NaN, detail: 'essai illisible (nombre ou « x »)' };
    const v = Math.max(...valeurs);
    return { etat: valeurs.length === essais.length ? 'ok' : 'incomplet', v, detail: 'meilleur jet ' + formatValeur(ep, v) };
  }

  if (ep.id === 'co') {
    const b = pointsBalises(l.b, lireBalises(reglages && reglages.balises));
    if (b.err) return { etat: 'err', v: NaN, detail: b.err };
    if (isNaN(b.v)) return { etat: 'incomplet', v: NaN };
    const retard = vide(l.r) ? 0 : lireTemps(l.r);
    if (isNaN(retard)) return { etat: 'err', v: NaN, detail: 'retard illisible' };
    const tranches = Math.ceil(retard / pen.coTranche - 1e-9);
    const v = b.v - tranches * pen.coPoints;
    return { etat: 'ok', v, detail: tranches ? b.v + ' − ' + tranches * pen.coPoints + ' (retard)' : '' };
  }

  // Épreuves chronométrées : temps + pénalités en secondes.
  const t = lireTemps(l.t);
  if (vide(l.t)) return { etat: 'incomplet', v: NaN };
  if (isNaN(t)) return { etat: 'err', v: NaN, detail: 'temps illisible' };
  let p = 0;
  for (const c of ep.champs) {
    if (!c.pen) continue;
    const n = lireEntier(l[c.k]);
    if (isNaN(n)) return { etat: 'err', v: NaN, detail: c.label.toLowerCase() + ' : nombre entier attendu' };
    p += n * pen[c.pen];
  }
  return { etat: 'ok', v: t + p, detail: p ? formatTemps(t) + ' + ' + p + ' s' : '' };
}

// Résultat d'une équipe sur une épreuve → { etat: 'vide'|'incomplet'|'err'|'ok'|'ab'|'dq', v, lignes, faits }.
export function evaluerEquipe(ep, res, reglages) {
  const saisies = liste(res && res.l);
  const lignes = Array.from({ length: ep.lignes }, (_, i) => evaluerLigne(ep, saisies[i], reglages));
  const faits = lignes.filter(x => x.etat !== 'vide' && x.etat !== 'incomplet' && x.etat !== 'err').length;
  const base = { lignes, faits };
  if (lignes.every(x => x.etat === 'vide')) return { ...base, etat: 'vide', v: NaN };

  if (ep.agregat === 'meilleur') {
    const ok = lignes.filter(x => x.etat === 'ok').map(x => x.v);
    const v = ok.length ? Math.min(...ok) : NaN;
    if (lignes.some(x => x.etat === 'err')) return { ...base, etat: 'err', v };
    if (faits < lignes.length) return { ...base, etat: 'incomplet', v };
    return ok.length ? { ...base, etat: 'ok', v } : { ...base, etat: 'dq', v: NaN };
  }

  if (lignes.some(x => x.etat === 'dq')) return { ...base, etat: 'dq', v: NaN };
  if (lignes.some(x => x.etat === 'err')) return { ...base, etat: 'err', v: NaN };
  if (lignes.some(x => x.etat === 'ab')) {
    return { ...base, etat: faits < lignes.length ? 'incomplet' : 'ab', v: NaN };
  }
  if (faits < lignes.length) return { ...base, etat: 'incomplet', v: NaN };
  return { ...base, etat: 'ok', v: lignes.reduce((s, x) => s + x.v, 0) };
}

const arrondi = (ep, v) => Math.round(v * 100); // égalité au centième (temps, mètres ou points)

// Classement d'une épreuve. Une épreuve est « terminée » quand chaque équipe a un résultat
// définitif ; avant, le classement est provisoire et ne rapporte pas encore de points au général.
// Ex aequo : même place, mêmes points, place suivante sautée.
// Abandon : classée après les équipes qui ont terminé. Disqualifiée : non classée, 0 point.
export function classerEpreuve(ep, resultats, equipes, reglages) {
  const bareme = liste((reglages && reglages.bareme) || REGLAGES_DEFAUT.bareme);
  const lignes = equipes.map(eq => ({ eq, ...evaluerEquipe(ep, resultats && resultats[eq.id], reglages) }));
  const terminee = lignes.every(x => x.etat === 'ok' || x.etat === 'ab' || x.etat === 'dq');
  const commencee = lignes.some(x => x.etat !== 'vide');

  const finis = lignes.filter(x => x.etat === 'ok')
    .sort((a, b) => ep.sens === 'min' ? a.v - b.v : b.v - a.v);
  let place = 0;
  finis.forEach((x, i) => {
    if (i === 0 || arrondi(ep, x.v) !== arrondi(ep, finis[i - 1].v)) place = i + 1;
    x.place = place;
  });
  const abandons = lignes.filter(x => x.etat === 'ab');
  abandons.forEach(x => { x.place = finis.length + 1; });

  for (const x of lignes) {
    x.points = x.place ? (bareme[x.place - 1] || 0) : 0;
    x.medaille = x.place && x.place <= 3 ? ['or', 'argent', 'bronze'][x.place - 1] : null;
  }
  const ordre = [...finis, ...abandons, ...lignes.filter(x => !x.place)];
  return { ep, terminee, commencee, lignes: ordre };
}

export function sommeBonus(b) {
  return BONUS.reduce((s, x) => {
    const n = lireNombre(b && b[x.k]);
    return s + (isNaN(n) ? 0 : Math.max(0, Math.min(10, n)));
  }, 0);
}

// Classement général : seules les épreuves terminées comptent.
// Égalité au total : nombre d'or, puis d'argent, puis de bronze.
export function classementGeneral(etat) {
  const equipes = etat.equipes;
  const epreuves = EPREUVES.map(ep => classerEpreuve(ep, etat.resultats[ep.id], equipes, etat.reglages));
  const lignes = equipes.map(eq => {
    const r = { eq, parEpreuve: {}, or: 0, argent: 0, bronze: 0, points: 0 };
    for (const c of epreuves) {
      const x = c.lignes.find(l => l.eq.id === eq.id);
      r.parEpreuve[c.ep.id] = x;
      if (!c.terminee) continue;
      r.points += x.points;
      if (x.medaille) r[x.medaille]++;
    }
    r.bonus = sommeBonus(etat.bonus && etat.bonus[eq.id]);
    r.total = r.points + r.bonus;
    return r;
  });
  const cle = r => [r.total, r.or, r.argent, r.bronze];
  const cmp = (a, b) => { const x = cle(a), y = cle(b); for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  lignes.sort(cmp);
  lignes.forEach((r, i) => { r.place = i && cmp(r, lignes[i - 1]) === 0 ? lignes[i - 1].place : i + 1; });
  return { epreuves, lignes, terminees: epreuves.filter(c => c.terminee).length };
}

// ── composition des équipes ─────────────────────────────────────

export const membres = (etat, eqId) => etat.personnes.filter(p => p.equipe === eqId);

export function places(etat, epId, eqId) {
  const ep = EPREUVE[epId];
  const p = liste(etat.compo[epId] && etat.compo[epId][eqId]);
  return Array.from({ length: ep.places }, (_, i) => p[i] && p[i].p ? { p: p[i].p, o: p[i].o || 'd' } : { p: null, o: null });
}

export function fixerPlaces(etat, epId, eqId, pl) {
  etat.compo[epId] = etat.compo[epId] || {};
  etat.compo[epId][eqId] = pl.map(x => x.p ? { p: x.p, o: x.o || 'd' } : { p: null, o: null });
}

// Épreuves d'une personne, dans l'ordre de la journée.
export function epreuvesDe(etat, pid) {
  return EPREUVES.filter(ep => etat.equipes.some(eq => places(etat, ep.id, eq.id).some(x => x.p === pid)))
    .map(ep => ep.id);
}

// Deux épreuves qui se suivent dans le déroulé (la CO est en continu, hors ordre).
export function seSuivent(a, b) {
  const i = ORDRE.indexOf(a), j = ORDRE.indexOf(b);
  return i >= 0 && j >= 0 && Math.abs(i - j) === 1;
}

export function verifier(etat) {
  const pb = [];
  const nom = id => (etat.personnes.find(p => p.id === id) || {}).nom || '?';
  for (const eq of etat.equipes) {
    const gens = membres(etat, eq.id);
    let vides = 0, total = 0;
    for (const ep of EPREUVES) {
      const pl = places(etat, ep.id, eq.id);
      total += pl.length;
      vides += pl.filter(x => !x.p).length;
      const vus = new Set();
      for (const x of pl) {
        if (!x.p) continue;
        if (vus.has(x.p)) pb.push({ niveau: 'erreur', eq: eq.id, msg: nom(x.p) + ' occupe deux places au ' + ep.court + '.' });
        vus.add(x.p);
        const pers = etat.personnes.find(p => p.id === x.p);
        if (!pers) pb.push({ niveau: 'erreur', eq: eq.id, msg: 'Place du ' + ep.court + ' attribuée à une personne supprimée.' });
        else if (pers.equipe !== eq.id) pb.push({ niveau: 'erreur', eq: eq.id, msg: pers.nom + ' est placé(e) au ' + ep.court + ' mais n\'est plus dans l\'équipe.' });
      }
    }
    for (const p of gens) {
      const eps = epreuvesDe(etat, p.id);
      if (eps.length > 2) pb.push({ niveau: 'erreur', eq: eq.id, msg: p.nom + ' fait ' + eps.length + ' épreuves (2 au maximum).' });
      if (!eps.length && vides === 0) pb.push({ niveau: 'erreur', eq: eq.id, msg: p.nom + ' ne fait aucune épreuve.' });
      for (let i = 0; i < eps.length; i++)
        for (let j = i + 1; j < eps.length; j++)
          if (seSuivent(eps[i], eps[j]))
            pb.push({ niveau: 'alerte', eq: eq.id, msg: p.nom + ' enchaîne ' + EPREUVE[eps[i]].court + ' et ' + EPREUVE[eps[j]].court + ' sans épreuve d\'écart.' });
    }
    const sansEpreuve = gens.filter(p => !epreuvesDe(etat, p.id).length).length;
    if (vides && sansEpreuve > vides)
      pb.push({ niveau: 'erreur', eq: eq.id, msg: sansEpreuve + ' personnes sans épreuve pour ' + vides + ' places libres : tout le monde ne pourra pas courir.' });
    if (gens.length && gens.length * 2 < total)
      pb.push({ niveau: 'erreur', eq: eq.id, msg: gens.length + ' personnes ne suffisent pas pour ' + total + ' places (2 épreuves chacun au maximum).' });
    if (vides) pb.push({ niveau: 'info', eq: eq.id, msg: vides + ' place' + (vides > 1 ? 's' : '') + ' à pourvoir sur ' + total + '.' });
  }
  return pb;
}

// ── hasard ───────────────────────────────────────────────────────

// Entier uniforme dans [0, n[ (crypto, sans biais de modulo).
export function alea(n) {
  const max = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= max);
  return b[0] % n;
}

export function melanger(t, hasard = alea) {
  const a = t.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = hasard(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Candidats pour une place, du plus prioritaire au moins prioritaire :
// d'abord ceux qui n'ont aucune épreuve, puis ceux qui n'en ont qu'une sans l'enchaîner.
// Tirés au hasard à l'intérieur de chaque groupe.
function candidats(etat, epId, eqId, exclus, prioriteSansEpreuve, hasard) {
  const groupes = [[], []];
  for (const p of membres(etat, eqId)) {
    if (exclus.has(p.id)) continue;
    const eps = epreuvesDe(etat, p.id);
    if (eps.includes(epId) || eps.length >= 2) continue;
    if (eps.some(e => seSuivent(e, epId))) continue;
    groupes[prioriteSansEpreuve && eps.length ? 1 : 0].push(p.id);
  }
  return [...melanger(groupes[0], hasard), ...melanger(groupes[1], hasard)];
}

// Remplit au hasard les places vides d'une équipe ; les places désignées par le chef restent.
export function tirerPlaces(etat, epId, eqId, { prioriteSansEpreuve = true, hasard = alea } = {}) {
  const pl = places(etat, epId, eqId);
  const libres = pl.map((x, i) => x.p ? -1 : i).filter(i => i >= 0);
  const pool = candidats(etat, epId, eqId, new Set(), prioriteSansEpreuve, hasard);
  const tires = [];
  for (const i of libres) {
    const p = pool.shift();
    if (!p) break;
    pl[i] = { p, o: 't' };
    tires.push(p);
  }
  fixerPlaces(etat, epId, eqId, pl);
  return { tires, manque: libres.length - tires.length };
}

// Joker du chef : une seule fois par équipe, sur un nom tiré au sort ;
// la personne retirée ne peut pas être retirée au sort sur cette épreuve.
export function jouerJoker(etat, epId, eqId, index, { prioriteSansEpreuve = true, hasard = alea } = {}) {
  if (etat.jokers[eqId]) throw new Error('Le joker de cette équipe a déjà été utilisé.');
  const pl = places(etat, epId, eqId);
  const ancien = pl[index];
  if (!ancien || !ancien.p || ancien.o !== 't') throw new Error('Le joker ne s\'applique qu\'à un nom tiré au sort.');
  pl[index] = { p: null, o: null };
  fixerPlaces(etat, epId, eqId, pl);
  const pool = candidats(etat, epId, eqId, new Set([ancien.p]), prioriteSansEpreuve, hasard);
  const nouveau = pool[0] || null;
  if (nouveau) pl[index] = { p: nouveau, o: 't' };
  fixerPlaces(etat, epId, eqId, pl);
  etat.jokers[eqId] = { ep: epId, retire: ancien.p, remplace: nouveau };
  return { retire: ancien.p, remplace: nouveau };
}

// Mercato PCL : n renforts tirés au sort dans les pelotons, à parts aussi égales que possible
// (si n n'est pas un multiple du nombre de pelotons, les pelotons qui cèdent une personne de plus sont tirés au sort).
export function mercato(etat, n, hasard = alea) {
  if (etat.mercato) throw new Error('Le mercato a déjà eu lieu. L\'annuler avant de le relancer.');
  const pelotons = etat.equipes.filter(e => e.id !== PCL);
  const parts = Object.fromEntries(pelotons.map(e => [e.id, Math.floor(n / pelotons.length)]));
  melanger(pelotons.map(e => e.id), hasard).slice(0, n % pelotons.length).forEach(id => parts[id]++);
  const liste_ = [];
  for (const eq of pelotons) {
    const pool = melanger(membres(etat, eq.id).map(p => p.id), hasard);
    if (pool.length < parts[eq.id]) throw new Error(eq.nom + ' n\'a que ' + pool.length + ' personne(s).');
    for (const pid of pool.slice(0, parts[eq.id])) {
      const p = etat.personnes.find(x => x.id === pid);
      p.equipe = PCL;
      liste_.push({ id: pid, de: eq.id });
      retirerDesPlaces(etat, pid, eq.id);
    }
  }
  etat.mercato = { liste: liste_ };
  return liste_;
}

export function annulerMercato(etat) {
  if (!etat.mercato) return;
  for (const m of liste(etat.mercato.liste)) {
    const p = etat.personnes.find(x => x.id === m.id);
    if (!p) continue;
    retirerDesPlaces(etat, p.id, PCL);
    p.equipe = m.de;
  }
  etat.mercato = null;
}

export function retirerDesPlaces(etat, pid, eqId) {
  for (const ep of EPREUVES) {
    const pl = places(etat, ep.id, eqId);
    if (pl.some(x => x.p === pid)) fixerPlaces(etat, ep.id, eqId, pl.map(x => x.p === pid ? { p: null, o: null } : x));
  }
}

// Prochaine étape du déroulé à partir de « HH:MM ».
export function etapeCourante(hhmm) {
  const i = DEROULE.findIndex(d => hhmm < d.fin);
  return { en: i >= 0 && hhmm >= DEROULE[i].debut ? DEROULE[i] : null, suivante: DEROULE.find(d => d.debut > hhmm) || null };
}
