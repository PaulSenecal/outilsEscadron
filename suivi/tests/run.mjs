// Tests de la logique de suivi/index.html, avec les données fictives de démonstration.
// Aucune donnée réelle : ce fichier peut être publié. Lancement : node tests/run.mjs
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(ici, "..", "index.html"), "utf8");
// Partie « logique » du script : tout ce qui précède le marqueur de l'interface (pas de DOM)
const logique = html.split("<script>")[1].split("/* ===== Interface ===== */")[0];
const ctx = vm.createContext({ console, TextEncoder, TextDecoder, crypto, btoa, atob, Blob, Response, DecompressionStream, URL, Map, Set, Date, Intl, JSON, Math });
vm.runInContext(logique + ";globalThis.L = this;", ctx);
// Les déclarations « const » ne sont pas des propriétés du global : on les expose explicitement
const L = vm.runInContext(`({ state, emptyData, normalize, donneesDemo, encryptData, decryptFile, deriveKey, readXlsx, parseCsv, decodeText,
  planImport, computeImport, applyImport, personKey, xlsxPersonnel, csvPersonnel, lignesDepuisTexte, rapprocher, permisChamps,
  permisEtat, defaultReglesPermis, seanceChangements, echeances, diffFiche, journaliser, JOURNAL_MAX, statFormation, statutTaux,
  statusOf, reoBlocs, groupesPeloton, defaultChamps, SCHEMA, fusionner, ITER, forceMotDePasse, controleQualite, historiquePersonne,
  seuilAlerte, isoLocal, today, lireCartec, planCartec, appliquerCartec, escadronPropose, reoBlocs })`, ctx);

