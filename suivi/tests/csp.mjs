// Met à jour l'empreinte sha256 du script dans la politique de sécurité (Content-Security-Policy) de suivi/index.html.
// À lancer après chaque modification du script : sans cela, le navigateur refuse de l'exécuter (page vide).
// Lancement : node tests/csp.mjs            (node tests/csp.mjs --verifier : contrôle sans modifier)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const empreinte = html => "sha256-" + crypto.createHash("sha256").update(html.split("<script>")[1].split("</script>")[0], "utf8").digest("base64");
const RE = /script-src 'sha256-[^']*'/;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const fichier = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html");
  const html = fs.readFileSync(fichier, "utf8"), e = empreinte(html), cible = `script-src '${e}'`;
  if (!RE.test(html)) { console.log("Politique de sécurité introuvable dans le fichier."); process.exit(1); }
  if (html.match(RE)[0] === cible) console.log("Empreinte du script à jour :", e);
  else if (process.argv.includes("--verifier")) { console.log("Empreinte du script périmée : lancer node tests/csp.mjs"); process.exit(1); }
  else { fs.writeFileSync(fichier, html.replace(RE, cible)); console.log("Empreinte du script mise à jour :", e); }
}
