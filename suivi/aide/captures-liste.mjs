// Liste des captures des guides : avant = code exécuté dans la page (démo), encadres = [sélecteur, numéro, options],
// zone = sélecteur à cadrer (sinon tout l'écran 1440 × 900), apres = code exécuté après la capture.
// Uniquement les données fictives de la démo : ces images sont publiques.
const attendre = `var quand = async (f, max = 30000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < max) await new Promise(r => setTimeout(r, 50)); };`;
// Démo ouverte (administrateur), sans fenêtre ni menu ouvert
const demo = `${attendre}
  window.confirm = () => true; window.alert = () => {}; window.prompt = () => "";
  if (!state.data) { $("#btn-demo").click(); await quand(() => state.data); state.data.meta.verrouMinutes = 0; state.data.meta.versionVue = VERSION; majNouveautes(); }
  document.querySelectorAll("dialog[open]").forEach(d => d.close()); fermerMenus(); $("#toast").hidden = true; scrollTo(0, 0);`;
// Remet la démo d'origine (après une capture qui la modifie ou change de rôle)
const neuf = `window.confirm = () => true; state.dirty = false; lock();`;
// Fiche d'exemple : dates choisies pour montrer chaque couleur (fin de contrat proche, VMP à jour, Famas expiré, HK à jour)
const exemple = `(() => {
  const p = state.data.personnes.find(x => x.v.nom === "ROUX" && x.v.prenom === "Pauline") || state.data.personnes[0];
  const j = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  Object.assign(p.v, { grade: "MDL", fincontrat: j(45), vmp: j(200), famas_tir: j(-420), famas_b: j(-420), famas_c: j(-420), hk_tir: j(-60), hk_b: j(-60), hk_c: j(-340) });
  return p; })()`;
// Rôles en lecture seule, simulés sur la démo (même affichage que l'ouverture avec leur mot de passe)
const lecteur = `${demo} state.role = { id: "aide", capitaine: true, nom: "CNE Exemple" }; state.auteur = "CNE Exemple"; appliquerRole();`;
const chef = `${demo} if (!state.role) { state.data.personnes = state.data.personnes.filter(p => p.v.escadron === "5ESC" && p.v.peloton === "P2");
  state.role = { id: "aide", escadron: "5ESC", peloton: "P2", nom: "LTN Exemple" }; state.auteur = "LTN Exemple"; appliquerRole(); }`;
const menu = sel => `document.querySelector(${JSON.stringify(sel)}).click();`;
const noms = n => `state.data.personnes.filter(p => p.v.escadron === "5ESC" && p.v.peloton === "P2").slice(0, ${n}).map(p => p.v.grade + " " + p.v.nom + " " + p.v.prenom).join("\\n")`;

