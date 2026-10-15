# Outils escadron

**Site en ligne : https://paulsenecal.github.io/outilsEscadron/**
(Suivi du personnel : https://paulsenecal.github.io/outilsEscadron/suivi/)

Applications web statiques, publiées via GitHub Pages. Aucune dépendance, aucun serveur,
aucune donnée transmise : tout s'exécute dans le navigateur.

| Dossier | Application | Usage |
|---|---|---|
| `suivi/` | Suivi du personnel | Dates (tirs, secourisme, NRBC, permis), échéances, REO — données dans un fichier chiffré, jamais dans le dépôt |
| `quizzer/` | Quizzer | Quiz en ligne (correction, score) et éditeur des questionnaires de formation |
| `ccpg/` | Console de piste | Notes CCPG, VMA, VO₂ max, allures d'entraînement |
| `jo/` | JO du 5ESC | Exemple : équipes, tirages au sort, résultats par épreuve, classement, écran d'affichage ; saisie à plusieurs (Firebase) |

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
├── .gitignore          Bloque les données réelles (xlsx, csv, fichiers de suivi .json)
├── suivi/
│   ├── index.html      Suivi du personnel (autonome, avec sa propre politique de sécurité)
│   ├── CLAUDE.md       Documentation technique de l'outil
│   └── tests/          Tests (données fictives uniquement) : node suivi/tests/run.mjs, ui.mjs, csp.mjs
├── quizzer/
│   ├── index.html      Accueil : choix entre quiz en ligne et éditeur
│   ├── quiz.html       Quiz en ligne, lit data/quiz.json
│   ├── editeur.html    Éditeur de questions (sauvegarde locale)
│   └── data/quiz.json  Jeu de questions publié, exporté depuis l'éditeur
├── ccpg/index.html
└── jo/
    ├── index.html      Table centrale : équipes, composition, résultats, bonus, classement, réglages
    ├── juge.html       Saisie depuis un téléphone, après validation par la table centrale
    ├── affichage.html  Écran pour le vidéoprojecteur (suit la table centrale du même ordinateur)
    ├── calcul.js       Règlement : barème, pénalités, classements, tirages (sans DOM)
    ├── saisie.js       Formulaire de saisie d'une épreuve, commun à index.html et juge.html
    ├── en-ligne.js     Saisie à plusieurs (même base Firebase que le Quizzer)
    └── tests/calcul.mjs  node jo/tests/calcul.mjs
```

### JO : saisie à plusieurs

Les règles de la base Firebase sont dans `quizzer/regles-firebase.json` (nœuds `salles` et `jo`).
Après toute modification, les recopier dans la console Firebase → Realtime Database → Règles → Publier.
Seuls les noms des équipes, les résultats et le nom des juges passent par Firebase ; les noms
des cadets restent dans le navigateur de la table centrale.

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

**Bouton de retour.** Une ligne avant `</body>` dans chaque application (sauf `suivi/`,
dont la politique de sécurité n'accepte que son propre script : il a un lien « ← Escadron » en dur) :

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
`quizzer:`, `ccpg:`, `suivi:`, `hub:`.

## Suivi du personnel : avant chaque push

```bash
node suivi/tests/csp.mjs     # empreinte du script (sinon page blanche en ligne)
node suivi/tests/run.mjs     # logique
node suivi/tests/ui.mjs      # interface (Chrome, ~75 s)
```
