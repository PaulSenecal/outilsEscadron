# Outils escadron

Applications web statiques, publiées via GitHub Pages. Aucune dépendance, aucun serveur,
aucune donnée transmise : tout s'exécute dans le navigateur.

| Dossier | Application | Usage |
|---|---|---|
| `quizzer/` | Quiz Editor | Questionnaires de formation |
| `ccpg/` | Console de piste | Notes CCPG, VMA, VO₂ max, allures d'entraînement |

> Ce dépôt est public : tout ce qui y est poussé est lisible par n'importe qui, et le reste
> dans l'historique Git même après suppression du fichier. N'y déposer que du contenu
> librement diffusable.

## Structure

```
.
├── index.html          Accueil : liste des applications
├── 404.html            Page d'erreur (styles inline, servie à n'importe quelle profondeur)
├── .nojekyll           Désactive Jekyll : les fichiers sont publiés tels quels
├── assets/
│   ├── hub.css         Styles de l'accueil
│   └── retour.js       Bouton « ← Escadron » injecté dans chaque application
├── quizzer/index.html
└── ccpg/index.html
```

Une application = un dossier contenant `index.html`. L'URL est alors `.../quizzer/`,
sans extension. Pour en ajouter une : créer le dossier, y déposer le fichier, ajouter une
carte dans `index.html`.

## Règles à respecter

**Chemins relatifs uniquement.** Le site est publié sous `/<nom-du-depot>/`. Un chemin
absolu comme `/assets/hub.css` pointerait vers la racine du domaine et casserait.
Depuis une application : `../assets/…`, `../` pour revenir à l'accueil.

**Casse des noms de fichiers.** Sensible en ligne, pas forcément en local :
`Baremes.html` et `baremes.html` sont deux fichiers différents une fois publiés.

**Clés de stockage préfixées.** Toutes les applications partagent la même origine, donc
le même `localStorage`. Sans préfixe, deux applications qui utilisent `data` s'écrasent.
Convention : `esc.<application>.<clé>`, par exemple `esc.quizzer.data`.

> Quiz Editor utilise encore `quiz_data` et `quiz_categories`. Pour migrer sans perdre
> l'existant, exécuter une fois au démarrage :
>
> ```js
> ['data', 'categories'].forEach(function (k) {
>   var ancien = localStorage.getItem('quiz_' + k);
>   if (ancien !== null && localStorage.getItem('esc.quizzer.' + k) === null) {
>     localStorage.setItem('esc.quizzer.' + k, ancien);
>     localStorage.removeItem('quiz_' + k);
>   }
> });
> ```

**Bouton de retour.** Une ligne avant `</body>` dans chaque application :

```html
<script src="../assets/retour.js" defer></script>
```

## Travailler en local

Ouvrir un fichier par double-clic fonctionne tant que les applications restent
autonomes. Dès qu'un `fetch()` est utilisé, il faut un serveur :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Publier

Réglages du dépôt → **Pages** → source : *Deploy from a branch*, branche `main`,
dossier `/ (root)`. La mise en ligne prend une à deux minutes après un `push`.

```bash
git add -A
git commit -m "quizzer : nouvelle catégorie tir"
git push
```

Après un renommage du dépôt, mettre à jour la télécommande locale :

```bash
git remote set-url origin https://github.com/<compte>/<nouveau-nom>.git
```

L'ancienne adresse GitHub redirige, mais l'URL du site publié change immédiatement.

## Messages de commit

Préfixer par l'application concernée, ça suffit à s'y retrouver :
`quizzer:`, `ccpg:`, `hub:`.
