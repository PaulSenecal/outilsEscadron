// Test de l'interface dans Chrome (headless), avec les données fictives de démonstration.
// Lancement : node tests/ui.mjs   (nécessite Google Chrome ou Chromium ; variable CHROME pour un autre chemin)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(p => fs.existsSync(p));
if (!CHROME) { console.log("Chrome introuvable : test d'interface ignoré (définir CHROME=…)."); process.exit(0); }

// Scénario exécuté dans la page. Chaque étape ajoute un résultat ; toute erreur JavaScript est relevée.
const scenario = `
const res = [], erreurs = [], dl = [];
window.addEventListener("error", e => erreurs.push(e.message));
window.confirm = () => true; window.alert = () => {}; window.prompt = () => "Fin de contrat";
window.download = (c, n) => dl.push(n);

// Attend une condition. Le déchiffrement prend du vrai temps alors que Chrome accélère les minuteries :
// on cède la main par un message (qui ne fait pas avancer le temps virtuel) plutôt que par setTimeout.
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
// Tant que le scénario tourne, la page reste occupée (messages) : le temps virtuel n'avance pas pendant les
// calculs de chiffrement. attendre() suspend cette boucle pour laisser passer le temps virtuel voulu.
let occupe = true, pause = false;
(async () => { while (occupe) { await tick(); if (pause) await new Promise(r => { const t = setInterval(() => { if (!pause) { clearInterval(t); r(); } }, 0); }); } })();
const attendre = async ms => { pause = true; await new Promise(r => setTimeout(r, ms)); pause = false; };
const quand = async (cond, maxMs = 20000) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < maxMs) await tick(); };
const verif = (nom, ok, info = "") => { res.push({ nom, ok: !!ok, info: String(info) }); document.body.setAttribute("data-resultats", JSON.stringify(res)); };
const clic = sel => document.querySelector(sel).click();
const valeur = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event(e.tagName === "SELECT" ? "change" : "input", { bubbles: true })); };
(async () => { try {
  $("#qui").value = "Testeur";
  clic("#btn-demo"); await quand(() => state.data);
  // Pendant les calculs de chiffrement (vrai temps), Chrome fait défiler le temps virtuel : pas de verrouillage automatique
  state.data.meta.verrouMinutes = 0;
  verif("Démo ouverte", state.data && state.data.meta.demo && !$("#demo-badge").hidden, state.data?.personnes.length);
  verif("Accueil par défaut", !$("#view-accueil").hidden && document.querySelectorAll("#accueil .kpi").length === 4 && $("#page-titre").textContent === "Accueil");
  const vues = ["accueil", "perso", "todo", "liste", "reo", "nrbc", "cati", "habillement", "permis", "stats"];
  for (const v of vues) { setView(v); await attendre(50); }
  verif("Tous les onglets s'affichent", erreurs.length === 0, erreurs.join(" | "));

  // Menus déroulants et navigation
  setView("perso"); const dd = document.querySelector("#view-perso .dd-btn");
  dd.click(); verif("Menu déroulant : ouverture", !dd.nextElementSibling.hidden);
  document.body.click(); verif("Menu déroulant : fermeture au clic ailleurs", dd.nextElementSibling.hidden);
  document.querySelector('.sb-nav [data-view="cati"]').click();
  verif("Barre latérale : changement de page et titre", !$("#view-synth").hidden && $("#page-titre").textContent === "CATI (tirs)");
  setView("accueil"); document.querySelector('#board .count:not([disabled])').click();
  verif("Accueil : un compteur ouvre la page Personnel filtrée", state.view === "perso" && state.filtre.champ !== "");
  state.filtre = freshFiltre(); renderFilters();

  // Nouveautés
  verif("Nouveautés : point affiché pour une version non consultée", !$("#nouveautes-dot").hidden);
  clic("#btn-nouveautes");
  verif("Nouveautés : panneau ouvert avec l'historique", $("#dlg-nouveautes").open && document.querySelectorAll("#nouveautes-list .nv").length === NOUVEAUTES.length);
  verif("Nouveautés : point retiré après lecture", $("#nouveautes-dot").hidden && state.data.meta.versionVue === VERSION);
  $("#dlg-nouveautes").close();

  // À faire
  setView("todo");
  verif("À faire : personnes concernées", document.querySelectorAll("#todo tbody tr").length > 0, document.querySelectorAll("#todo tbody tr").length);
  clic("#td-export"); verif("À faire : export Excel", dl.at(-1)?.startsWith("a-faire"), dl.at(-1));

  // Séance
  setView("perso"); clic("#btn-seance");
  document.querySelector('#se-champs [data-grp="Famas"]').click();
  const P = state.data.personnes.filter(p => p.v.escadron === "5ESC" && p.v.peloton === "P1").slice(0, 5);
  valeur("#se-texte", P.map(p => p.v.grade + " " + p.v.nom + " " + p.v.prenom).join("\\n"));
  valeur("#se-date", "2026-10-01"); clic("#se-go");
  verif("Séance : personnes trouvées", document.querySelectorAll("#se-match .badge.b-ok").length === 5, $("#se-resume").textContent);
  $("#form-seance").requestSubmit();
  verif("Séance : dates enregistrées", P.every(p => p.v.famas_b === "2026-10-01" || p.v.famas_b > "2026-10-01"));
  verif("Séance : journal", state.data.journal.at(-1).quoi.startsWith("Séance du 01/10/2026") && state.data.journal.at(-1).qui === "Testeur");

  // Annuler
  const avant = P[0].v.famas_b; clic("#btn-undo");
  const p0 = state.data.personnes.find(p => p.id === P[0].id);
  verif("Annuler : séance défaite", p0.v.famas_b !== "2026-10-01" || avant !== "2026-10-01", p0.v.famas_b);

  // Fiche : couleurs et archivage
  openPerson(state.data.personnes[0].id);
  verif("Fiche : statut des dates", document.querySelectorAll("#p-body .fstat").length > 5);
  const nb = state.data.personnes.length; clic("#btn-archiver");
  verif("Archivage", state.data.personnes.length === nb - 1 && state.data.archives.length === 2);
  clic("#btn-archives"); document.querySelector("#archives-list [data-restaurer]").click();
  verif("Restauration", state.data.personnes.length === nb && state.data.archives.length === 1); $("#dlg-archives").close();

  // Journal
  clic("#btn-journal");
  verif("Journal affiché", document.querySelectorAll("#journal-list .journal-row").length >= 4, document.querySelectorAll("#journal-list .journal-row").length);
  $("#dlg-journal").close();

  // Exports
  setView("perso"); clic("#btn-export"); setView("reo"); clic("#reo-export"); setView("cati"); clic("#sy-export");
  setView("permis"); clic("#sy-export"); setView("stats"); clic("#st-export");
  verif("Exports Excel", dl.filter(n => n.endsWith(".xlsx")).length >= 6, dl.join(", "));

  // Verrouillage de session puis reprise (mot de passe de la démo)
  state.dirty = true; await verrouillerSession();
  verif("Session verrouillée : données retirées", !state.data && !$("#form-session").hidden && !document.querySelector("#tbl").innerHTML);
  $("#pw-session").value = "mauvais"; $("#form-session").requestSubmit(); await quand(() => $("#err-session").textContent.startsWith("Mot de passe"));
  verif("Session : mauvais mot de passe refusé", !state.data && $("#err-session").textContent.length > 0);
  $("#pw-session").value = "demonstration"; $("#form-session").requestSubmit(); await quand(() => state.data);
  verif("Session reprise, modifications gardées", state.data && state.dirty && !$("#app").hidden);

  // Conflit : le fichier sur le disque a été réécrit ailleurs (autre IV) depuis l'ouverture
  state.lastIv = "iv-a-l-ouverture";
  const autreVersion = await encryptData("2026-10-01T10:00:00.000Z");
  state.handle = { getFile: async () => ({ text: async () => autreVersion }) };
  const choix = verifierConflit(); await quand(() => $("#dlg-conflit").open);
  verif("Conflit détecté avec date et auteur", $("#dlg-conflit").open && $("#conflit-info").textContent.includes("01/10/2026") && $("#conflit-info").textContent.includes("Testeur"), $("#conflit-info").textContent);
  $("#dlg-conflit").close("annuler");
  verif("Conflit : « Annuler » n'enregistre rien", (await choix) === "annuler");
  state.lastIv = JSON.parse(autreVersion).iv;
  verif("Pas de conflit si le fichier n'a pas changé", (await verifierConflit()) === "ok");
  state.handle = null;

  // Fusion à l'enregistrement : un collègue a enregistré le fichier pendant qu'on travaillait
  const ecrit = [], versionDe = async (D, quand_) => { const moi = state.data; state.data = D; const t = await encryptData(quand_); state.data = moi; return t; };
  let surDisque = "";
  state.handle = { getFile: async () => ({ text: async () => surDisque }), createWritable: async () => ({ write: async c => { ecrit.push(c); surDisque = c; }, close: async () => {} }) };
  state.lastIv = "iv-a-l-ouverture"; state.base = JSON.stringify(state.data);
  const B = JSON.parse(state.base); B.personnes[0].v.gant = "11"; B.journal.push({ t: new Date().toISOString(), qui: "Collègue", quoi: "Fiche modifiée" });
  surDisque = await versionDe(B, "2026-10-07T09:30:00.000Z");
  const [id0, id1, id2] = state.data.personnes.slice(0, 3).map(p => p.id), v = id => state.data.personnes.find(p => p.id === id).v;
  v(id1).gant = "7";
  await save();
  verif("Fusion sans conflit : ses modifications et les miennes", v(id0).gant === "11" && v(id1).gant === "7" && ecrit.length === 1 && !$("#dlg-fusion").open);
  const relu = (await decryptFile(ecrit[0], "demonstration")).data, rv = id => relu.personnes.find(p => p.id === id).v;
  verif("Fusion : le fichier écrit contient la version fusionnée", rv(id0).gant === "11" && rv(id1).gant === "7" && relu.journal.some(j => j.qui === "Collègue"));
  const B2 = JSON.parse(state.base); B2.personnes.find(p => p.id === id2).v.gant = "8";
  surDisque = await versionDe(B2, "2026-10-07T10:00:00.000Z");
  v(id2).gant = "10";
  const enCours = save(); await quand(() => $("#dlg-fusion").open);
  verif("Conflit sur la même case : fenêtre de choix", document.querySelectorAll("#fusion-list .fusion-item").length === 1, $("#fusion-list").textContent);
  document.querySelector('#fusion-list input[value="autre"]').click(); $("#form-fusion").requestSubmit(); await enCours;
  verif("Conflit : sa version choisie puis enregistrée", v(id2).gant === "8" && ecrit.length === 2);
  surDisque = ecrit.at(-1); v(id2).gant = "9";
  await save();
  verif("Fichier inchangé ailleurs : enregistrement direct", ecrit.length === 3 && !$("#dlg-fusion").open);
  // Relecture après écriture : un fichier relu différent n'est pas considéré comme enregistré
  state.handle = { getFile: async () => ({ text: async () => surDisque }), createWritable: async () => ({ write: async c => { surDisque = c.slice(0, 50); }, close: async () => {} }) };
  v(id2).gant = "5"; state.dirty = true;
  await save(true);
  verif("Relecture après écriture : erreur détectée, modifications gardées", state.dirty && state.autoSuspendu.includes("vérification"), state.autoSuspendu);
  state.autoSuspendu = ""; state.handle = null;

  // Copie de sauvegarde (Champs et réglages) : fichier chiffré à part, le fichier ouvert ne change pas
  let copieSauv = "";
  const picker = window.showSaveFilePicker, handleAvant = state.handle;
  window.showSaveFilePicker = async o => ({ name: o.suggestedName, getFile: async () => ({ text: async () => copieSauv }), createWritable: async () => ({ write: async c => { copieSauv = c; }, close: async () => {} }) });
  clic("#btn-champs"); clic("#btn-sauvegarde"); await quand(() => copieSauv);
  $("#dlg-champs").close(); window.showSaveFilePicker = picker;
  verif("Copie de sauvegarde chiffrée, fichier ouvert inchangé", (await decryptFile(copieSauv, "demonstration")).data.personnes.length === state.data.personnes.length && state.handle === handleAvant && state.dirty);

  // Mot de passe
  clic("#btn-champs"); clic("#btn-mdp");
  valeur("#mdp-ancien", "demonstration"); valeur("#mdp-nouveau", "nouveau-mot-de-passe"); valeur("#mdp-nouveau2", "nouveau-mot-de-passe");
  $("#form-mdp").requestSubmit(); await quand(() => $("#dlg-mdp").open === false);
  const blob = await encryptData(); let lu = false;
  try { await decryptFile(blob, "nouveau-mot-de-passe"); lu = true; } catch {}
  verif("Changement de mot de passe", lu);
  // Mot de passe de secours (réglages) : différent du mot de passe habituel ; le changer demande le secours actuel
  clic("#btn-champs"); clic("#btn-secours");
  verif("Secours : aucun au départ", $("#secours-ancien-fld").hidden && $("#secours-etat").textContent.includes("Aucun"));
  valeur("#secours-nouveau", "nouveau-mot-de-passe"); valeur("#secours-nouveau2", "nouveau-mot-de-passe");
  $("#form-secours").requestSubmit(); await quand(() => $("#err-secours").textContent.includes("différent"), 60000);
  verif("Secours : différent du mot de passe habituel", $("#dlg-secours").open);
  valeur("#secours-nouveau", "coffre-fort-du-capitaine"); valeur("#secours-nouveau2", "coffre-fort-du-capitaine");
  $("#form-secours").requestSubmit(); await quand(() => !$("#dlg-secours").open, 60000);
  const avecSecours = await encryptData();
  verif("Secours défini : il ouvre le fichier", state.data.meta.secours && (await decryptFile(avecSecours, "coffre-fort-du-capitaine")).via === "secours"
    && state.data.journal.at(-1).quoi === "Mot de passe de secours défini");
  clic("#btn-champs"); clic("#btn-secours");
  valeur("#secours-ancien", "pas-le-bon-secours"); valeur("#secours-nouveau", "autre-secours-pour-test"); valeur("#secours-nouveau2", "autre-secours-pour-test");
  $("#form-secours").requestSubmit(); await quand(() => $("#err-secours").textContent.includes("incorrect"), 60000);
  verif("Secours : le changer demande le secours actuel", $("#dlg-secours").open && $("#secours-etat").textContent.includes("Testeur"));
  $("#err-secours").textContent = ""; clic("#secours-suppr"); await quand(() => $("#err-secours").textContent.includes("incorrect"), 60000);
  verif("Secours : le supprimer aussi", state.data.meta.secours && $("#dlg-secours").open);
  $("#dlg-secours").close(); $("#dlg-champs").close();
  // Session verrouillée avant d'enregistrer le nouveau mot de passe : la clé de lecture du disque est conservée
  const lectureAvant = state.lecture.id, rawAvant = toB64(await crypto.subtle.exportKey("raw", state.lecture.key));
  await verrouillerSession();
  $("#pw-session").value = "coffre-fort-du-capitaine"; $("#form-session").requestSubmit(); await quand(() => $("#err-session").textContent.startsWith("Mot de passe"), 60000);
  verif("Session : le secours ne la déverrouille pas", !state.data);
  $("#pw-session").value = "nouveau-mot-de-passe"; $("#form-session").requestSubmit(); await quand(() => state.data, 60000);
  verif("Session : clé de lecture du disque conservée", state.lecture.id === lectureAvant && lectureAvant !== state.cleId && toB64(await crypto.subtle.exportKey("raw", state.lecture.key)) === rawAvant && state.mdpChange);
  verif("Jauge de solidité du mot de passe", $("#force-mdp").dataset.score === "4" && $("#force-mdp .force-label").textContent.includes("Excellent"), $("#force-mdp").dataset.score);
  // Afficher / masquer un mot de passe (œil), remasqué à la fermeture de la fenêtre
  clic("#btn-champs"); clic("#btn-mdp");
  const oeil = $("#mdp-nouveau").parentElement.querySelector(".pw-oeil");
  oeil.click();
  verif("Œil : mot de passe affiché", $("#mdp-nouveau").type === "text" && oeil.getAttribute("aria-pressed") === "true");
  $("#dlg-mdp").close(); $("#dlg-champs").close(); await quand(() => $("#mdp-nouveau").type === "password");
  verif("Œil : remasqué à la fermeture", $("#mdp-nouveau").type === "password" && document.querySelectorAll(".pw-oeil").length === document.querySelectorAll(".pw-wrap input").length);

  // Seuil d'alerte par formation (réglages)
  clic("#btn-champs");
  verif("Réglages : seuil d'alerte par formation", document.querySelector('#champs-list [data-k="alerte"]:not([disabled])') && $("#s-auto").checked);
  $("#dlg-champs").close();
  setView("todo");
  verif("À faire : selon les seuils par défaut", $("#td-jours").value === "seuil" && document.querySelectorAll("#todo tbody tr").length > 0);

  // Qualité des données
  state.data.personnes[0].v.mail = "pas-une-adresse"; setView("qualite");
  verif("Qualité : page et pastille", !$("#view-qualite").hidden && !$("#nav-qualite").hidden && erreurs.length === 0, erreurs.join(" | "));
  const ligneMail = [...document.querySelectorAll("#qualite tbody tr")].find(tr => tr.textContent.includes("pas-une-adresse"));
  verif("Qualité : mail mal formé signalé", ligneMail);
  ligneMail.click();
  verif("Qualité : un clic ouvre la fiche", $("#dlg-person").open);
  document.querySelector('#p-body [data-f="mail"]').value = "corrige@example.org"; $("#form-person").requestSubmit();
  verif("Qualité : corrigé, plus signalé", ![...document.querySelectorAll("#qualite tbody tr")].some(tr => tr.textContent.includes("pas-une-adresse")));

  // Historique de la fiche
  openPerson(state.data.personnes[0].id);
  const hist = $("#p-body .historique");
  verif("Fiche : historique de la personne", hist && /Historique \\([1-9]/.test(hist.querySelector("summary").textContent) && hist.textContent.includes("corrige@example.org"), hist?.textContent.slice(0, 200));
  $("#dlg-person").close();

  // Mise à jour depuis CARTEC (faux fichier : deux personnes de la démo, une nouvelle, un poste vide)
  const E = state.data.personnes[0].v.escadron, PE = state.data.personnes.filter(p => p.v.escadron === E).slice(0, 2);
  const gC = [[, , , "NIV", , "LIBELLE ETR", , , , , , "GRADE", "NOM", "PRENOM"], [, "00C99AA : ESCADRON DE TEST"],
    [, , "00C99AB : PELOTON DE COMMANDEMENT"], [, , , "00C99AC : GROUPE DE COMMANDEMENT"],
    [, , , , , "COMMANDANT D'UNITE COMBAT TERRESTRE 4", , , , , , PE[0].v.grade, PE[0].v.nom, PE[0].v.prenom],
    [, , , , , "NOUVEAU POSTE TEST", , , , , , PE[1].v.grade, PE[1].v.nom, PE[1].v.prenom],
    [, , , , , "CAVALIER TEST", , , , , , "1CL", "Nouveau", "Fictif"], [, , , , , "POSTE VIDE TEST"]];
  const avantCartec = state.data.personnes.length;
  ca = { nom: "cartec-test.xlsx", unites: lireCartec(gC), corresp: {} };
  ca.corresp["00C99AA"] = escadronPropose(ca.unites[0], state.data);
  caCalculer(); $("#dlg-cartec").showModal();
  verif("CARTEC : aperçu (escadron proposé, sections)", ca.corresp["00C99AA"] === E && document.querySelectorAll("#ca-details .ca-sec").length >= 3 && !$("#ca-go").disabled, $("#ca-resume").textContent);
  // « Nouveau Fictif » est en fait une fiche existante (qui allait être archivée) : lien corrigé à la main
  const cible = ca.plan.absents[0].id, sel = document.querySelector('#ca-details select[data-lien]');
  const grp = [...sel.querySelectorAll("optgroup")].map(g => g.label), gr = grp.slice(1).filter(g => GRADES.includes(g));
  verif("CARTEC : menu classé (archivées d'abord, puis grades décroissants)", grp[0] === "Absentes de CARTEC"
    && gr.every((g, i) => !i || GRADES.indexOf(gr[i - 1]) > GRADES.indexOf(g)), grp.join(" | "));
  sel.value = cible; sel.dispatchEvent(new Event("change", { bubbles: true }));
  verif("CARTEC : lien corrigé à la main", ca.plan.lignes.some(l => l.statut === "manuel" && l.p.id === cible) && !ca.plan.absents.some(p => p.id === cible));
  $("#form-cartec").requestSubmit();
  const p1 = state.data.personnes.find(p => p.id === PE[1].id);
  verif("CARTEC : rattachement, spécialité, lien, archivage", !$("#dlg-cartec").open && p1.v.spe === "NOUVEAU POSTE TEST" && p1.v.peloton === "PCL"
    && state.data.personnes.find(p => p.id === cible)?.v.spe === "CAVALIER TEST" && !state.data.personnes.some(p => p.v.nom === "Nouveau")
    && state.data.archives.some(a => a.archive?.motif === "Absent de CARTEC"));
  verif("CARTEC : historique de la fiche", historiquePersonne(state.data.journal, p1).some(j => j.quoi.includes("NOUVEAU POSTE TEST")));
  reoEsc = E; setView("reo");
  verif("CARTEC : REO (groupe, poste à pourvoir)", $("#reo").innerHTML.includes("Groupe de commandement") && $("#reo").textContent.includes("Poste à pourvoir — POSTE VIDE TEST"), $("#reo").textContent.slice(0, 200));
  clic("#btn-undo");
  verif("CARTEC : annulé en une fois", state.data.personnes.length === avantCartec && !state.data.reo.cartec && erreurs.length === 0, erreurs.join(" | "));

  // Compléter depuis le fichier UIR (faux fichier : deux personnes de la démo, une personne d'une autre unité)
  const PU = state.data.personnes.filter(p => p.v.escadron === E).slice(2, 4), autreTel = "07 00 00 00 01";
  const gU = [["NOM", "PRENOM", "SANTE", null, "N° PORTABLE", "N° SECURITE SOCIALE", "DATE DE NAISSANCE"], [null, null, "VMP", "PSC"], [],
    [PU[0].v.nom, PU[0].v.prenom, "30/04/2027", null, autreTel, "1 99 99 99", "10/05/1990"],
    [PU[1].v.nom, PU[1].v.prenom, "01/01/2020"], ["Inconnu", "Hors", "01/01/2027"]];
  ui_ = { nom: "uir-test.xlsx", lu: lireUIR(gU, state.data.champs), escadrons: [E] };
  uirCalculer(); $("#dlg-uir").showModal();
  const radio = document.querySelector('#uir-details input[data-garder][value="suivi"]');
  verif("UIR : aperçu (différence au choix, suivi par défaut, hors escadron)", radio?.checked && $("#uir-resume").textContent.includes("1ligne(s) hors"), $("#uir-resume").textContent);
  $("#form-uir").requestSubmit();
  const u0 = state.data.personnes.find(p => p.id === PU[0].id).v, u1 = state.data.personnes.find(p => p.id === PU[1].id).v;
  verif("UIR : valeurs appliquées, choix respecté", u0.vmp === "2027-04-30" && u0.nsecu === "1 99 99 99" && u0.tel !== autreTel && u1.vmp === "2020-01-01" && !$("#dlg-uir").open, JSON.stringify([u0.vmp, u0.tel]));
  openPerson(PU[0].id);
  const onglets = [...document.querySelectorAll("#p-onglets [data-onglet]")].map(b => b.dataset.onglet);
  const legendesDe = o => [...document.querySelectorAll('#p-body [data-panneau="' + o + '"] fieldset legend')].map(l => l.textContent);
  const dg = document.querySelector('#p-body [data-f="dategrade"]'); dg.value = "2020-01-01"; dg.dispatchEvent(new Event("input", { bubbles: true }));
  verif("Fiche : ancienneté de grade calculée à la saisie", / an/.test(document.querySelector('#p-body input[readonly][data-calc-de="dategrade"]')?.value || ""),
    document.querySelector('#p-body [data-calc-de="dategrade"]')?.outerHTML);
  verif("Fiche : onglets", onglets.join("|") === "essentiel|tirs|equipement|permis|personnel" && legendesDe("personnel").slice(-3).join("|") === "Famille|Personne à prévenir|Administratif"
    && legendesDe("essentiel").includes("Identité") && !document.querySelector('#p-body [data-panneau="essentiel"]').hidden && document.querySelector('#p-body [data-panneau="tirs"]').hidden, onglets.join("|"));
  const vmpIn = document.querySelector('#p-body [data-f="vmp"]'); vmpIn.value = "2000-01-01"; vmpIn.dispatchEvent(new Event("input", { bubbles: true }));
  verif("Fiche : alerte dans le bandeau et pastille de l'onglet", $("#p-bandeau .fiche-alertes").textContent.includes("VMP") && !document.querySelector('#p-onglets [data-onglet="essentiel"] .pastille').hidden);
  document.querySelector('#p-onglets [data-onglet="tirs"]').click(); $("#dlg-person").close(); openPerson(PU[1].id);
  verif("Fiche : dernier onglet retenu d'une fiche à l'autre", !document.querySelector('#p-body [data-panneau="tirs"]').hidden && document.querySelector('#p-body [data-panneau="essentiel"]').hidden);
  choisirOnglet("essentiel"); $("#dlg-person").close(); openPerson(PU[0].id);
  verif("Fiche : âge calculé, VMP surveillée", $("#p-body [data-calcul='naissance']").textContent.startsWith("Âge :") && !!document.querySelector('#p-body [data-statut="vmp"]'));
  $("#dlg-person").close();
  verif("UIR : VMP expirée dans « À faire »", echeances([state.data.personnes.find(p => p.id === PU[1].id)], suivis(), null, false)[0]?.items.some(i => i.f.id === "vmp" && i.k === "bad"));

  // Enregistrement automatique (fichier ouvert via File System Access)
  const disque = [];
  const fauxFichier = () => ({ getFile: async () => ({ text: async () => disque.at(-1) || "" }), createWritable: async () => ({ write: async c => disque.push(c), close: async () => {} }) });
  state.handle = fauxFichier(); state.lastIv = null;
  modif("Test automatique"); state.data.personnes[1].v.gant = "12"; markDirty();
  verif("Enregistrement automatique annoncé", $("#dirty").textContent.includes("automatique"), $("#dirty").textContent);
  await attendre(AUTO_DELAI + 5000); await quand(() => disque.length === 1);
  verif("Enregistrement automatique effectué", disque.length === 1 && !state.dirty, disque.length);

  // Actualisation automatique : un collègue enregistre pendant qu'on travaille
  const versionAilleurs = async (modifier, quand_) => { const D = JSON.parse(state.base); modifier(D); D.journal.push({ t: new Date().toISOString(), qui: "Collègue", quoi: "Fiche modifiée" });
    const moi = state.data; state.data = D; const x = await encryptData(quand_); state.data = moi; disque.push(x); };
  const gant = i => state.data.personnes[i].v.gant;
  verif("Actualisation : onglet visible", document.visibilityState === "visible", document.visibilityState);
  await versionAilleurs(D => { D.personnes[5].v.gant = "13"; }, "2026-10-08T12:00:00.000Z");
  await actualiser();
  verif("Actualisation : sa modification reprise (rien de modifié chez moi)", gant(5) === "13" && !state.dirty && $("#toast").textContent.includes("Collègue"), $("#toast").textContent);
  await versionAilleurs(D => { D.personnes[6].v.gant = "14"; }, "2026-10-08T12:01:00.000Z");
  state.data.personnes[7].v.gant = "15"; state.dirty = true;
  await actualiser();
  verif("Actualisation : fusion avec mes modifications en cours", gant(6) === "14" && gant(7) === "15" && state.dirty);
  await versionAilleurs(D => { D.personnes[7].v.gant = "16"; }, "2026-10-08T12:02:00.000Z");
  const nbDisque = disque.length, act = actualiser(); await quand(() => $("#dlg-fusion").open);
  verif("Actualisation : même case modifiée des deux côtés → fenêtre de choix", $("#dlg-fusion").open);
  $("#form-fusion").requestSubmit(); await act;
  verif("Actualisation : ma version gardée puis enregistrée", gant(7) === "15" && gant(6) === "14" && !state.dirty && disque.length === nbDisque + 1);
  const avantRien = disque.length; await actualiser();
  verif("Actualisation : rien à faire si le fichier n'a pas changé", disque.length === avantRien && !state.dirty);
  state.handle = null;

  // Ancien fichier (310 000 itérations) : relu, puis mis à niveau à l'enregistrement
  const s310 = crypto.getRandomValues(new Uint8Array(16));
  // Ancien format (1) : données chiffrées directement par la clé dérivée du mot de passe
  const iv310 = crypto.getRandomValues(new Uint8Array(12)), k310 = await deriveKey("ancien-mot-de-passe", s310, 310000);
  const ct310 = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv310 }, k310, new TextEncoder().encode(JSON.stringify(state.data)));
  const ancien = JSON.stringify({ format: FORMAT, version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310000, salt: toB64(s310) }, iv: toB64(iv310), data: toB64(ct310) });
  state.dirty = false; lock();
  disque.length = 0; disque.push(ancien);
  pending = { text: ancien, handle: fauxFichier(), name: "ancien.json", date: Date.now() };
  $("#pw-open").value = "ancien-mot-de-passe"; $("#form-open").requestSubmit(); await quand(() => state.data && $("#lock").hidden, 60000);
  verif("Ancien fichier ouvert, mise à niveau préparée", state.data && state.iter === 600000 && state.lecture.id.startsWith("v1:"), state.iter);
  await save();
  const ecritMaj = JSON.parse(disque.at(-1));
  verif("Mise à niveau à 600 000 itérations à l'enregistrement", disque.length === 2 && ecritMaj.version === 2 && ecritMaj.principal.kdf.iterations === 600000 && (await decryptFile(disque.at(-1), "ancien-mot-de-passe")).data);

  // Fichier réenregistré ailleurs avec un autre mot de passe : on le demande, puis on fusionne
  const moi = { key: state.key, cleId: state.cleId, kek: state.kek, salt: state.salt, iter: state.iter, data: state.data };
  const Bx = JSON.parse(state.base); Bx.personnes[2].v.gant = "6";
  Object.assign(state, { data: Bx }, await clesNeuves("mot-de-passe-du-collegue"));
  disque.push(await encryptData("2026-10-08T08:00:00.000Z"));
  Object.assign(state, moi); state.data.personnes[3].v.gant = "7"; state.dirty = true;
  const enr = save(); await quand(() => $("#dlg-cle").open);
  verif("Autre mot de passe sur le disque : il est demandé", $("#dlg-cle").open);
  $("#pw-cle").value = "faux-mot-de-passe"; $("#form-cle").requestSubmit(); await quand(() => $("#err-cle").textContent.startsWith("Mot de passe"));
  verif("Mauvais mot de passe refusé", $("#dlg-cle").open);
  $("#pw-cle").value = "mot-de-passe-du-collegue"; $("#form-cle").requestSubmit(); await enr;
  const fus = (await decryptFile(disque.at(-1), "mot-de-passe-du-collegue")).data;
  verif("Fusion avec la version au nouveau mot de passe", fus.personnes[2].v.gant === "6" && fus.personnes[3].v.gant === "7" && JSON.parse(disque.at(-1)).cleId === JSON.parse(disque.at(-2)).cleId);
  state.handle = null;

  // Ouverture avec le mot de passe de secours : un nouveau mot de passe habituel est obligatoire
  state.dirty = false; lock();
  pending = { text: avecSecours, handle: null, name: "secours.json", date: Date.now() };
  $("#pw-open").value = "coffre-fort-du-capitaine"; $("#form-open").requestSubmit(); await quand(() => $("#dlg-mdp").open, 60000);
  verif("Ouvert avec le secours : nouveau mot de passe demandé", $("#dlg-mdp").open && $("#mdp-ancien-fld").hidden && !state.kek);
  valeur("#mdp-nouveau", "coffre-fort-du-capitaine"); valeur("#mdp-nouveau2", "coffre-fort-du-capitaine");
  $("#form-mdp").requestSubmit(); await quand(() => $("#err-mdp").textContent.includes("différent"), 60000);
  verif("Nouveau mot de passe : différent du secours", $("#dlg-mdp").open);
  valeur("#mdp-nouveau", "mot-de-passe-retrouve"); valeur("#mdp-nouveau2", "mot-de-passe-retrouve");
  $("#form-mdp").requestSubmit(); await quand(() => !$("#dlg-mdp").open, 60000);
  const apresSecours = await encryptData();
  verif("Nouveau mot de passe habituel, secours conservé", state.kek && state.dirty && (await decryptFile(apresSecours, "mot-de-passe-retrouve")).via === "principal"
    && (await decryptFile(apresSecours, "coffre-fort-du-capitaine")).via === "secours" && state.data.journal.at(-1).quoi.includes("secours"));

  verif("Aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" | "));
  verif("Fin du scénario", true);
} catch (e) { verif("Scénario", false, e.stack); }
document.body.setAttribute("data-resultats", JSON.stringify(res));
// Plus aucune minuterie : Chrome atteint tout de suite la fin du temps virtuel et rend la page
for (let i = 1; i < 100000; i++) { clearInterval(i); clearTimeout(i); }
occupe = false;
})();`;

