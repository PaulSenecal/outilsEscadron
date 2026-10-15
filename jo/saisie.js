// Formulaire de saisie d'une épreuve (une carte par équipe), partagé par
// index.html (table centrale) et juge.html (téléphones des juges).
// Les champs ne sont jamais recréés pendant la saisie : maj() met à jour les valeurs
// venues d'ailleurs (autre juge, autre onglet) sans toucher au champ en cours d'édition.
import { evaluerLigne, classerEpreuve, formatValeur, liste, lireBalises } from './calcul.js';

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ETATS = {
  vide: ['À saisir', 'b-attente'], incomplet: ['En cours', 'b-attente'], err: ['À corriger', 'b-err'],
  ok: ['', 'b-ok'], ab: ['Abandon', 'b-alerte'], dq: ['Disqualifiée', 'b-err']
};

function attributs(champ, balisesActives) {
  switch (champ.type) {
    case 'temps': return 'inputmode="decimal" placeholder="' + (champ.optionnel ? '0' : '1:05.3') + '"';
    case 'entier': return 'inputmode="numeric" placeholder="0"';
    case 'essai': return 'inputmode="decimal" placeholder="m ou x"';
    case 'balises': return balisesActives ? 'placeholder="n° : 31 34 42"' : 'inputmode="decimal" placeholder="points"';
    default: return '';
  }
}

/**
 * @param {HTMLElement} racine
 * @param {object} o
 *   ep, equipes, reglages,
 *   lire(eqId) → résultat {l:[…]} actuel,
 *   ecrire(eqId, res) → appelé à chaque modification,
 *   nomLigne(eqId, i) → nom de l'athlète (facultatif),
 *   majInfo(eqId) → texte « modifié par … » (facultatif)
 */
export function formulaireEpreuve(racine, o) {
  const { ep } = o;
  const balisesActives = () => lireBalises(o.reglages.balises).size > 0;

  racine.innerHTML = '<div class="saisie">' + o.equipes.map(eq => `
    <article class="eq" data-eq="${esc(eq.id)}">
      <header><h3>${esc(eq.nom)}</h3><div class="res"></div></header>
      ${Array.from({ length: ep.lignes }, (_, i) => `
        <div class="lig" data-i="${i}">
          <div class="qui">${esc(ep.ligne)} ${ep.lignes > 1 ? i + 1 : ''} <small data-nom></small></div>
          <div class="det"></div>
          <div class="champs">
            ${ep.champs.map(c => `<label class="${c.type === 'balises' ? 'large' : ''}">${esc(c.label)}${c.optionnel ? ' (s)' : ''}
              <input type="text" autocomplete="off" data-k="${c.k}" ${attributs(c, balisesActives())}></label>`).join('')}
            <label class="statut">Statut<select data-k="s">${ep.statuts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
          </div>
        </div>`).join('')}
      <div class="maj" hidden></div>
    </article>`).join('') + '</div>';

  const lireCarte = carte => ({
    l: [...carte.querySelectorAll('.lig')].map(lig => {
      const r = {};
      lig.querySelectorAll('[data-k]').forEach(el => { r[el.dataset.k] = el.value.trim(); });
      return r;
    })
  });

  // Propriété (et non addEventListener) : un nouveau formulaire dans la même racine remplace l'ancien.
  racine.oninput = e => {
    const carte = e.target.closest('.eq');
    if (!carte || !e.target.dataset.k) return;
    const res = lireCarte(carte);
    o.ecrire(carte.dataset.eq, res);
    resume();
  };

  function resume() {
    const resultats = Object.fromEntries(o.equipes.map(eq => [eq.id, o.lire(eq.id)]));
    const c = classerEpreuve(ep, resultats, o.equipes, o.reglages);
    for (const x of c.lignes) {
      const carte = racine.querySelector(`.eq[data-eq="${CSS.escape(x.eq.id)}"]`);
      if (!carte) continue;
      carte.className = 'eq' + (x.place && x.place <= 3 && x.etat === 'ok' ? ' place-' + x.place : '');
      const [txt, cls] = ETATS[x.etat];
      const valeur = x.etat === 'ok' ? `<b>${formatValeur(ep, x.v)}</b><small>${x.place}${x.place === 1 ? 're' : 'e'} place${c.terminee ? ' · ' + x.points + ' pts' : ' (provisoire)'}</small>`
        : x.etat === 'ab' && x.place ? `<span class="badge ${cls}">${txt}</span><small>${x.place}e place</small>`
        : `<span class="badge ${cls}">${txt}${x.etat === 'incomplet' ? ' ' + x.faits + '/' + ep.lignes : ''}</span>`;
      carte.querySelector('header .res').innerHTML = valeur;
      const saisies = liste(o.lire(x.eq.id) && o.lire(x.eq.id).l);
      carte.querySelectorAll('.lig').forEach((lig, i) => {
        const r = evaluerLigne(ep, saisies[i], o.reglages);
        const det = lig.querySelector('.det');
        det.className = 'det' + (r.etat === 'err' ? ' err' : '');
        det.textContent = r.etat === 'err' ? r.detail : r.etat === 'ok' ? (r.detail || formatValeur(ep, r.v)) : '';
        lig.classList.toggle('off', ['ab', 'dq', 'nc'].includes(r.etat));
        if (o.nomLigne) lig.querySelector('[data-nom]').textContent = o.nomLigne(x.eq.id, i) || '';
      });
      const info = o.majInfo && o.majInfo(x.eq.id);
      const m = carte.querySelector('.maj');
      m.hidden = !info; m.textContent = info || '';
    }
  }

  function maj(reglages) {
    if (reglages) o.reglages = reglages;
    for (const eq of o.equipes) {
      const carte = racine.querySelector(`.eq[data-eq="${CSS.escape(eq.id)}"]`);
      const saisies = liste(o.lire(eq.id) && o.lire(eq.id).l);
      carte.querySelectorAll('.lig').forEach((lig, i) => {
        const r = saisies[i] || {};
        lig.querySelectorAll('[data-k]').forEach(el => {
          if (el === document.activeElement) return;
          const v = r[el.dataset.k] == null ? '' : String(r[el.dataset.k]);
          if (el.value !== v) el.value = v;
        });
      });
    }
    resume();
  }

  maj();
  return { maj };
}
