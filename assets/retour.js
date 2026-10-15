/* Bouton « retour au hub », injecté dans un Shadow DOM
   pour qu'aucun style de l'application hôte ne l'affecte, et réciproquement.
   Usage : <script src="../assets/retour.js" defer></script> juste avant </body>. */
(function () {
  if (window.__retourHub) return;
  window.__retourHub = true;

  var host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:max(12px,env(safe-area-inset-left));' +
    'bottom:max(12px,env(safe-area-inset-bottom));z-index:2147483000;';
  var sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML =
    '<style>' +
    'a{display:flex;align-items:center;gap:6px;padding:8px 13px;border-radius:999px;' +
    'background:#10233F;color:#fff;text-decoration:none;font:600 13px/1 system-ui,sans-serif;' +
    'letter-spacing:.06em;box-shadow:0 4px 14px rgba(0,0,0,.35);opacity:.82;' +
    'transition:opacity .15s,transform .15s}' +
    'a:hover,a:focus-visible{opacity:1;transform:translateY(-1px)}' +
    'a:focus-visible{outline:3px solid #C8102E;outline-offset:2px}' +
    '@media print{a{display:none}}' +
    '</style>' +
    '<a href="../" title="Revenir à la liste des outils">← Escadron</a>';
  document.body.appendChild(host);
})();