// Le scénario est un second script : on ajoute son empreinte à la politique de sécurité de la page
const empreinteScenario = "sha256-" + crypto.createHash("sha256").update(scenario, "utf8").digest("base64");
const page = fs.readFileSync(path.join(ici, "..", "index.html"), "utf8")
  .replace(/script-src '([^']*)'/, `script-src '$1' '${empreinteScenario}'`)
  .replace("</body>", `<script>${scenario}</script></body>`);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suivi-ui-"));
const fichier = path.join(tmp, "page.html");
fs.writeFileSync(fichier, page);

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--user-data-dir=${tmp}`, "--virtual-time-budget=1800000", "--dump-dom", "file://" + fichier]);
let dom = "";
chrome.stdout.on("data", d => { dom += d; });
const fin = setTimeout(() => chrome.kill(), 100000);
chrome.on("close", () => {
  clearTimeout(fin); fs.rmSync(tmp, { recursive: true, force: true });
  const m = dom.match(/data-resultats="([^"]*)"/);
  if (!m) { console.log("Pas de résultats (la page n'a pas terminé le scénario)."); process.exit(1); }
  const res = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'"));
  console.log("Test de l'interface (Chrome headless, données fictives)\n");
  res.forEach(r => console.log(`  ${r.ok ? "✓" : "✗"} ${r.nom}${r.ok || !r.info ? "" : "\n      " + r.info}`));
  if (!res.some(r => r.nom === "Fin du scénario")) res.push({ nom: "Scénario terminé", ok: false, info: "arrêt après « " + (res.at(-1)?.nom || "?") + " »" });
  const ko = res.filter(r => !r.ok).length;
  console.log(`\n${res.length - ko} réussi(s), ${ko} échoué(s)`);
  process.exit(ko ? 1 : 0);
});
