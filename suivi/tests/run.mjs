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
  seuilAlerte, isoLocal, today, lireCartec, planCartec, appliquerCartec, escadronPropose, reoBlocs, lireUIR, planUIR, appliquerUIR,
  duree, aEcheance, clesNeuves, creerSecours, toB64, creerAcces, decouper, assembler, empreinte, dernierTirDe, majDernierTir, statFGE, addMonths, lireNouveaux, creerNouveaux, releve, avecReleve, cumulReleve, tauxReleve, RELEVES_MAX, reparerTel, telsReparables, parseCell, lireUIR })`, ctx);

let ok = 0, ko = 0;
/* Fichier au format 1 (ancien) : données chiffrées directement par la clé dérivée du mot de passe */
async function fichierV1(data, pw, iter) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await L.deriveKey(pw, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return JSON.stringify({ format: "suivi-personnel", version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: iter, salt: L.toB64(salt) }, iv: L.toB64(iv), data: L.toB64(ct) });
}
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
  Object.assign(L.state, await L.clesNeuves("mot-de-passe-test", 1000));
  const fichier = await L.encryptData("2026-01-01T00:00:00.000Z");
  const r = await L.decryptFile(fichier, "mot-de-passe-test");
  egal(JSON.parse(fichier).version, 2, "format 2 (clé de données enveloppée)");
  egal(r.via, "principal");
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

await test("Créer plusieurs fiches : lecture d'une liste de formation", () => {
  const d = L.emptyData("x");
  d.personnes.push({ id: "e1", v: { nom: "MARTIN", prenom: "Paul", matricule: "11 111 11 111" } }, { id: "e2", v: { nom: "Durand", prenom: "Léa" } });
  d.archives.push({ id: "a1", v: { nom: "PETIT", prenom: "Zoé" }, archive: { date: "2026-01-01", motif: "x" } });
  const texte = ` SDT EXEMPLE Gilles (NID : 99 550 40 315) ;