let ok = 0, ko = 0;
async function test(nom, fn) {
  try { await fn(); ok++; console.log("  ✓", nom); }
  catch (e) { ko++; console.log("  ✗", nom, "\n     ", e.message); }
}
const court = t => t.length > 300 ? t.slice(0, 300) + "…" : t;
function egal(a, b, msg = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${msg} attendu ${court(y)}, obtenu ${court(x)}`); }
/* Fiche comparable quel que soit l'ordre des champs */
const fiche = v => JSON.stringify(Object.entries(v).sort());
function vrai(c, msg) { if (!c) throw new Error(msg); }
const copie = o => JSON.parse(JSON.stringify(o));
const demo = () => { const d = L.normalize(L.donneesDemo()); L.state.data = d; return d; };
const buffer = async blob => blob.arrayBuffer();

console.log("Tests de suivi/index.html\n");

await test("Données de démonstration reproductibles", () => {
  const a = L.donneesDemo(), b = L.donneesDemo();
  egal(a.personnes.map(p => p.v.nom + p.v.prenom), b.personnes.map(p => p.v.nom + p.v.prenom));
  vrai(a.personnes.length > 200, "au moins 200 personnes");
  vrai(a.personnes.every(p => p.v.mail.endsWith("@example.org")), "adresses fictives uniquement");
});

await test("Chiffrement : aller-retour et mauvais mot de passe", async () => {
  const d = demo();
  L.state.salt = crypto.getRandomValues(new Uint8Array(16)); L.state.iter = 1000;
  L.state.key = await L.deriveKey("mot-de-passe-test", L.state.salt, 1000);
  const fichier = await L.encryptData("2026-01-01T00:00:00.000Z");
  const r = await L.decryptFile(fichier, "mot-de-passe-test");
  egal(r.data.personnes, d.personnes, "personnes");
  egal(r.data.meta.modifie, "2026-01-01T00:00:00.000Z", "date d'enregistrement");
  let refuse = false; try { await L.decryptFile(fichier, "autre"); } catch { refuse = true; }
  vrai(refuse, "un mauvais mot de passe doit être refusé");
  vrai(!fichier.includes(d.personnes[0].v.nom), "aucun nom en clair dans le fichier chiffré");
});

await test("Export Excel → import : données identiques", async () => {
  const d = demo(), ref = new Map(d.personnes.map(p => [L.personKey(p.v), JSON.stringify(Object.entries(p.v).sort())]));
  const grid = await L.readXlsx(await buffer(L.xlsxPersonnel(d)));
  L.state.data = L.emptyData("vide");
  const imp = L.planImport(grid, L.state.data.champs);
  egal(imp.cols.filter(c => c.cible === "+" || !c.cible).map(c => c.s), [], "colonnes non reconnues");
  const r = L.computeImport(imp, L.state.data.champs);
  egal(r.warnings.length, 0, "avertissements");
  L.applyImport(r);
  const diff = L.state.data.personnes.filter(p => ref.get(L.personKey(p.v)) !== JSON.stringify(Object.entries(p.v).sort()));
  egal(diff.length, 0, "personnes différentes");
  egal(L.state.data.personnes.length, d.personnes.length, "nombre de personnes");
});

await test("Export CSV → import : données identiques", async () => {
  const d = demo(), csv = L.csvPersonnel(d);
  L.state.data = L.emptyData("vide");
  const imp = L.planImport(L.parseCsv(L.decodeText(new TextEncoder().encode(csv).buffer)), L.state.data.champs);
  const r = L.computeImport(imp, L.state.data.champs);
  egal(r.warnings.length, 0, "avertissements"); L.applyImport(r);
  egal(L.state.data.personnes.map(p => fiche(p.v)).sort(), d.personnes.map(p => fiche(p.v)).sort());
});

await test("Import d'un tableau type escadron (2 lignes d'en-tête, NEANT, oui, ?)", () => {
  L.state.data = L.emptyData("x");
  const grid = [
    [null, "Info Personnel", null, null, null, "Permis", null, "Famas", null, "Nbc"],
    ["nom", "Prenom", "Grade", "Escadron", "Peloton", "P4", "Masstech", "dernier tir", "bravo", "t3p"],
    ["Dupont", "Jean", "MDL", "mort pour la france", "P1", "oui", "?", 45900, "11/12/0199", "NEANT"]];
  const r = L.computeImport(L.planImport(grid, L.state.data.champs), L.state.data.champs);
  const v = r.rows[0];
  egal([v.escadron, v.p4, v.masstech, v.famas_tir, v.t3p], ["En attente", "oui", "?", "2025-08-31", undefined]);
  egal(r.warnings.map(w => w.champ), ["Famas › Bravo"], "date invalide signalée");
});

await test("Rapprochement des noms (ordre libre, accents, en-tête ignoré, homonymes)", () => {
  const P = [{ id: "a", v: { nom: "D’Amore", prenom: "José" } }, { id: "b", v: { nom: "Bonnel", prenom: "Xavier" } }, { id: "c", v: { nom: "Bonnel", prenom: "Thierry" } }];
  const lignes = L.lignesDepuisTexte("Grade\tNom\tPrénom\nMDL BONNEL Xavier\n1CL d'amore jose\nBonnel\nInconnu Paul");
  egal(lignes.length, 4, "en-tête ignoré");
  egal(lignes.map(l => L.rapprocher(l, P).etat), ["ok", "ok", "ambigu", "absent"]);
});

await test("Éligibilité aux permis (règles par défaut)", () => {
  L.state.data = L.emptyData("x");
  const C = L.state.data.champs, R = L.defaultReglesPermis(), f = id => C.find(c => c.id === id);
  const p = { v: { civil: "oui", pl: "2020-01-01", vt4: "?" } };
  egal(["vt4", "masstech", "pl", "superpl", "pdang", "tc"].map(id => L.permisEtat(p, f(id), R, C)), ["ver", "eli", "tit", "eli", "eli", "eli"]);
  egal(L.permisEtat({ v: {} }, f("vt4"), R, C), "", "sans permis : rien");
});

await test("Migrations : v1 → actuel, gants vers Habillement, règles de permis", () => {
  const v1 = L.normalize({ meta: { titre: "Ancien" }, types: [{ id: "t1", label: "Tir", validite: 6 }],
    personnes: [{ id: "p", grade: "MDL", nom: "A", prenom: "B", section: "P1", dates: { t1: "2025-01-01" } }] });
  egal(v1.personnes[0].v, { nom: "A", prenom: "B", grade: "MDL", peloton: "P1", t1: "2025-01-01" });
  egal(v1.meta.schema, L.SCHEMA);
  const d = L.emptyData("x"); d.meta = { titre: "x", schema: 2 }; delete d.permisRegles;
  d.champs = d.champs.filter(c => !["beret", "veste", "pantalon", "eryx"].includes(c.id)).map(c => c.id === "gant" ? { ...c, groupe: "NRBC" } : c);
  const n = L.normalize(copie(d));
  egal(n.champs.find(c => c.id === "gant").groupe, "Habillement");
  vrai(["beret", "eryx"].every(id => n.champs.some(c => c.id === id)), "béret et Eryx ajoutés");
  egal(n.permisRegles.pdang, ["pl", "superpl"]);
  egal(JSON.stringify(L.normalize(copie(n))), JSON.stringify(n), "migration idempotente");
  const garde = L.normalize({ ...copie(n), meta: { ...n.meta, reglesPermisV: 3 }, permisRegles: { pdang: ["civil"] } });
  egal(garde.permisRegles.pdang, ["civil"], "règle modifiée à la main conservée");
});

await test("Séance : dates enregistrées, date plus récente conservée", () => {
  const f = { id: "famas_b", type: "date", validite: 12 };
  const P = [{ v: {} }, { v: { famas_b: "2024-01-01" } }, { v: { famas_b: "2026-12-01" } }];
  egal(L.seanceChangements(P, [f], "2026-10-01", false).map(c => [c.apres, c.garde]), [["2026-10-01", false], ["2026-10-01", false], ["2026-12-01", true]]);
  egal(L.seanceChangements(P, [f], "2026-10-01", true).filter(c => !c.garde).length, 3, "forcer");
});

await test("Échéances, statistiques et statut", () => {
  const d = demo(), C = d.champs.filter(c => c.type === "date" && c.validite && d.personnes.some(p => p.v[c.id]));
  const e = L.echeances(d.personnes, C, 30, false);
  vrai(e.every(x => x.items.every(it => it.days <= 30)), "rien au-delà de 30 jours");
  const s = L.statFormation(d.personnes, d.champs.find(c => c.id === "famas_b"));
  egal(s.ok + s.warn + s.bad + s.none, d.personnes.length, "chaque personne comptée une fois");
  egal([0.8, 0.6, 0.2, null].map(t => L.statutTaux(t)[2]), ["Bon", "Moyen", "Critique", "Pas de donnée"]);
});

await test("REO : blocs Commandement, PCL, pelotons et postes à pourvoir", () => {
  const d = demo(), b = L.reoBlocs(d.personnes, "5ESC", d.reo);
  egal(b.map(x => x.label), ["Commandement", "PCL", "P1", "P2", "P3", "P4"]);
  egal(b[1].groupes.find(g => g.golf === "3").vacants, 1, "3 postes prévus, 2 occupés");
});

await test("Journal : différences lisibles et taille limitée", () => {
  const d = L.emptyData("x");
  egal(L.diffFiche(d.champs, { famas_b: "2025-01-01" }, { famas_b: "2026-10-01" }), ["Famas › Bravo : 01/01/2025 → 01/10/2026"]);
  for (let i = 0; i < L.JOURNAL_MAX + 10; i++) L.journaliser(d, "test", "entrée " + i);
  egal(d.journal.length, L.JOURNAL_MAX); egal(d.journal.at(-1).quoi, `entrée ${L.JOURNAL_MAX + 9}`);
});

await test("Fusion : changements différents des deux côtés gardés, sans question", () => {
  const A = demo(), B = copie(A), C = copie(A);
  const [p1, p2] = [A.personnes[0].id, A.personnes[1].id];
  B.personnes.find(p => p.id === p2).v.gant = "11";                  // l'autre : une taille
  C.personnes.find(p => p.id === p1).v.famas_b = "2026-10-01";       // moi : une date de tir
  B.journal.push({ t: "2026-10-07T10:00:00.000Z", qui: "Collègue", quoi: "Fiche X" });
  const f = L.fusionner(A, B, C);
  egal(f.conflits.length, 0, "aucun conflit");
  egal([f.data.personnes.find(p => p.id === p1).v.famas_b, f.data.personnes.find(p => p.id === p2).v.gant], ["2026-10-01", "11"]);
  vrai(f.data.journal.some(j => j.qui === "Collègue"), "journal de l'autre repris");
  vrai(f.repris >= 1, "changement de l'autre compté");
});

await test("Fusion : même case modifiée des deux côtés = conflit, ma version par défaut, l'autre au choix", () => {
  const A = demo(), B = copie(A), C = copie(A), id = A.personnes[0].id;
  B.personnes[0].v.famas_b = "2026-09-01"; C.personnes[0].v.famas_b = "2026-10-01";
  const f = L.fusionner(A, B, C);
  egal(f.conflits.length, 1); vrai(f.conflits[0].desc.includes("Famas › Bravo"), f.conflits[0].desc);
  egal(f.data.personnes.find(p => p.id === id).v.famas_b, "2026-10-01", "par défaut : ma version");
  f.conflits[0].choisirAutre(f.data);
  egal(f.data.personnes.find(p => p.id === id).v.famas_b, "2026-09-01", "choix : sa version");
});

await test("Fusion : ajouts des deux côtés, case vidée, même modification = pas de conflit", () => {
  const A = demo(), B = copie(A), C = copie(A);
  B.personnes.push({ id: "nouveau-b", v: { nom: "Autre" } }); C.personnes.push({ id: "nouveau-c", v: { nom: "Moi" } });
  delete B.personnes[3].v.tel;                                     // l'autre vide une case
  B.personnes[4].v.gant = "9"; C.personnes[4].v.gant = "9";        // même valeur des deux côtés
  const f = L.fusionner(A, B, C);
  egal(f.conflits.length, 0);
  vrai(["nouveau-b", "nouveau-c"].every(id => f.data.personnes.some(p => p.id === id)), "les deux ajouts gardés");
  egal(f.data.personnes.find(p => p.id === A.personnes[3].id).v.tel, undefined, "case vidée par l'autre");
});

await test("Fusion : suppression d'un côté, modification de l'autre = conflit", () => {
  const A = demo(), id = A.personnes[5].id;
  let B = copie(A), C = copie(A);
  B.personnes = B.personnes.filter(p => p.id !== id); C.personnes.find(p => p.id === id).v.gant = "10";
  let f = L.fusionner(A, B, C);
  egal(f.conflits.length, 1, "supprimée par l'autre, modifiée par moi");
  vrai(f.data.personnes.some(p => p.id === id), "gardée par défaut");
  f.conflits[0].choisirAutre(f.data); vrai(!f.data.personnes.some(p => p.id === id), "supprimée au choix");
  B = copie(A); C = copie(A);
  C.personnes = C.personnes.filter(p => p.id !== id); B.personnes.find(p => p.id === id).v.gant = "10";
  f = L.fusionner(A, B, C);
  egal(f.conflits.length, 1, "supprimée par moi, modifiée par l'autre");
  vrai(!f.data.personnes.some(p => p.id === id), "supprimée par défaut (mon choix)");
  f.conflits[0].choisirAutre(f.data); egal(f.data.personnes.find(p => p.id === id).v.gant, "10", "sa version restaurée");
  B = copie(A); C = copie(A); B.personnes = B.personnes.filter(p => p.id !== id);
  f = L.fusionner(A, B, C);
  egal([f.conflits.length, f.data.personnes.some(p => p.id === id)], [0, false], "supprimée par l'autre, non modifiée par moi");
});

await test("Fusion : archivage par l'autre repris, réglages repris, sans doublon", () => {
  const A = demo(), B = copie(A), C = copie(A), p = B.personnes.shift();
  B.archives.push({ ...p, archive: { date: "2026-10-07", motif: "Mutation" } });
  B.meta.alerteJours = 45; B.reo.postes["P1|1"] = 7;
  C.personnes[10].v.gant = "8";
  const f = L.fusionner(A, B, C);
  egal(f.conflits.length, 0);
  vrai(!f.data.personnes.some(x => x.id === p.id) && f.data.archives.some(x => x.id === p.id && x.archive.motif === "Mutation"), "archivé une seule fois");
  egal([f.data.meta.alerteJours, f.data.reo.postes["P1|1"], f.data.personnes.find(x => x.id === C.personnes[10].id).v.gant], [45, 7, "8"]);
  egal(f.data.personnes.length + f.data.archives.length, A.personnes.length + A.archives.length, "aucune fiche perdue ni dupliquée");
});

await test("Politique de sécurité : empreinte du script à jour, aucune source réseau hors Google Fonts", async () => {
  const { empreinte } = await import("./csp.mjs");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1];
  vrai(csp, "balise Content-Security-Policy présente");
  vrai(csp.includes(`script-src '${empreinte(html)}'`), "empreinte périmée : lancer node tests/csp.mjs");
  vrai(/connect-src 'none'/.test(csp) && /default-src 'none'/.test(csp) && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), csp);
});

await test("Chiffrement : 600 000 itérations, ancien fichier relu avec ses itérations", async () => {
  egal(L.ITER, 600000);
  demo();
  L.state.salt = crypto.getRandomValues(new Uint8Array(16)); L.state.iter = 310000;
  L.state.key = await L.deriveKey("ancien-fichier-310k", L.state.salt, 310000);
  const r = await L.decryptFile(await L.encryptData(), "ancien-fichier-310k");
  egal(r.iter, 310000, "itérations lues dans le fichier");
});

await test("Solidité du mot de passe", () => {
  const s = pw => L.forceMotDePasse(pw).score;
  egal(s("court"), 0, "moins de 10 caractères");
  vrai(s("Azerty1234!") <= 1, "azerty + suite : faible");
  vrai(s("Gendarmerie2024") <= 1, "mot courant + année : faible");
  vrai(s("motdepasse12") <= 1, "mot de passe courant : faible");
  vrai(s("cheval-lampe-orage-tulipe") >= 3, "phrase de passe : bonne");
  vrai(s("x7#Kq!92mZ@pLw4") >= 3, "aléatoire long : bon");
  vrai(L.forceMotDePasse("Azerty1234!").conseil.includes("phrase de passe"), "conseil affiché");
});

await test("Seuil d'alerte par formation", () => {
  const d = demo(), f = d.champs.find(c => c.id === "psc1"), g = d.champs.find(c => c.id === "sc1");
  const dans = j => { const t = L.today(); t.setDate(t.getDate() + j); t.setMonth(t.getMonth() - 12); return L.isoLocal(t); };
  const p = { id: "x", v: { psc1: dans(45), sc1: dans(45) } };
  egal(L.statusOf(p, f).k, "ok", "45 jours avec le seuil général (30)");
  f.alerte = 60;
  egal([L.seuilAlerte(f), L.seuilAlerte(g)], [60, 30]);
  egal([L.statusOf(p, f).k, L.statusOf(p, g).k], ["warn", "ok"], "seuil propre à PSC1");
  egal(L.echeances([p], [f, g], null, false)[0].items.map(i => i.f.id), ["psc1"], "À faire selon les seuils");
  egal(L.echeances([p], [f, g], 50, false)[0].items.length, 2, "À faire sous 50 jours");
});

await test("Qualité des données : doublons, mails, téléphones, dates, rattachement", () => {
  const d = L.emptyData("q"); L.state.data = d;
  const futur = (() => { const t = L.today(); t.setFullYear(t.getFullYear() + 1); return L.isoLocal(t); })();
  d.personnes = [
    { id: "a", v: { nom: "Durand", prenom: "Jean", escadron: "5ESC", peloton: "P1", grade: "MDL", mail: "jean@example.org", tel: "06 12 34 56 78" } },
    { id: "b", v: { nom: "DURAND", prenom: "jean", escadron: "5ESC", peloton: "P2", grade: "MDL" } },
    { id: "c", v: { nom: "Petit", prenom: "Léa", escadron: "5ESC", peloton: "P1", grade: "XYZ", mail: "lea@example", tel: "12345" } },
    { id: "d", v: { nom: "Martin", prenom: "Paul", escadron: "5ESC", grade: "BRI", mail: "jean@example.org", famas_b: futur, fincontrat: futur, entree: "1900-01-01" } },
    { id: "e", v: { nom: "Moreau", prenom: "Jean-Marc", escadron: "5ESC", peloton: "P3", grade: "CPL", tel: "+33 6 12 34 56 78" } },
    { id: "f", v: { nom: "Moreau", prenom: "Jean", escadron: "5ESC", peloton: "P3", grade: "CPL" } }
  ];
  const Q = L.controleQualite(d), de = (t, id) => Q.filter(x => x.type === t && x.p.id === id).length;
  egal(Q.filter(x => x.type === "doublon").length, 3, "Durand/DURAND, même mail, Moreau Jean / Jean-Marc");
  egal([de("mail", "c"), de("tel", "c"), de("grade", "c")], [1, 1, 1], "Léa Petit");
  egal([de("tel", "a"), de("tel", "e"), de("mail", "a")], [0, 0, 0], "formats valides acceptés");
  egal([de("futur", "d"), de("ancienne", "d"), de("rattachement", "d")], [1, 1, 1], "Paul Martin (fin de contrat future acceptée)");
  vrai(L.controleQualite(demo()).filter(x => x.type !== "doublon").length === 0, "démo sans erreur de saisie");
});

await test("Historique d'une personne", () => {
  const d = demo(), p = d.personnes[0], q = d.personnes[1];
  L.journaliser(d, "A", "Fiche modifiée", [p.id]);
  L.journaliser(d, "B", "Séance", [q.id]);
  L.journaliser(d, "C", `Ancienne entrée — ${p.v.nom.toUpperCase()} ${p.v.prenom} ; autre`);
  const H = L.historiquePersonne(d.journal, p);
  egal(H.map(j => j.qui), ["C", "A"], "par identifiant ou par nom, plus récent d'abord");
});

/* Faux fichier CARTEC (noms fictifs), même découpage que le vrai : colonnes B unité, C peloton, D groupe,
   F libellé, L grade, M nom, N prénom ; un état-major en tête (ignoré) */
function fauxCartec() {
  const g = [], L = (c = {}) => { const r = []; Object.entries(c).forEach(([k, v]) => { r["ABCDEFGHIJKLMN".indexOf(k)] = v; }); g.push(r); };
  L({ D: "NIV", E: "CODE", F: "LIBELLE ETR", G: "MILITAIRES", K: "SAP", L: "GRADE", M: "NOM", N: "PRENOM" }); L({ G: "OFF" });
  L({ A: "00C9000 ECL" }); L({ C: "OMT", F: "OFFICIER ADJOINT 5B", L: "LCL", M: "Etat", N: "Major" });
  L({ B: "00C99AA : 1ER RCH - ESCADRON DE TEST 4" });
  L({ C: "00C99AB : PELOTON DE COMMANDEMENT" });
  L({ D: "00C99AC : GROUPE DE COMMANDEMENT" });
  L({ C: "OMT", F: "COMMANDANT D'UNITE COMBAT TERRESTRE 4", L: "CNE", M: "Alpha", N: "Albert" });
  L({ D: "00C99AD : GROUPE SANTE" });
  L({ C: "SAN", F: "INFIRMIER EN SOINS GENERAUX 2", L: "MDL", M: "Bravo", N: "Bernard" });
  L({ C: "SAN", F: "AUXILIAIRE SANITAIRE 1C" });                                    // poste à pourvoir
  L({ C: "00C99AE : 1ER PELOTON DE RECONNAISSANCE ET D'INTERVENTION" });
  L({ D: "00C99AF : PATROUILLE DE COMMANDEMENT" });
  L({ C: "OMT", F: "CHEF DE PELOTON 4", L: "LTN", M: "Charlie", N: "Claire" });
  L({ L: "ADC", M: "Delta", N: "Denis" });                                          // même poste (ligne sans libellé)
  L({ D: "00C99AG : PATROUILLE D'ECLAIRAGE" });
  L({ C: "OMT", F: "CAVALIER BLINDE PILOTE 1A", L: "1CL", M: "Echo", N: "Jean-Marc" }); // prénom plus long que la fiche
  L({ C: "OMT", F: "CAVALIER BLINDE TIREUR 1A", L: "CHA", M: "Foxtrot", N: "Fanny" });  // nouvelle
  L({ C: "OMT", F: "CAVALIER BLINDE TIREUR 1A", L: "1CL", M: "Golfe", N: "Gilles" });   // archivé
  L({ C: "OMT", F: "CAVALIER BLINDE TIREUR 1A", L: "1CL", M: "Hotel", N: "Henri" });    // deux fiches homonymes
  L({ B: "00C99ZZ : AUTRE UNITE SANS COMMANDANT" });
  L({ C: "00C99ZY : SECTION X" }); L({ D: "00C99ZX : GROUPE Y" });
  L({ C: "OMT", F: "AGENT 1A", L: "1CL", M: "Ignore", N: "Igor" });
  return g;
}

await test("CARTEC : lecture du découpage (unité, peloton, groupe, postes)", () => {
  const U = L.lireCartec(fauxCartec());
  egal(U.length, 1, "seule l'unité avec un commandant d'unité, sans l'état-major");
  const u = U[0];
  egal([u.code, u.entrees.length, u.vacants.length], ["00C99AA", 8, 1]);
  egal(u.entrees.map(e => e.peloton + "/" + e.golf), ["PCL/0", "PCL/1", "P1/0", "P1/0", "P1/1", "P1/1", "P1/1", "P1/1"]);
  egal(u.entrees[3].spe, "CHEF DE PELOTON 4", "ligne sans libellé = même poste");
  egal(u.vacants[0], { peloton: "PCL", golf: "1", libelle: "AUXILIAIRE SANITAIRE 1C" });
  egal([u.groupes["PCL|1"], u.groupes["P1|1"]], ["Groupe santé", "Patrouille d'éclairage"]);
});

await test("CARTEC : rapprochement, mise à jour, archivage, REO", () => {
  const d = L.emptyData("t"); L.state.data = d;
  const P = (id, v) => d.personnes.push({ id, v: { escadron: "4ESC", ...v } });
  P("a", { nom: "ALPHA", prenom: "Albert", peloton: "PCL", golf: "0", spe: "COMMANDANT D'UNITE COMBAT TERRESTRE 4", grade: "CNE" });   // identique
  P("b", { nom: "Bravo", prenom: "Bernard", peloton: "P2", golf: "3", spe: "ANCIEN POSTE", grade: "SGT", tel: "0600000000" });   // à mettre à jour
  P("c", { nom: "Charlie", prenom: "Claire", peloton: "P1", golf: "0", spe: "CHEF DE PELOTON 4" });
  P("e", { nom: "Echo", prenom: "Jean", peloton: "P1", golf: "1", spe: "CAVALIER BLINDE PILOTE 1A" });   // prénom proche
  P("h1", { nom: "Hotel", prenom: "Henri", peloton: "P3" }); P("h2", { nom: "Hotel", prenom: "Henri", peloton: "P4" });
  P("x", { nom: "Parti", prenom: "Paul", peloton: "P1" });                                            // absent de CARTEC
  d.personnes.push({ id: "y", v: { nom: "Autre", prenom: "Unite", escadron: "9ESC" } });             // autre escadron : intact
  d.archives.push({ id: "g", v: { nom: "Golfe", prenom: "Gilles", escadron: "4ESC" }, archive: { date: "2025-01-01", motif: "x" } });
  const U = L.lireCartec(fauxCartec());
  egal(L.escadronPropose(U[0], d), "4ESC", "escadron proposé d'après les fiches retrouvées");
  const corresp = { "00C99AA": "4ESC" }, plan = L.planCartec(U, d, corresp);
  const st = n => plan.lignes.find(l => l.e.nom === n).statut;
  egal(["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golfe", "Hotel"].map(st),
    ["identique", "maj", "identique", "nouveau", "probable", "nouveau", "restaurer", "ambigu"]);
  egal(plan.absents.map(p => p.id), ["x"], "absent de CARTEC (pas les homonymes non tranchés, pas l'autre escadron)");
  const r = L.appliquerCartec(d, U, plan, corresp, new Set(), "2026-10-08");
  egal([r.maj, r.crees, r.restaures, r.archives], [2, 2, 1, 1]);
  const b = d.personnes.find(p => p.id === "b").v;
  egal([b.peloton, b.golf, b.spe, b.grade, b.tel], ["PCL", "1", "INFIRMIER EN SOINS GENERAUX 2", "SGT", "0600000000"], "rattachement et spécialité seulement");
  vrai(d.archives.some(p => p.id === "x" && p.archive.motif === "Absent de CARTEC") && d.personnes.some(p => p.id === "g"), "archivé / restauré");
  vrai(d.personnes.find(p => p.v.nom === "Foxtrot").v.grade === "CHA", "nouvelle fiche avec son grade");
  egal(d.personnes.find(p => p.id === "y").v, { nom: "Autre", prenom: "Unite", escadron: "9ESC" }, "autre escadron intact");
  // Second passage : tout est à jour, le nom proche validé n'est plus redemandé
  const plan2 = L.planCartec(U, d, corresp);
  egal([...new Set(plan2.lignes.map(l => l.statut))].sort(), ["ambigu", "identique"]);
  egal(plan2.absents.length, 0);
  // REO : noms des groupes CARTEC et postes à pourvoir avec leur libellé
  const B = L.reoBlocs(d.personnes, "4ESC", d.reo);
  const sante = B.flatMap(x => x.groupes).find(g => g.peloton === "PCL" && g.golf === "1");
  egal([B[0].label, sante.nom, sante.vacants, sante.postesVacants], ["Groupe de commandement", "Groupe santé", 1, ["AUXILIAIRE SANITAIRE 1C"]]);
});

await test("CARTEC : décocher dans l'aperçu", () => {
  const d = L.emptyData("t"); L.state.data = d;
  d.personnes.push({ id: "e", v: { nom: "Echo", prenom: "Jean", escadron: "4ESC" } }, { id: "x", v: { nom: "Parti", prenom: "Paul", escadron: "4ESC" } });
  const U = L.lireCartec(fauxCartec()), corresp = { "00C99AA": "4ESC" }, plan = L.planCartec(U, d, corresp);
  const cle = n => plan.lignes.find(l => l.e.nom === n).cle;
  const r = L.appliquerCartec(d, U, plan, corresp, new Set([cle("Echo"), cle("Foxtrot"), "x"]));
  vrai(d.personnes.some(p => p.id === "x"), "absent non archivé");
  vrai(!d.personnes.some(p => p.v.nom === "Foxtrot"), "nouvelle fiche refusée");
  egal(d.personnes.filter(p => p.v.nom === "Echo").map(p => p.v.spe), [undefined], "nom proche décoché : rien n'est fait");
  egal(r.archives, 0);
});

await test("CARTEC : nom double et lettres inversées, lien corrigé à la main", () => {
  const d = L.emptyData("t"); L.state.data = d;
  d.personnes.push({ id: "f", v: { nom: "Filho", prenom: "Charlene", escadron: "En attente" } },
    { id: "k", v: { nom: "Kilo", prenom: "Karine", escadron: "4ESC" } }, { id: "m", v: { nom: "Mike", prenom: "Marc", escadron: "4ESC" } });
  const g = fauxCartec();
  g.splice(g.length - 4, 0, Object.assign([], { 5: "PILOTE 1A", 11: "BCH", 12: "FHILO/GENEVAUX", 13: "Charlène" }),
    Object.assign([], { 5: "TIREUR 1A", 11: "1CL", 12: "Kilowatt", 13: "Karen" }));
  const U = L.lireCartec(g), corresp = { "00C99AA": "4ESC" };
  let plan = L.planCartec(U, d, corresp);
  const l = n => plan.lignes.find(x => x.e.nom === n);
  egal([l("FHILO/GENEVAUX").statut, l("FHILO/GENEVAUX").p?.id], ["probable", "f"], "nom double + lettres inversées, escadron « En attente »");
  egal(l("Kilowatt").statut, "nouveau", "trop différent : pas de rapprochement automatique");
  vrai(plan.absents.some(p => p.id === "k"), "Kilo serait archivée");
  plan = L.planCartec(U, d, corresp, { [l("Kilowatt").cle]: "k", [l("Echo").cle]: "nouveau" });
  egal([l("Kilowatt").statut, l("Kilowatt").p.id, l("Echo").statut], ["manuel", "k", "nouveau"], "liens choisis à la main");
  vrai(!plan.absents.some(p => p.id === "k"), "Kilo n'est plus archivée");
  L.appliquerCartec(d, U, plan, corresp);
  egal([d.personnes.find(p => p.id === "k").v.spe, d.personnes.find(p => p.id === "f").v.escadron], ["TIREUR 1A", "4ESC"]);
  const plan2 = L.planCartec(U, d, corresp);
  egal(["Kilowatt", "FHILO/GENEVAUX"].map(n => plan2.lignes.find(x => x.e.nom === n).statut), ["identique", "identique"], "liens mémorisés");
});

console.log(`\n${ok} réussi(s), ${ko} échoué(s)`);
process.exit(ko ? 1 : 0);
