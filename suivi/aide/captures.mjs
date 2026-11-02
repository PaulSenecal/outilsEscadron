// Captures d'écran des guides d'aide, prises sur les DONNÉES FICTIVES de la démo (jamais sur un vrai fichier).
// Lancement depuis la racine du dépôt : node suivi/aide/captures.mjs [nom…]   (sans nom : toutes les captures)
// Les encadrés rouges numérotés sont dessinés dans la page avant la capture : ils font partie de l'image.
// Les PDF des guides sont refaits à la fin (node suivi/aide/captures.mjs --pdf : seulement les PDF).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CAPTURES } from "./captures-liste.mjs";

const ici = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
].find(p => fs.existsSync(p));
if (!CHROME) { console.log("Chrome introuvable (définir CHROME=…)."); process.exit(1); }
const pause = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2), pdfSeul = args.includes("--pdf"), choix = args.filter(a => !a.startsWith("--"));

/* ---------- Chrome et son protocole de débogage ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "suivi-aide-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${tmp}`,
  "--remote-debugging-port=0", "about:blank"], { stdio: "ignore" });
const fin = code => { chrome.kill(); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome en train de fermer */ } process.exit(code); };
const portFichier = path.join(tmp, "DevToolsActivePort");
for (let t = 0; !fs.existsSync(portFichier) || !fs.readFileSync(portFichier, "utf8").includes("\n"); t += 100) {
  if (t > 20000) { console.log("Chrome n'a pas ouvert son port de débogage."); fin(1); }
  await pause(100);
}
const port = fs.readFileSync(portFichier, "utf8").split("\n")[0];
let cible;
while (!(cible = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"))) await pause(100);
const ws = new WebSocket(cible.webSocketDebuggerUrl), attente = new Map();
let n = 0;
await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new Error("débogueur injoignable")); });
ws.onmessage = e => { const m = JSON.parse(e.data); attente.get(m.id)?.(m); attente.delete(m.id); };
const cdp = (method, params = {}) => new Promise((ok, ko) => {
  const id = ++n; attente.set(id, m => m.error ? ko(new Error(`${method} : ${m.error.message}`)) : ok(m.result));
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluer = async expression => {
  const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

/* ---------- Dans la page : encadrés rouges numérotés ---------- */
const OUTILS = `
window.__aide = {
  efface() { document.querySelectorAll(".__aide").forEach(e => e.remove()); },
  // sel : sélecteur CSS (premier élément visible) ; n : numéro ; cote : où mettre la pastille, à l'extérieur du cadre
  // ("gauche" par défaut, "droite", "dessus", "dessous" ; "dedans" = coin haut droit, pour un grand cadre) ; marge en px
  box(sel, n, { marge = 4, cote = "gauche" } = {}) {
    const el = [...document.querySelectorAll(sel)].find(e => e.checkVisibility());
    if (!el) throw new Error("introuvable : " + sel);
    // partie visible : coupée par les zones qui défilent (fenêtres) et par l'écran
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (!/auto|scroll|hidden/.test(getComputedStyle(a).overflowY + getComputedStyle(a).overflowX)) continue;
      const q = a.getBoundingClientRect();
      left = Math.max(left, q.left); top = Math.max(top, q.top); right = Math.min(right, q.right); bottom = Math.min(bottom, q.bottom);
    }
    left = Math.max(left, 0); top = Math.max(top, 0); right = Math.min(right, innerWidth); bottom = Math.min(bottom, innerHeight);
    if (right - left < 4 || bottom - top < 4) throw new Error("hors de la partie visible : " + sel);
    const r = { left, top, right, bottom, width: right - left, height: bottom - top }, d = document.createElement("div");
    d.className = "__aide";
    Object.assign(d.style, { position: "fixed", left: r.left - marge + "px", top: r.top - marge + "px", width: r.width + 2 * marge + "px",
      height: r.height + 2 * marge + "px", border: "3px solid #E11D2E", borderRadius: "8px", zIndex: 2147483647, pointerEvents: "none",
      boxShadow: "0 0 0 2px rgba(255,255,255,.85)" });
    if (n != null) {
      const b = document.createElement("span");
      b.textContent = n;
      if (cote === "gauche" && r.left < 44) cote = "droite";
      if (cote === "droite" && r.right > innerWidth - 44) cote = "dessus";
      const pos = { gauche: { right: "calc(100% + 8px)", top: "-3px" }, droite: { left: "calc(100% + 8px)", top: "-3px" },
        dessus: { left: "-3px", bottom: "calc(100% + 6px)" }, dessous: { left: "-3px", top: "calc(100% + 6px)" },
        dedans: { right: "6px", top: "6px" } }[cote];
      Object.assign(b.style, { position: "absolute", ...pos, minWidth: "30px", height: "30px", padding: "0 7px", boxSizing: "border-box", borderRadius: "15px",
        background: "#E11D2E", color: "#fff", font: "700 17px/30px Barlow, sans-serif", textAlign: "center", boxShadow: "0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.35)" });
      d.appendChild(b);
    }
    // dans une fenêtre <dialog> ouverte (couche supérieure), l'encadré doit y être pour passer devant
    (el.closest("dialog[open]") || document.body).appendChild(d);
  }
};`;

async function preparer() {
  await cdp("Page.enable"); await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await cdp("Page.navigate", { url: "file://" + path.join(ici, "..", "index.html") });
  for (let t = 0; !(await evaluer(`document.readyState === "complete" && !!document.querySelector("#btn-demo")`)); t += 100) {
    if (t > 15000) throw new Error("page non chargée"); await pause(100);
  }
  await evaluer(OUTILS);
  await evaluer(`document.fonts.ready.then(() => true)`);
}

/* ---------- Captures ---------- */
const dossierImg = path.join(ici, "img");
fs.mkdirSync(dossierImg, { recursive: true });
const erreurs = [];
try {
  if (!pdfSeul) {
    await preparer();
    for (const c of CAPTURES) {
      if (choix.length && !choix.includes(c.nom)) continue;
      try {
      await evaluer(`__aide.efface()`);
      await evaluer(`(async () => { ${c.avant} })()`);
      await pause(c.attente ?? 250);
      for (const [sel, num, opts] of c.encadres || []) await evaluer(`__aide.box(${JSON.stringify(sel)}, ${JSON.stringify(num)}, ${JSON.stringify(opts || {})})`);
      await pause(80);
      const clip = c.zone ? await evaluer(`(() => { const r = document.querySelector(${JSON.stringify(c.zone)}).getBoundingClientRect(), m = 12;
        return { x: Math.max(0, r.left - m), y: Math.max(0, r.top - m), width: Math.min(innerWidth, r.width + 2 * m), height: Math.min(innerHeight, r.height + 2 * m), scale: 1 }; })()`) : null;
      const { data } = await cdp("Page.captureScreenshot", { format: "png", ...(clip ? { clip } : {}) });
      fs.writeFileSync(path.join(dossierImg, c.nom + ".png"), Buffer.from(data, "base64"));
      console.log("  ✓ " + c.nom);
      if (c.apres) await evaluer(`(async () => { ${c.apres} })()`);
      } catch (e) { erreurs.push(c.nom); console.log(`  ✗ ${c.nom} : ${e.message.split("\n")[0]}`); }
    }
  }
  // PDF de chaque guide (mise en page d'impression de la page HTML)
  if (!choix.length) {
    for (const g of ["secretariat", "commandement", "chef"]) {
      await cdp("Page.navigate", { url: "file://" + path.join(ici, g + ".html") });
      for (let t = 0; !(await evaluer(`document.readyState === "complete" && [...document.images].every(i => i.complete)`)); t += 100) await pause(100);
      await evaluer(`document.fonts.ready.then(() => true)`);
      const { data } = await cdp("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: "<span></span>", footerTemplate: `<div style="font:9px sans-serif;width:100%;text-align:center;color:#666">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
        marginTop: 0.5, marginBottom: 0.6, marginLeft: 0.5, marginRight: 0.5 });
      fs.mkdirSync(path.join(ici, "pdf"), { recursive: true });
      fs.writeFileSync(path.join(ici, "pdf", `guide-${g}.pdf`), Buffer.from(data, "base64"));
      console.log("  ✓ pdf/guide-" + g + ".pdf");
    }
  }
  ws.close(); fin(erreurs.length ? 1 : 0);
} catch (e) { console.log("Erreur : " + e.message); ws.close(); fin(1); }