-          1CL DE LA TOUR Anne-Marie (NID : 99 880 50 332) ;
-          TESTEUR Jules (NID : 99 550 40 014) ;
-          SDT AUTRE Paul (NID : 11 111 11 111) ;
-          durand léa ;
-          PETIT Zoé ;
-          SDT EXEMPLE Gilles ;
-          FICTIF Romain (NID : 99 540 30 029). Parti à l’issue mais a validé le PSC.
-          SEUL ;`;
  const r = L.lireNouveaux(texte, d);
  egal(r.map(l => [l.v.grade, l.v.nom, l.v.prenom, l.v.matricule]), [
    ["2CL", "EXEMPLE", "Gilles", "99 550 40 315"], ["1CL", "DE LA TOUR", "Anne-Marie", "99 880 50 332"], [undefined, "TESTEUR", "Jules", "99 550 40 014"],
    ["2CL", "AUTRE", "Paul", "11 111 11 111"], [undefined, "DURAND", "léa", undefined], [undefined, "PETIT", "Zoé", undefined],
    ["2CL", "EXEMPLE", "Gilles", undefined], [undefined, "FICTIF", "Romain", "99 540 30 029"], [undefined, "SEUL", undefined, undefined]]);
  egal(r.map(l => l.etat), ["nouveau", "nouveau", "nouveau", "existe", "existe", "archive", "doublon", "nouveau", "incomplet"]);
  egal([r[3].id, r[4].id, r[5].id], ["e1", "e2", "a1"], "fiche existante (NID, puis nom) et archive retrouvées");
  egal(r[7].remarque, "Parti à l’issue mais a validé le PSC.");
  const n = d.personnes.length, crees = L.creerNouveaux(d, r.filter(l => l.etat === "nouveau"), { escadron: "5ESC", peloton: "" }, ["n1"]);
  egal(d.personnes.length, n + 4);
  egal(crees[0].id, "n1", "identifiant donné");
  egal(fiche(crees[3].v), fiche({ nom: "FICTIF", prenom: "Romain", matricule: "99 540 30 029", escadron: "5ESC", commentaire: "Parti à l’issue mais a validé le PSC." }));
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

await test("Dernier tir : Bravo, Charlie et Delta le mettent à jour, jamais le ToC", () => {
  const C = L.defaultChamps(), ch = id => C.find(c => c.id === id);
  egal(["famas_b", "famas_c", "famas_d", "famas_danp", "hk_b", "hk_gpb", "hk_danp", "glock_c"].map(id => L.dernierTirDe(C, ch(id))?.id),
    ["famas_tir", "famas_tir", "famas_tir", "famas_tir", "hk_tir", "hk_tir", "hk_tir", "glock_tir"]);
  vrai(!L.dernierTirDe(C, ch("hk_toc")) && !L.dernierTirDe(C, ch("hk_tir")) && !L.dernierTirDe(C, ch("mag")), "ToC, dernier tir lui-même et autres armes : rien");
  // Un Delta ajouté à la main (tir NRBC) compte aussi
  const delta = { id: "famas_nrbc", label: "Tir NRBC", groupe: "Famas", type: "date", validite: 12 };
  egal(L.dernierTirDe([...C, delta], delta)?.id, "famas_tir");
  egal(L.majDernierTir({ hk_tir: "2025-01-01", hk_toc: "2026-09-01", hk_b: "2026-03-01", famas_c: "2026-02-01" }, C),
    { hk_tir: "2026-03-01", hk_toc: "2026-09-01", hk_b: "2026-03-01", famas_c: "2026-02-01", famas_tir: "2026-02-01" });
  egal(L.majDernierTir({ hk_tir: "2026-10-01", hk_b: "2026-03-01" }, C).hk_tir, "2026-10-01", "dernier tir plus récent conservé");
  // Séance
  const P = [{ v: { hk_tir: "2025-01-01" } }, { v: { hk_tir: "2026-12-01" } }];
  const s1 = L.seanceChangements(P, [ch("hk_b")], "2026-10-01", false, C);
  egal(s1.map(c => [c.f.id, c.apres, !!c.auto]), [["hk_b", "2026-10-01", false], ["hk_tir", "2026-10-01", true], ["hk_b", "2026-10-01", false]]);
  egal(L.seanceChangements(P, [ch("hk_toc")], "2026-10-01", false, C).map(c => c.f.id), ["hk_toc", "hk_toc"], "ToC : dernier tir inchangé");
  egal(L.seanceChangements(P, [ch("hk_b"), ch("hk_c")], "2026-10-01", false, C).filter(c => c.auto).length, 1, "un seul dernier tir par personne");
});

await test("FGE : 1CL et CHA avec un an de service", () => {
  const ilYa = mois => L.isoLocal(L.addMonths(L.isoLocal(L.today()), -mois));
  const P = [["1CL", ilYa(13)], ["CHA", ilYa(12)], ["1CL", ilYa(6)], ["cha", ""], ["BRI", ilYa(30)], ["2CL", ilYa(30)]]
    .map(([grade, entree], i) => ({ id: "p" + i, v: { grade, ...(entree ? { entree } : {}) } }));
  const r = L.statFGE(P);
  egal([r.eligibles.map(x => x.p.id), r.bientot.map(x => x.p.id), r.sansDate.map(x => x.p.id)], [["p0", "p1"], ["p2"], ["p3"]]);
  egal(L.isoLocal(r.bientot[0].le), ilYa(-6), "date d'éligibilité = entrée + 12 mois");
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
  B.personnes = B.personnes.filter(p => p.id !== id); C.personnes.find(p => p.id === id).v.gant = "99";
  let f = L.fusionner(A, B, C);
  egal(f.conflits.length, 1, "supprimée par l'autre, modifiée par moi");
  vrai(f.data.personnes.some(p => p.id === id), "gardée par défaut");
  f.conflits[0].choisirAutre(f.data); vrai(!f.data.personnes.some(p => p.id === id), "supprimée au choix");
  B = copie(A); C = copie(A);
  C.personnes = C.personnes.filter(p => p.id !== id); B.personnes.find(p => p.id === id).v.gant = "99";
  f = L.fusionner(A, B, C);
  egal(f.conflits.length, 1, "supprimée par moi, modifiée par l'autre");
  vrai(!f.data.personnes.some(p => p.id === id), "supprimée par défaut (mon choix)");
  f.conflits[0].choisirAutre(f.data); egal(f.data.personnes.find(p => p.id === id).v.gant, "99", "sa version restaurée");
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
  const d = demo();
  const r = await L.decryptFile(await fichierV1(d, "ancien-fichier-310k", 310000), "ancien-fichier-310k");
  egal(r.iter, 310000, "itérations lues dans le fichier");
  vrai(r.ancien && r.data.personnes.length === d.personnes.length, "ancien format (1) relu");
});

await test("Mot de passe de secours", async () => {
  const d = demo();
  Object.assign(L.state, await L.clesNeuves("mot-de-passe-habituel", 1000));
  d.meta.secours = await L.creerSecours("mot-de-passe-de-secours", "Testeur");
  const fichier = await L.encryptData();
  const r = await L.decryptFile(fichier, "mot-de-passe-de-secours");
  vrai(r.via === "secours" && !r.kek && r.data.personnes.length === d.personnes.length, "ouvert avec le secours, sans clé habituelle");
  egal((await L.decryptFile(fichier, "mot-de-passe-habituel")).via, "principal");
  let refuse = false; try { await L.decryptFile(fichier, "mot-de-passe-de-secours", { secours: false }); } catch { refuse = true; }
  vrai(refuse, "secours refusé quand il n'est pas permis (session verrouillée)");
  refuse = false; try { await L.decryptFile(fichier, "faux-mot-de-passe"); } catch { refuse = true; }
  vrai(refuse, "mauvais mot de passe refusé");
  // Nouveau mot de passe habituel : nouvelle clé de données, le secours suit, l'ancien mot de passe ne lit plus
  Object.assign(L.state, await L.clesNeuves("nouveau-mot-de-passe", 1000));
  const apres = await L.encryptData();
  vrai(JSON.parse(apres).cleId !== JSON.parse(fichier).cleId, "nouvelle clé de données");
  egal((await L.decryptFile(apres, "mot-de-passe-de-secours")).via, "secours");
  refuse = false; try { await L.decryptFile(apres, "mot-de-passe-habituel"); } catch { refuse = true; }
  vrai(refuse, "l'ancien mot de passe ne lit pas la nouvelle version");
  // Clé publique du secours falsifiée dans l'en-tête : ignorée, recalculée depuis les données chiffrées
  vrai(!apres.includes(d.meta.secours.pub), "clé publique absente de l'en-tête (seulement dans les données chiffrées)");
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
  L({ B: "00C99AA : 1ER REGIMENT DE TEST - ESCADRON DE TEST 4" });
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
  d.personnes.push({ id: "f", v: { nom: "Lima", prenom: "Lena", escadron: "En attente" } },
    { id: "k", v: { nom: "Kilo", prenom: "Karine", escadron: "4ESC" } }, { id: "m", v: { nom: "Mike", prenom: "Marc", escadron: "4ESC" } });
  const g = fauxCartec();
  g.splice(g.length - 4, 0, Object.assign([], { 5: "PILOTE 1A", 11: "BCH", 12: "LMIA/ROMEO", 13: "Léna" }),
    Object.assign([], { 5: "TIREUR 1A", 11: "1CL", 12: "Kilowatt", 13: "Karen" }));
  const U = L.lireCartec(g), corresp = { "00C99AA": "4ESC" };
  let plan = L.planCartec(U, d, corresp);
  const l = n => plan.lignes.find(x => x.e.nom === n);
  egal([l("LMIA/ROMEO").statut, l("LMIA/ROMEO").p?.id], ["probable", "f"], "nom double + lettres inversées, escadron « En attente »");
  egal(l("Kilowatt").statut, "nouveau", "trop différent : pas de rapprochement automatique");
  vrai(plan.absents.some(p => p.id === "k"), "Kilo serait archivée");
  plan = L.planCartec(U, d, corresp, { [l("Kilowatt").cle]: "k", [l("Echo").cle]: "nouveau" });
  egal([l("Kilowatt").statut, l("Kilowatt").p.id, l("Echo").statut], ["manuel", "k", "nouveau"], "liens choisis à la main");
  vrai(!plan.absents.some(p => p.id === "k"), "Kilo n'est plus archivée");
  L.appliquerCartec(d, U, plan, corresp);
  egal([d.personnes.find(p => p.id === "k").v.spe, d.personnes.find(p => p.id === "f").v.escadron], ["TIREUR 1A", "4ESC"]);
  const plan2 = L.planCartec(U, d, corresp);
  egal(["Kilowatt", "LMIA/ROMEO"].map(n => plan2.lignes.find(x => x.e.nom === n).statut), ["identique", "identique"], "liens mémorisés");
});

await test("Schéma 4 : nouveaux champs ajoutés aux anciens fichiers, fin de contrat surveillée", () => {
  const d = L.emptyData("v3");
  const ajoutes = ["naissance", "lieu_naissance", "matricule", "sap", "cyber", "cpr", "sitfam", "conj_nom", "enf5_naissance", "pap_lien", "cim_num", "vmp"];
  d.champs = d.champs.filter(c => !ajoutes.includes(c.id)).map(c => { const x = { ...c }; delete x.limite; delete x.sensible; delete x.calcul; delete x.alerte; return x; });
  d.meta.schema = 3;
  const n = L.normalize(d), ids = n.champs.map(c => c.id);
  vrai(ajoutes.every(id => ids.includes(id)), "champs ajoutés");
  egal(ids.indexOf("sap"), ids.indexOf("patrouille") + 4, "à leur place (Identité)");
  const fc = n.champs.find(c => c.id === "fincontrat");
  egal([fc.limite, fc.alerte, n.champs.find(c => c.id === "nsecu").sensible], [true, 90, true]);
  egal(L.normalize(n).champs.length, n.champs.length, "idempotent");
});

await test("Schéma 5 : tailles casque et frag ajoutées dans Habillement", () => {
  const d = L.emptyData("v4");
  d.champs = d.champs.filter(c => !["casque", "frag"].includes(c.id)); d.meta.schema = 4;
  const n = L.normalize(d), ids = n.champs.map(c => c.id);
  egal(ids.slice(ids.indexOf("chaussure"), ids.indexOf("chaussure") + 3), ["chaussure", "casque", "frag"], "après le dernier champ Habillement");
  vrai(n.champs.find(c => c.id === "frag").stats, "statistiques des tailles");
  egal(L.normalize(n).champs.length, n.champs.length, "idempotent");
});

await test("Schéma 6 : Delta frag et Delta ANP au Famas et au HK, GPB du HK renommé Delta frag", () => {
  const d = L.emptyData("v5");
  d.champs = d.champs.filter(c => !["famas_d", "famas_danp", "hk_danp"].includes(c.id)); d.champs.find(c => c.id === "hk_gpb").label = "GPB";
  d.meta.schema = 5; d.personnes = [{ id: "a", v: { hk_gpb: "2026-05-23" } }];
  const n = L.normalize(d), ids = n.champs.map(c => c.id);
  egal(ids.slice(ids.indexOf("famas_c"), ids.indexOf("famas_c") + 3), ["famas_c", "famas_d", "famas_danp"], "après le dernier champ Famas");
  egal(ids.slice(ids.indexOf("hk_gpb"), ids.indexOf("hk_gpb") + 2), ["hk_gpb", "hk_danp"], "après le dernier champ HK");
  egal([n.champs.find(c => c.id === "hk_gpb").label, n.personnes[0].v.hk_gpb], ["Delta frag", "2026-05-23"], "dates gardées");
  egal(L.normalize(n).champs.length, n.champs.length, "idempotent");
  const e = L.emptyData("v5"); e.champs = e.champs.filter(c => c.id !== "famas_danp");
  e.champs.push({ id: "perso", label: "Delta ANP", groupe: "Famas", type: "date" }); e.meta.schema = 5;
  vrai(!L.normalize(e).champs.some(c => c.id === "famas_danp"), "Delta ANP déjà ajouté à la main : rien en plus");
});

await test("Accès chef de peloton : il ne déchiffre que son peloton, l'administrateur relit tout", async () => {
  const d = demo(), tri = P => P.map(p => p.id).sort();
  Object.assign(L.state, await L.clesNeuves("mot-de-passe-habituel", 1000), { role: null, modele: null });
  const [e1, p1] = [d.personnes[0].v.escadron, d.personnes[0].v.peloton];
  const autre = d.personnes.find(p => p.v.peloton !== p1 || p.v.escadron !== e1);
  await L.creerAcces(d.meta, e1, p1, "chef-du-peloton-1");
  await L.creerAcces(d.meta, autre.v.escadron, autre.v.peloton, "chef-de-l-autre-peloton");
  const a1 = d.meta.acces[0], miens = d.personnes.filter(p => p.v.escadron === e1 && p.v.peloton === p1);
  d.listes.push({ id: "l1", nom: "Liste admin", lignes: [], champs: [], etat: {} });
  const fichier = await L.encryptData("2026-01-01T00:00:00.000Z"), o = JSON.parse(fichier);
  egal(o.version, 3, "format 3 avec des parties"); egal(Object.keys(o.parts).length, 2);
  vrai(!fichier.includes(a1.cle), "clé du peloton absente en clair");
  // Administrateur : tout est rassemblé
  const adm = await L.decryptFile(fichier, "mot-de-passe-habituel");
  egal(tri(adm.data.personnes), tri(d.personnes), "toutes les personnes"); vrai(!adm.role, "pas de rôle");
  // Chef : son peloton seulement, sans clés ni réglages sensibles
  const r = await L.decryptFile(fichier, "chef-du-peloton-1");
  egal([r.via, r.role.peloton, r.role.escadron], ["chef", p1, e1]);
  egal(tri(r.data.personnes), tri(miens), "seulement son peloton");
  vrai(!r.data.meta.acces && !r.data.meta.accesKdf && !r.data.meta.secours, "meta sans clés");
  vrai(!r.data.listes.some(l => l.id === "l1"), "listes de l'administrateur invisibles");
  vrai(r.data.champs.length === d.champs.length, "réglages des champs copiés");
  let refuse = false; try { await L.decryptFile(fichier, "chef-du-peloton-1", { chef: false }); } catch { refuse = true; }
  vrai(refuse, "chef refusé quand l'accès chef n'est pas permis");
  // Le chef modifie une fiche et enregistre : seule sa partie change
  const sauve = { ...L.state };
  Object.assign(L.state, { data: L.normalize(r.data), key: r.key, kek: null, role: r.role, modele: fichier });
  L.state.data.personnes[0].v.gant = "99";
  const parChef = await L.encryptData("2026-02-01T00:00:00.000Z"), o2 = JSON.parse(parChef);
  egal([o2.iv, o2.data, o2.parts[d.meta.acces[1].id]], [o.iv, o.data, o.parts[d.meta.acces[1].id]], "reste du fichier recopié");
  vrai(L.empreinte(o2) !== L.empreinte(o), "empreinte changée");
  Object.assign(L.state, sauve);
  const adm2 = await L.decryptFile(parChef, "mot-de-passe-habituel");
  egal(adm2.data.personnes.find(p => p.id === r.data.personnes[0].id).v.gant, "99", "modification du chef lue par l'administrateur");
  vrai(adm2.data.listes.some(l => l.id === "l1"), "liste de l'administrateur conservée");
  // Changement du mot de passe du peloton : nouvelle clé, l'ancien ne sert plus
  L.state.data = L.normalize(adm2.data);
  await L.creerAcces(L.state.data.meta, e1, p1, "nouveau-mot-de-passe-p1");
  const apres = await L.encryptData();
  refuse = false; try { await L.decryptFile(apres, "chef-du-peloton-1"); } catch { refuse = true; }
  vrai(refuse, "ancien mot de passe du chef refusé");
  egal(tri((await L.decryptFile(apres, "nouveau-mot-de-passe-p1")).data.personnes), tri(miens));
  egal(L.state.data.meta.acces.length, 2, "un seul accès par peloton");
});

await test("Accès capitaine : tout le fichier en lecture, suit les changements de clé, session verrouillée", async () => {
  const d = demo(), tri = P => P.map(p => p.id).sort();
  Object.assign(L.state, await L.clesNeuves("mot-de-passe-habituel", 1000), { role: null, modele: null });
  await L.creerAcces(d.meta, d.personnes[0].v.escadron, d.personnes[0].v.peloton, "chef-du-peloton-1");
  d.meta.capitaine = await L.creerSecours("mot-de-passe-capitaine");
  d.listes.push({ id: "l1", nom: "Liste admin", lignes: [], champs: [], etat: {} });
  L.state.data = d;
  const fichier = await L.encryptData("2026-01-01T00:00:00.000Z");
  const r = await L.decryptFile(fichier, "mot-de-passe-capitaine");
  egal([r.via, r.role.capitaine, r.kek], ["capitaine", true, null]);
  egal(tri(r.data.personnes), tri(d.personnes), "tous les pelotons");
  vrai(r.data.listes.some(l => l.id === "l1"), "listes de l'administrateur visibles");
  const chef = await L.decryptFile(fichier, "chef-du-peloton-1");
  vrai(!chef.data.meta.capitaine, "enveloppe du capitaine absente de la partie d'un chef");
  // Nouveau mot de passe habituel = nouvelle clé : le capitaine ouvre toujours
  Object.assign(L.state, await L.clesNeuves("autre-mot-de-passe", 1000));
  const apres = await L.encryptData();
  egal(tri((await L.decryptFile(apres, "mot-de-passe-capitaine")).data.personnes), tri(d.personnes), "après changement de clé");
  // Session du capitaine verrouillée : bloc sans enveloppe principale, rouvert par son mot de passe
  const sauve = { ...L.state };
  Object.assign(L.state, { data: L.normalize(r.data), key: r.key, cleId: r.cleId, kek: null, role: r.role, modele: null });
  const session = await L.encryptData(), os = JSON.parse(session);
  vrai(!os.principal, "pas d'enveloppe principale");
  const rs = await L.decryptFile(session, "mot-de-passe-capitaine", { secours: false });
  egal([rs.role.id, tri(rs.data.personnes)], ["capitaine", tri(d.personnes)]);
  let refuse = false; try { await L.decryptFile(session, "mot-de-passe-habituel"); } catch { refuse = true; }
  vrai(refuse, "le mot de passe habituel n'ouvre pas la session du capitaine");
  Object.assign(L.state, sauve);
  // Accès retiré : son mot de passe n'ouvre plus les versions suivantes
  delete L.state.data.meta.capitaine;
  refuse = false; try { await L.decryptFile(await L.encryptData(), "mot-de-passe-capitaine"); } catch { refuse = true; }
  vrai(refuse, "accès retiré");
});

await test("Accès chef de peloton : découpage et rassemblement (journal, listes)", () => {
  const d = L.normalize(L.donneesDemo()), p = d.personnes[0];
  d.meta.acces = [{ id: "A", escadron: p.v.escadron, peloton: p.v.peloton }];
  const autre = d.personnes.find(x => x.v.peloton !== p.v.peloton);
  d.journal = [{ t: "2026-01-01", qui: "x", quoi: "fiche", p: [p.id] }, { t: "2026-01-02", qui: "x", quoi: "deux", p: [p.id, autre.id] },
    { t: "2026-01-03", qui: "x", quoi: "réglages" }, { t: "2026-01-04", qui: "y", quoi: "liste", part: "A" }];
  d.listes = [{ id: "l", part: "A", nom: "x", lignes: [] }];
  const { reste, parts } = L.decouper(d);
  egal(parts.A.journal.map(j => j.quoi), ["fiche", "liste"], "journal de ses fiches");
  egal(reste.journal.map(j => j.quoi), ["deux", "réglages"]);
  vrai(!parts.A.listes[0].part && !reste.listes.length, "liste du peloton, sans étiquette");
  vrai(!reste.personnes.some(x => x.id === p.id), "fiche retirée du reste");
  const R = L.assembler(reste, parts);
  egal(R.personnes.length, d.personnes.length); egal(R.journal.map(j => j.quoi), d.journal.map(j => j.quoi));
  egal(R.listes[0].part, "A");
});

await test("Date limite (VMP, fin de contrat), âge et ancienneté", () => {
  const d = demo(), vmp = d.champs.find(c => c.id === "vmp");
  const dans = j => { const t = L.today(); t.setDate(t.getDate() + j); return L.isoLocal(t); };
  vrai(L.aEcheance(vmp) && !vmp.validite, "VMP : date limite");
  egal([dans(-1), dans(30), dans(200), ""].map(x => L.statusOf({ v: { vmp: x } }, vmp).k), ["bad", "warn", "ok", "none"]);
  vrai(L.echeances([{ id: "z", v: { vmp: dans(10) } }], [vmp], null, false)[0].items[0].days === 10, "dans « À faire »");
  const t = L.today(), il_y_a = (a, m) => L.isoLocal(new Date(t.getFullYear() - a, t.getMonth() - m, t.getDate()));
  egal([L.duree(il_y_a(34, 0)), L.duree(il_y_a(3, 2)), L.duree(il_y_a(0, 5)), L.duree("")], ["34 ans", "3 ans 2 mois", "5 mois", ""]);
});

await test("Ancienneté de grade calculée depuis la date de grade", () => {
  const d = L.emptyData("x"); d.champs.find(c => c.id === "anciennete").calculDe = undefined;
  d.champs.find(c => c.id === "anciennete").label = "Ancienneté grade";
  const n = L.normalize(d), f = n.champs.find(c => c.id === "anciennete");
  egal([f.calculDe, f.label], ["dategrade", "Ancienneté de grade"], "ancien fichier mis à jour");
  const t = L.today(), iso = L.isoLocal(new Date(t.getFullYear() - 3, t.getMonth(), t.getDate()));
  n.personnes = [{ id: "a", v: { nom: "A", dategrade: iso, anciennete: "ancienne saisie" } }, { id: "b", v: { nom: "B", anciennete: "2 ans" } }];
  const csv = L.csvPersonnel(n);
  vrai(csv.includes(";3 ans") && csv.includes(";2 ans") && !csv.includes("ancienne saisie"), "calculée, sinon valeur saisie");
});

await test("Données sensibles exclues des exports Personnel", async () => {
  const d = demo(); d.personnes[0].v.nsecu = "1 99 99 99 999 999 99"; d.personnes[0].v.conj_nom = "Conjointfictif";
  const csv = L.csvPersonnel(d);
  vrai(!csv.includes("999 999") && !csv.includes("Conjointfictif") && !csv.includes("Sécurité sociale"), "CSV sans données sensibles");
  const grid = await L.readXlsx(await buffer(L.xlsxPersonnel(d)));
  vrai(!JSON.stringify(grid).includes("Conjointfictif"), "Excel sans données sensibles");
});

/* Faux fichier UIR (noms fictifs) : en-tête sur 3 lignes avec cellules fusionnées, comme le vrai */
function fauxUIR() {
  const g = [], L_ = c => { const r = []; Object.entries(c).forEach(([k, v]) => { r[k.charCodeAt(0) - 65] = v; }); g.push(r); };
  L_({ A: "NOM", B: "PRENOM", C: "ENTREE EN SERVICE ", D: "SANTE", F: "FIN DE CONTRAT RDC", G: "GRADE", I: "SAP", J: "N° PORTABLE", K: "CONJOINT",
    N: "ENFANTS", P: "PERSONNE A PREVENIR EN CAS D'ACCIDENT", S: "N° SECURITE SOCIALE", T: "AFFECTATION" });
  L_({ D: "VMP", E: "PSC", G: "GRADE", H: "DEPUIS LE", K: "NOM", L: "TELEPHONE", N: 1 });
  L_({ M: "PORTABLE", N: "PRENOM", O: "DATE DE NAISSANCE", P: "LIEN", Q: "NOM" });
  L_({ A: "ALPHA", B: "Albert", C: 43770, D: "30/04/2027", F: 47000, G: "cne", H: "01/08/2022", I: 90000001, J: "06 11 22 33 44", K: "Conj", M: "06 99 88 77 66",
    N: "Léo", O: "24/06/2015", P: "EPOUSE", Q: "ALPHA Conj", R: "06 99 88 77 66", S: "1 99 99", T: "ECL" });
  L_({ A: "Bravo", B: "Bernard", D: "pas une date", J: "0655555555", I: 90000002 });
  L_({ A: "Ailleurs", B: "Paul", D: "01/01/2027" });
  L_({ A: "CHARLY", B: "Claire", J: "0612345678" });
  return g;
}
await test("Fichier UIR : lecture de l'en-tête sur 3 lignes", () => {
  const d = L.emptyData("u"), lu = L.lireUIR(fauxUIR(), d.champs);
  egal(lu.colonnes.map(c => c.f.id), ["entree", "vmp", "fincontrat", "grade", "dategrade", "sap", "tel", "conj_nom", "conj_tel", "conj_tel",
    "enf1_prenom", "enf1_naissance", "pap_lien", "pap_nom", "pap_tel", "nsecu"], "colonnes reprises (PSC, affectation ignorées)");
  const a = lu.lignes[0].valeurs;
  egal([a.entree, a.vmp, a.grade, a.dategrade, a.sap, a.conj_tel, a.enf1_naissance, a.pap_tel], ["2019-11-01", "2027-04-30", "CNE", "2022-08-01", "90000001", "06 99 88 77 66", "2015-06-24", "06 99 88 77 66"]);
  egal(lu.lignes[1].illisibles.length, 1, "date illisible signalée");
});
await test("Fichier UIR : rapprochement, choix des valeurs, sans création", () => {
  const d = L.emptyData("u"); L.state.data = d;
  d.personnes.push({ id: "a", v: { nom: "Alpha", prenom: "Albert", escadron: "5ESC", tel: "06.11.22.33.44", grade: "LTN" } },
    { id: "b", v: { nom: "Bravo", prenom: "Bernard", escadron: "7ESC", sap: "90000002" } },
    { id: "c", v: { nom: "Charlie", prenom: "Claire", escadron: "5ESC", tel: "0600000000" } },
    { id: "z", v: { nom: "Zoulou", prenom: "Zoé", escadron: "5ESC" } },
    { id: "p", v: { nom: "Ailleurs", prenom: "Paul", escadron: "9ESC" } });
  const lu = L.lireUIR(fauxUIR(), d.champs), plan = L.planUIR(lu, d, ["5ESC", "7ESC"]);
  const l = n => plan.lignes.find(x => x.u.nom === n);
  egal(["ALPHA", "Bravo", "Ailleurs", "CHARLY"].map(n => l(n).statut), ["ok", "ok", "hors", "probable"], "SAP, nom, autre escadron, nom proche");
  egal(plan.sansDonnees.map(p => p.id), ["z"]);
  egal(l("ALPHA").differences.map(x => x.f.id), ["grade"], "téléphone identique aux séparateurs près : pas une différence");
  const r = L.appliquerUIR(d, plan, new Set([l("CHARLY").cle]));
  const a = d.personnes.find(p => p.id === "a").v;
  egal([a.grade, a.vmp, a.nsecu, a.tel], ["LTN", "2027-04-30", "1 99 99", "06.11.22.33.44"], "par défaut le suivi a raison (grade gardé), cases vides remplies");
  const d2 = { ...d, personnes: [{ id: "a", v: { nom: "Alpha", prenom: "Albert", escadron: "5ESC", grade: "LTN" } }], meta: { ...d.meta } };
  const plan_ = L.planUIR(lu, d2, ["5ESC"]), cleA = plan_.lignes.find(x => x.u.nom === "ALPHA").cle;
  L.appliquerUIR(d2, plan_, new Set(), new Set([cleA + "|grade"]));
  egal(d2.personnes[0].v.grade, "CNE", "valeur UIR prise quand on la choisit");
  egal(d.personnes.find(p => p.id === "c").v.tel, "0600000000", "ligne décochée");
  egal(d.personnes.length, 5, "aucune création");
  vrai(!r.details.some(x => x.texte.includes("1 99 99")) && r.details.some(x => x.texte.includes("N° Sécurité sociale mis à jour")), "journal sans valeur sensible");
  const plan2 = L.planUIR(lu, d, ["5ESC", "7ESC"], { [l("CHARLY").cle]: "c" });
  egal(plan2.lignes.find(x => x.u.nom === "CHARLY").statut, "manuel");
  L.appliquerUIR(d, plan2);
  egal(L.planUIR(lu, d, ["5ESC", "7ESC"]).lignes.find(x => x.u.nom === "CHARLY").statut, "ok", "lien mémorisé");
});
await test("CARTEC : rapprochement par SAP", () => {
  const d = L.emptyData("t"); L.state.data = d;
  d.personnes.push({ id: "s", v: { nom: "Nom-Change", prenom: "Autre", escadron: "4ESC", sap: "777" } });
  const g = fauxCartec(); g[7][10] = 777;   // SAP du commandant d'unité (Alpha Albert)
  g[0][10] = "SAP";
  const U = L.lireCartec(g), plan = L.planCartec(U, d, { "00C99AA": "4ESC" });
  egal(plan.lignes.find(x => x.e.nom === "Alpha").p?.id, "s");
});

await test("Relevés mensuels : comptes, cumul, fusion, partie d'un chef", () => {
  const d = L.emptyData("t"); L.state.data = d;
  const il = j => { const t = L.today(); t.setDate(t.getDate() - j); return L.isoLocal(t); };
  d.personnes = [{ id: "a", v: { escadron: "5ESC", peloton: "P1", famas_tir: il(10), psc1: il(400) } },
    { id: "b", v: { escadron: "5ESC", peloton: "P1", famas_tir: il(350) } },
    { id: "c", v: { escadron: "5ESC", peloton: "P2" } }];
  const r = L.releve(d);
  egal(r.m, L.isoLocal(L.today()).slice(0, 7));
  egal(r.g["5ESC|P1"], { n: 2, f: { famas_tir: [1, 1, 0], psc1: [0, 0, 1] } }, "à jour / à prévoir / expiré, jamais fait non compté");
  egal(r.g["5ESC|P2"], { n: 1, f: {} }, "formation que personne n'a faite : absente");
  const c = L.cumulReleve(r, e => e === "5ESC");
  egal(c.n, 3); egal(L.tauxReleve(c, ["famas_tir", "psc1"]), 2 / 3);
  egal(L.tauxReleve(L.cumulReleve(r, (e, p) => p === "P2"), ["famas_tir"]), null, "aucun formé");
  // Date postérieure au relevé (relevé reconstitué) : l'échéance précédente tombe à cette date
  const avant = L.today(); avant.setDate(avant.getDate() - 30);
  egal(L.releve(d, avant).g["5ESC|P1"].f.famas_tir, [1, 1, 0], "tir fait après le relevé : à prévoir ; l’autre encore à jour il y a 30 j");
  // Un relevé par mois, le plus récent remplace celui du même mois, RELEVES_MAX au plus
  let Lr = [];
  for (let i = 0; i < L.RELEVES_MAX + 5; i++) Lr = L.avecReleve(Lr, { m: `${2000 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, "0")}`, g: {} });
  egal(Lr.length, L.RELEVES_MAX); egal(L.avecReleve(Lr, { m: Lr[3].m, g: { x: 1 } }).filter(x => x.m === Lr[3].m).length, 1);
  // Fusion : mois des deux côtés réunis
  const A = L.normalize(L.emptyData("t")), B = L.normalize(L.emptyData("t")), C = L.normalize(L.emptyData("t"));
  B.releves = [{ m: "2026-01", g: { b: 1 } }, { m: "2026-02", g: { b: 1 } }]; C.releves = [{ m: "2026-02", g: { c: 1 } }, { m: "2026-03", g: {} }];
  const f = L.fusionner(A, B, C);
  egal(f.data.releves.map(x => x.m), ["2026-01", "2026-02", "2026-03"]); egal(f.data.releves[1].g, { c: 1 }, "le mien pour le même mois");
  egal(f.conflits.length, 0);
  // Chef de peloton : seulement les groupes de son peloton
  d.releves = [r]; d.meta.acces = [{ id: "A", escadron: "5esc", peloton: "p1" }];
  const { reste, parts } = L.decouper(d);
  egal(Object.keys(parts.A.releves[0].g), ["5ESC|P1"]); egal(Object.keys(reste.releves[0].g).length, 2);
  egal(Object.keys(L.assembler(reste, parts).releves[0].g).length, 2, "rassemblé : relevé complet, sans doublon");
  egal(L.normalize(L.emptyData("x")).releves, []);
  egal(L.donneesDemo().releves.length, 12, "démo : douze mois reconstitués");
});

await test("Téléphones : 0 perdu par Excel, +33, numéros étrangers", () => {
  egal(["612345678", "6 12 34 56 78", "+33 (0)6 12 34 56 78", "0033 06 12 34 56 78", "33612345678", "145678901"].map(L.reparerTel),
    Array(5).fill("06 12 34 56 78").concat("01 45 67 89 01"));
  egal(["06.12.34.56.78", "+33612345678", "+44 20 7946 0958", "12345", "", "612 34"].map(L.reparerTel), ["06.12.34.56.78", "+33612345678", "+44 20 7946 0958", "12345", "", "612 34"], "valide, étranger ou irréparable : inchangé");
  const d = L.emptyData("t"); L.state.data = d;
  d.personnes = [{ id: "a", v: { nom: "A", tel: "612345678", pap_tel: "06 00 00 00 00" } }]; d.archives = [{ id: "b", v: { conj_tel: "+33 (0)7 11 11 11 11" }, archive: {} }];
  egal(L.telsReparables(d).map(x => [x.p.id, x.f.id, x.apres]), [["a", "tel", "06 12 34 56 78"], ["b", "conj_tel", "07 11 11 11 11"]]);
  vrai(L.controleQualite(d).some(x => x.type === "tel" && x.detail.includes("(réparable)")), "qualité : réparation proposée");
  const f = d.champs.find(c => c.id === "tel");
  egal([L.parseCell(f, 612345678).v, L.parseCell(f, "0612345678").v], ["06 12 34 56 78", "0612345678"], "import Excel : nombre réparé, numéro valide gardé tel quel");
});

console.log(`\n${ok} réussi(s), ${ko} échoué(s)`);
process.exit(ko ? 1 : 0);