export const CAPTURES = [
  /* ---------- Commun ---------- */
  { nom: "ouverture", avant: `${neuf} afficherVerrou("open"); $("#picked").hidden = false; $("#picked").textContent = "suivi-5esc.json – modifié le 02/11/2026 à 13:12";`,
    encadres: [["#btn-pick", 1], ["#pw-open", 2], ["#form-open .btn-gold", 3]], zone: ".lock-panel" },
  { nom: "ecran-principal", avant: `${demo} setView("accueil");`,
    encadres: [[".sb-nav", 1, { marge: 2, cote: "dedans" }], ["#accueil .kpis", 2, { cote: "dessus" }], [".topbar-actions", 3], [".sb-bas .dd", 4, { cote: "droite" }], ["#btn-nouveautes", 5, { marge: 0 }]] },
  { nom: "enregistrer", avant: `${demo} setView("perso"); markDirty();`, apres: neuf,
    encadres: [["#dirty", 1, { cote: "dessous" }], ["#btn-undo", 2, { cote: "dessous" }], ["#btn-save", 3, { cote: "dessous" }], ["#btn-lock", 4, { cote: "dessous" }]], zone: ".topbar" },
  { nom: "personnel", avant: `${demo} setView("perso");`,
    encadres: [["#f-q", 1, { cote: "dessus" }], ["#f-escadron", 2, { cote: "dessus" }], ["#f-champ", 3, { cote: "dessus" }], ["#chips", 4, { cote: "dessous" }], ["#tbl tbody tr:first-child td:first-child", 5]] },
  { nom: "fiche-essentiel", avant: `${demo} setView("perso"); ficheOnglet = "essentiel"; openPerson(${exemple}.id); $("#p-body").scrollTop = 0;`,
    encadres: [["#p-bandeau", 1], ["#p-onglets", 2], ["#p-valider", 3]] },
  { nom: "fiche-dates-fin", avant: `${demo} setView("perso"); ficheOnglet = "essentiel"; openPerson(${exemple}.id);
      document.querySelector('[data-f="vmp"]').scrollIntoView({ block: "center" });`,
    encadres: [['label.fld:has([data-f="fincontrat"])', 1], ['label.fld:has([data-f="vmp"])', 2]] },
  { nom: "fiche-tirs", avant: `${demo} setView("perso"); ficheOnglet = "tirs"; openPerson(${exemple}.id); $("#p-body").scrollTop = 0;`,
    encadres: [['label.fld:has([data-f="famas_b"])', 1], ['label.fld:has([data-f="hk_b"])', 2], ['label.fld:has([data-f="famas_d"])', 3, { cote: "droite" }]], apres: `ficheOnglet = "essentiel";` },
  { nom: "a-faire", avant: `${demo} setView("todo");`,
    encadres: [["#td-esc", 1, { cote: "dessus" }], ["#td-jours", 2, { cote: "dessus" }], ["#td-type", 3, { cote: "dessus" }], ["#td-mail", 4], ["#todo table", 5, { marge: 2 }]] },
  { nom: "cati", avant: `${demo} setView("cati");`, encadres: [["#view-synth .toolbar", 1], ["#synth table tbody", 2, { marge: 1 }]] },
  { nom: "statistiques", avant: `${demo} setView("stats");`, encadres: [["#st-esc", 1, { cote: "dessus" }], ["#stats .kpis", 2], ["#stats .st-card", 3, { cote: "dessus" }]] },
  { nom: "telephones", avant: `${demo} setView("perso"); ouvrirTels(); $("#tels-cat").value = "sof"; telsRender();`,
    encadres: [["#tels-cat", 1], ["#tels-contactables", 2, { marge: 6 }], ["#tels-copier-noms", 3, { cote: "dessus" }], ["#tels-copier", 4, { cote: "dessus" }]] },
  { nom: "menu-actions", avant: `${demo} setView("perso"); ${menu("#view-perso .dd-btn")}`, encadres: [["#btn-lot", 1], ["#btn-tels", 2]] },
  { nom: "menu-exporter", avant: `${demo} setView("perso"); ${menu("#view-perso .dd:last-of-type .dd-btn")}`, encadres: [["#btn-export", 1]] },
  { nom: "verrouillage", avant: `${demo} await verrouillerSession();`, encadres: [["#pw-session", 1], ["#form-session .btn-gold", 2]], zone: ".lock-panel",
    apres: `$("#pw-session").value = "demonstration"; $("#form-session").requestSubmit(); ${attendre} await quand(() => state.data);` },

  /* ---------- Secrétariat (administrateurs) ---------- */
  { nom: "ajouter", avant: `${demo} setView("perso"); openPerson(null); $("#p-body").scrollTop = 0;`,
    encadres: [['label.fld:has([data-f="nom"])', 1], ['label.fld:has([data-f="grade"])', 2], ['label.fld:has([data-f="escadron"])', 3], ['label.fld:has([data-f="peloton"])', 4], ["#p-valider", 5]] },
  { nom: "seance", avant: `${demo} setView("perso"); $("#btn-seance").click(); $("#se-date").value = new Date().toISOString().slice(0, 10);
      const g = document.querySelector('#se-champs [data-grp="Famas"]'); if (!g.checked) g.click();
      $("#se-texte").value = ${noms(5)} + "\\nSGT INCONNU Paul"; $("#se-go").click(); ${attendre} await quand(() => $("#se-match").children.length);
      $("#dlg-seance .dlg-body").scrollTop = 0;`,
    encadres: [["#se-date", 1], ['#se-champs fieldset:has([data-grp="Famas"])', 2, { cote: "droite" }]] },
  { nom: "seance-presents", avant: `${demo} setView("perso"); $("#btn-seance").click(); $("#se-date").value = new Date().toISOString().slice(0, 10);
      const g = document.querySelector('#se-champs [data-grp="Famas"]'); if (!g.checked) g.click();
      $("#se-texte").value = ${noms(5)} + "\\nSGT INCONNU Paul"; $("#se-go").click(); ${attendre} await quand(() => $("#se-match").children.length);
      $("#se-texte").scrollIntoView({ block: "start" });`,
    encadres: [["#se-texte", 1], ["#se-go", 2], ["#se-match", 3], ["#se-ok", 4, { cote: "dessus" }]], apres: neuf },
  { nom: "liste-1", avant: `${demo} setView("liste"); $("#ls-nom").value = "Week-end du 21 novembre"; $("#ls-texte").value = ${noms(8)};`,
    encadres: [["#ls-nom", 1], ["#ls-texte", 2], ["#ls-go", 3], ["#ls-file-btn", 4, { cote: "droite" }]] },
  { nom: "liste-2", avant: `${demo} setView("liste"); $("#ls-nom").value = "Week-end du 21 novembre"; $("#ls-texte").value = ${noms(8)} + "\\nMDL DUPONTEL Marc";
      $("#ls-go").click(); ${attendre} await quand(() => !$("#ls-match-card").hidden); $("#ls-match-card").scrollIntoView();`,
    encadres: [["#ls-match-sum", 1], ["#ls-match", 2]] },
  { nom: "liste-3", avant: `${demo} setView("liste"); $("#ls-nom").value = "Week-end du 21 novembre"; $("#ls-texte").value = ${noms(8)};
      $("#ls-go").click(); ${attendre} await quand(() => !$("#ls-champs-card").hidden);
      ["Contact", "Famas"].forEach(g => { const c = document.querySelector('#ls-champs [data-grp="' + g + '"]'); if (c && !c.checked) c.click(); });
      $("#ls-champs-card").scrollIntoView();`,
    encadres: [["#ls-champs fieldset:has([data-grp=\"Contact\"])", 1], ["#ls-champs fieldset:has([data-grp=\"Famas\"])", 2]] },
  { nom: "liste-4", avant: `${demo} setView("liste"); $("#ls-nom").value = "Week-end du 21 novembre"; $("#ls-texte").value = ${noms(8)};
      $("#ls-go").click(); ${attendre} await quand(() => !$("#ls-champs-card").hidden);
      ["Contact", "Famas"].forEach(g => { const c = document.querySelector('#ls-champs [data-grp="' + g + '"]'); if (c && !c.checked) c.click(); });
      await quand(() => !$("#ls-result-card").hidden); $("#ls-result-card").scrollIntoView(); $("#ls-result-card .dd-btn").click();`,
    encadres: [["#ls-save", 1], ["#ls-mail", 2, { cote: "droite" }], ["#ls-export", 3], ["#ls-result", 4]] },
  { nom: "lot", avant: `${demo} setView("perso"); ouvrirLot("SDT MARTINET Lucas (NID : 99 000 00 101)\\n1CL GARNIER Inès (NID : 99 000 00 102)\\nCPL DUVAL Hugo (NID : 99 000 00 103)");
      $("#lot-escadron").value = "5ESC"; $("#lot-peloton").value = "P2";`,
    encadres: [["#lot-texte", 1], ["#lot-escadron", 2], ["#lot-apercu", 3], ["#lot-ok", 4, { cote: "dessus" }]] },
  { nom: "menu-fichier", avant: `${demo} setView("accueil"); ${menu(".sb-bas .dd-btn")}`,
    encadres: [['.sb-bas [data-clic="#btn-import"], #btn-import', 1, { cote: "droite" }], ["#btn-journal", 2, { cote: "droite" }], ["#btn-champs", 3, { cote: "droite" }]] },
  { nom: "comptes", avant: `${demo} const M = state.data.meta; if (!M.comptes) {
      M.comptesKdf = KDF(1000, toB64(aleatoire(16))); M.accesKdf = KDF(1000, toB64(aleatoire(16)));
      const moi = await creerCompte(M, "admin", "SGT Exemple", "aide-exemple-1", "SGT Exemple");
      await creerCompte(M, "admin", "CCH Exemple", "aide-exemple-2", "SGT Exemple");
      await creerCompte(M, "lecteur", "CNE Exemple", "aide-exemple-3", "SGT Exemple");
      await creerCompte(M, "lecteur", "LTN Adjoint", "aide-exemple-4", "SGT Exemple");
      await creerAcces(M, "5ESC", "P1", "aide-exemple-5", "SGT Exemple", "LTN Chef");
      Object.assign(state, { compte: { id: moi.id, nom: moi.nom }, kek: null, principalEnv: {}, auteur: moi.nom }); }
      $("#btn-champs").click(); $("#btn-acces").click(); $("#dlg-acces .dlg-body").scrollTop = 0;`,
    encadres: [["#acces-list .subhead:nth-of-type(1)", 1, { cote: "droite" }], ["#acces-list .subhead:nth-of-type(2)", 2, { cote: "droite" }], ["#acces-list .subhead:nth-of-type(3)", 3, { cote: "droite" }]] },
  { nom: "comptes-creer", avant: `${demo} $("#btn-champs").click(); $("#btn-acces").click(); $("#acces-pel").value = "new:admin"; accesChoixNom();
      $("#acces-nom").value = "SGT Martin"; $("#acces-mdp").scrollIntoView({ block: "center" });`,
    encadres: [["#acces-pel", 1], ["#acces-nom", 2], ["#acces-mdp", 3], ["#acces-ok", 4, { cote: "dessus" }]] },
  { nom: "comptes-retirer", avant: `${demo} $("#btn-champs").click(); $("#btn-acces").click(); document.querySelector("#acces-list [data-retirer]").scrollIntoView({ block: "center" });`,
    encadres: [['#acces-list [data-retirer]:not([data-retirer="commun"])', 1], ['#acces-list [data-retirer="commun"]', 2]] },
  { nom: "journal", avant: `${demo} [["SGT Exemple", "Fiche modifiée : MDL ROUX Pauline — Famas › Bravo : → 02/11/2026"], ["CCH Exemple", "Séance du 02/11/2026 : Famas Bravo, Famas Charlie — 5 personnes"]]
        .forEach(([q, t]) => journaliser(state.data, q, t)); $("#btn-journal").click();`,
    encadres: [["#journal-q", 1], ["#journal-acces", 2], ["#journal-list", 3, { cote: "droite" }]], apres: neuf },
  { nom: "qualite", avant: `${demo} const P = state.data.personnes;
      P[0].v.tel = "612345678"; P[1].v.mail = "prenom.nom.example.org"; delete P[2].v.peloton;
      P.push({ id: "aide-doublon", v: { ...P[3].v } }); setView("qualite");`,
    encadres: [["#qu-resume", 1], ["#qualite table", 2, { marge: 2 }], ["#qu-tels", 3]], apres: neuf },

  /* ---------- CDU et adjoints (lecture complète) ---------- */
  { nom: "lecteur-accueil", avant: `${lecteur} setView("accueil");`, encadres: [["#role-badge", 1, { cote: "droite" }], [".topbar-actions", 2]] },
  { nom: "lecteur-fiche", avant: `${lecteur} setView("perso"); ficheOnglet = "tirs"; openPerson(${exemple}.id); $("#p-body").scrollTop = 0;`,
    encadres: [['label.fld:has([data-f="famas_b"])', 1], ["#dlg-person [data-close]", 2]], apres: `ficheOnglet = "essentiel"; ${neuf}` },

  /* ---------- Chefs de peloton ---------- */
  { nom: "chef-accueil", avant: `${chef} setView("accueil");`, encadres: [["#role-badge", 1, { cote: "droite" }], ["#accueil .kpis", 2, { cote: "dessus" }]] },
  { nom: "chef-a-faire", avant: `${chef} setView("todo");`, encadres: [["#td-jours", 1, { cote: "dessus" }], ["#td-mail", 2], ["#todo table", 3, { marge: 2 }]] },
  { nom: "chef-cati", avant: `${chef} setView("cati");`, encadres: [["#synth table tbody", 1, { marge: 1 }]] },
  { nom: "chef-fiche", avant: `${chef} setView("perso"); ficheOnglet = "tirs";
      openPerson((state.data.personnes.find(p => statusOf(p, champById("famas_b")).k === "bad") || state.data.personnes[0]).id); $("#p-body").scrollTop = 0;`,
    encadres: [["#p-bandeau", 1], ["#dlg-person [data-close]", 2]], apres: `ficheOnglet = "essentiel";` },
  { nom: "chef-telephones", avant: `${chef} setView("perso"); ouvrirTels(); $("#tels-cat").value = ""; telsRender();`,
    encadres: [["#tels-cat", 1], ["#tels-copier", 2, { cote: "dessus" }]], apres: neuf },
];
