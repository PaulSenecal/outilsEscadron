# Suivi du personnel – application web chiffrée

## Contexte
Outil web pour une unité militaire (réserve) : suivi des dates du personnel
(tirs, secourisme, NRBC, permis…) et coordonnées (mail, téléphone).
Pas de données classifiées, mais des données personnelles : la sécurité prime.
Hébergé sur GitHub Pages (dépôt public `outilsEscadron`, dossier `suivi/`, carte « PERS » sur
l'accueil du hub `../index.html`). Le code est public, les données ne le sont jamais : le
`.gitignore` à la racine bloque *.xlsx, *.csv, suivi-*.json et suivi/**/*.json. Les fichiers
réels de test sont hors du dépôt (`~/Programmation/nePasMettreSurLeRepo/`).

## Principes non négociables
- Aucun serveur, aucun backend : un seul fichier HTML autonome (CSS + JS inline).
- Rien n'est stocké côté navigateur (pas de localStorage, sessionStorage ni IndexedDB).
- Les données vivent uniquement dans un fichier `.json` chiffré que l'utilisateur
  ouvre et enregistre lui-même (stocké ensuite sur Google Drive par l'utilisateur).
- Aucune requête réseau sortante (seulement Google Fonts pour la typo).
- Interface en français.

## Fichier actuel : suivi/index.html
Pas de `../assets/retour.js` (bloqué par la CSP) : lien « ← Escadron » (`.retour-hub`, href="../") en dur sur
l'écran de verrouillage et en bas de la barre latérale. Favicon en SVG data: (bouclier or sur marine).
Version du site : constante `VERSION` en tête du script (affichée en haut de l'appli
et sur l'écran de verrouillage). À CHAQUE ÉVOLUTION : incrémenter VERSION et ajouter une
entrée en tête de `NOUVEAUTES` (texte simple, pour les utilisateurs). Le bouton
« Nouveautés » (onglet fixé à droite) affiche cet historique dans un panneau latéral ;
un point doré signale une version non consultée (meta.versionVue, dans le fichier chiffré,
mis à jour sans marquer le fichier comme modifié).

### Chiffrement (Web Crypto API)
- PBKDF2-SHA256, 600 000 itérations (ITER), sel aléatoire de 16 octets (un par fichier). Un fichier plus
  ancien (310 000) est relu avec ses itérations ; preparerCles prépare une clé à ITER avec un nouveau sel,
  appliquée au prochain enregistrement.
- Deux clés en mémoire : state.lecture { salt, iter, key } = clé du fichier tel qu'il est sur le disque (pour
  relire / fusionner) ; state.key / salt / iter = clé du prochain enregistrement (diffèrent tant qu'une mise à
  niveau ou un nouveau mot de passe — state.mdpChange — n'est pas enregistré). markSaved aligne les deux.
- Si le fichier du disque a un autre sel (mot de passe changé ailleurs) : #dlg-cle demande son mot de passe,
  puis fusion ; sa clé est adoptée sauf si j'ai moi-même changé le mot de passe.
- Solidité : forceMotDePasse (estimation en bits, mots courants / suites / années pénalisés), jauge sous les
  champs « nouveau mot de passe » ; confirmation demandée si score < 2 (faible).
- Content-Security-Policy (balise meta) : default-src 'none', connect-src 'none', script autorisé par son
  empreinte sha256. APRÈS TOUTE MODIFICATION DU SCRIPT : `node tests/csp.mjs` (sinon page blanche ;
  tests/run.mjs le vérifie). Pas de gestionnaire d'événement inline (onclick=…) : bloqué par la CSP.
- AES-GCM 256, IV aléatoire de 12 octets à chaque enregistrement
- La clé dérivée reste en mémoire pendant la session ; « Verrouiller » vide l'état
- Mot de passe : 10 caractères minimum, aucune récupération possible

### Format du fichier
{ format: "suivi-personnel", version: 1,
  kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt (base64) },
  iv (base64), data (base64, JSON chiffré) }

### Modèle de données (une fois déchiffré, schéma 4)
- meta : { titre, alerteJours (défaut 30), verrouMinutes (défaut 15, 0 = jamais), enregAuto (défaut vrai), schema, reglesPermisV,
  cree, modifie, demo? (données fictives) }
- champs : [{ id, label, groupe, type, validite?, limite?, alerte?, sensible?, calcul?, options?, alias?, fixe? }]
  - limite : date = fin de validité (VMP, fin de contrat), surveillée sans durée. aEcheance(f) = date avec validite
    OU limite ; expiration(f, v). Toujours passer par aEcheance / expiration, jamais f.validite seul.
  - sensible : exclu des exports (champsExportables : xlsxPersonnel, csvPersonnel), exportable seulement via
    « Préparer une liste » ; le journal n'en recopie pas la valeur (UIR). Réglable (« Sensible » dans les réglages).
  - calcul : "age" | "anciennete" → durée affichée sous la date dans la fiche (duree, calculHtml)
  - alerte : seuil « à prévoir » en jours propre au champ (date avec validité) ; seuilAlerte(f) = alerte ?? meta.alerteJours
  - types : texte, long, liste (suggestions), tel, mail, date,
    permis (date ISO, "oui" = obtenu sans date, "?" = à vérifier), ouinon ("oui"/"non")
  - validite : en mois, seulement pour le type date (null = sans échéance).
    Tirs, PSC1, SC1, atmosphère viciée : 12 mois.
  - champs fixes (non supprimables) : nom, prenom, grade, escadron, peloton
  - groupes : Identité (+ naissance, lieu, matricule, SAP), Contact, Carrière (+ cyber, CPR), Famille (situation,
    nb enfants, conjoint, enfants 1-5), Personne à prévenir (+ lien), Administratif (carte d'identité militaire,
    diplôme civil), Santé (+ VMP), Permis,
    NRBC (ANP, T3P, atmosphère viciée), Habillement (béret, veste, pantalon, gants,
    chaussures), Famas, HK, Glock, Autres armes (MAG, Minimi, 12,7, SCAR, MMP, Milan, Eryx), Divers
  - stats : true = répartition des valeurs dans le tableau de situation (tailles NRBC par défaut)
- personnes : [{ id, v: { [champId]: valeur } }] (valeur vide = clé absente)
- listes : [{ id, nom, modifie, lignes: [{ brut, id }], champs: [champId], etat }]
  (listes préparées pour un week-end ; brut = ligne reçue, id = personne retenue ou "")
- permisRegles : { [permisId]: [champIds] } — éligible si l'un des prérequis est détenu
  (défaut : VT4, P4, VBL, PL ← permis civil ; Masstech ← permis civil ou VT4 ; Super PL et
  TC ← PL ; produits dangereux ← PL ou Super PL). meta.reglesPermisV / REGLES_PERMIS_V :
  quand on ajoute ou corrige une règle par défaut, incrémenter REGLES_PERMIS_V ; les règles
  absentes sont ajoutées aux fichiers existants, et une règle corrigée (REGLES_CORRIGEES) n'est
  remplacée que si le fichier a encore l'ancienne valeur non modifiée à la main.
- archives : [{ id, v, archive: { date, motif } }] — personnes parties, exclues de tous les tableaux
- journal : [{ t (ISO), qui, quoi, p? (ids des personnes concernées) }] — 3000 entrées max, chiffré avec le reste.
  modif(label, détails, ids) : passer les ids pour l'historique de la fiche (historiquePersonne : par id, sinon par nom)
- reo : { noms: { "PELOTON|GOLF": nom affiché }, postes: { "PELOTON|GOLF": nb de postes prévus },
  cartec?: { date, escadrons: { [escadron]: { unite, groupes: { "PEL|GOLF": nom }, vacants: { "PEL|GOLF": [libellés] } } } } }
  Pour un escadron présent dans reo.cartec (cartecEsc), les noms de groupes et postes à pourvoir viennent de CARTEC
  (prioritaires sur reo.noms ; reo.postes ignoré) ; groupesPeloton renvoie aussi postesVacants (libellés).
- meta.cartecUnites : { codeUnitéCARTEC: escadron } (mémorisé) ; meta.cartecAlias : { "nom|prénom" CARTEC (cleNom) : id }
  = noms proches déjà validés, plus redemandés
- Migrations à l'ouverture (normalize) : v1 (types + personnes à plat) → champs ;
  schéma 2 → 3 (migrerV3, idempotente) : gants / chaussures de NRBC vers Habillement,
  ajout béret, veste, pantalon, Eryx, règles de permis par défaut ; schéma 3 → 4 (migrerV4, idempotente) : champs
  IDENTITE_V4 / CARRIERE_V4 / FAMILLE_V4 / ADMIN_V4 + vmp + pap_lien insérés à leur place, drapeaux limite / sensible /
  calcul posés sur les champs existants s'ils n'ont jamais été réglés (fin de contrat : limite, alerte 90 j).

### Règles d'import (fichier Excel de l'escadron, ex. CDCTest.xlsx)
- .xlsx lu directement (zip + XML, DecompressionStream), ou CSV (UTF-8 ou Windows-1252)
- En-tête = ligne contenant « nom » ; la ligne au-dessus donne les groupes (cellules fusionnées)
- Correspondance colonnes → champs : IMPORT_MAP, modifiable dans la fenêtre d'import
- « NEANT » = pas d'info (case vide). « mort pour la France » → escadron « En attente ».
  BMC « Creer » → « À créer ». Permis : date, « oui » ou « ? ».
- Cellules non reconnues listées avant import, laissées vides
- Fusion sur nom + prénom : les cases vides du fichier n'effacent rien
- L'export CSV (2 lignes d'en-tête groupe / libellé) se réimporte à l'identique

### Statut d'une date
Expiration = date + validité (en mois).
Statuts : expiré (bad), à prévoir si moins de seuilAlerte(f) jours (warn),
à jour (ok), manquant (none), date sans échéance (info). Permis « ? » = warn.

### Organisation de l'interface (v3.2)
- Barre latérale (#sidebar, .sb-nav [data-view]) : Accueil, Personnel ; SUIVI : À faire
  (pastille = personnes avec une date expirée), CATI, NRBC, Habillement, Permis ;
  ORGANISATION : REO ; OUTILS : Préparer une liste, Statistiques, Qualité des données (pastille dorée = nb de points). En bas : menu
  « Fichier et réglages » (import, exports complets, archives, journal, réglages, mot de passe).
  Sous 900 px, la barre se replie (bouton ☰, voile #sb-voile).
- Barre du haut : titre de la page (#page-titre), « Modifications non enregistrées »,
  Annuler, Enregistrer, Verrouiller.
- Page Accueil (vue par défaut) : chiffres clés cliquables, actions courantes, « À faire »
  par escadron · peloton (bouton Voir → page À faire filtrée), situation par formation (#board,
  un compteur ouvre la page Personnel filtrée).
- Sur chaque page : filtres à gauche, 1 ou 2 actions principales visibles, le reste dans des
  menus déroulants (.dd > .dd-btn + .dd-menu) : « Exporter ▾ » (Excel, Imprimer / PDF),
  « Actions ▾ ». Un élément [data-clic="#id"] déclenche le bouton #id : pratique pour
  réutiliser une action depuis plusieurs menus sans dupliquer d'identifiant.
- Règle : ne pas ajouter de nouveau bouton visible sans le ranger dans cette logique
  (action principale visible, le reste en menu) ; jamais deux éléments avec le même id.

### Fonctionnalités
- Enregistrement automatique (v3.4) : fichier ouvert via File System Access et meta.enregAuto ≠ false ;
  markDirty → planifierAuto (AUTO_DELAI = 20 s, reporté si une fenêtre <dialog> est ouverte) → save(true).
  En automatique, jamais de fenêtre : conflit de fusion, fichier illisible ou erreur d'écriture = suspendreAuto
  (state.autoSuspendu, message dans la barre du haut) jusqu'au prochain enregistrement manuel. save() est protégé
  contre deux enregistrements simultanés (enregEnCours).
- Mise à jour depuis CARTEC (v3.5, menu « Fichier et réglages », #dlg-cartec) — logique pure, testée :
  - lireCartec(grid) : en-tête = ligne NOM + PRENOM ; colonne LIBELLE (emploi), GRADE. En-têtes « CODE : LIBELLÉ »
    sur trois colonnes (les 3 dernières avant LIBELLE) = unité (B), peloton (C), groupe (D). Ligne avec nom = personne,
    sans nom mais avec libellé = poste à pourvoir, sans libellé = même poste que la ligne au-dessus. Seules les unités
    qui ont un « COMMANDANT D'UNITE » sont gardées (l'état-major en tête est ignoré). idPeloton : commandement → PCL,
    « 1ER / 1ERE / 2E… » → P1, P2… Golf = rang du groupe dans le peloton (0 = commandement). Noms de groupes remis
    en minuscules avec accents courants (ACCENTS_CARTEC). Lignes surlignées en bleu (moins actifs) : importées normalement.
  - escadronPropose : réglage mémorisé, sinon escadron le plus fréquent des personnes retrouvées (ex. ESC BLINDE 4 → 5ESC,
    COMPAGNIE 3 → 7ESC).
  - planCartec(unites, data, corresp) : alias validé, puis nom + prénom (cleNom : accents, casse, tirets ignorés) ;
    homonymes = ambigu (non traité) ; deux lignes CARTEC pour une fiche = doublon ; sinon archives (restaurer), sinon
    nom proche (nomsProches : une partie du nom — « FHILO/GENEVAUX » = 2 parties — identique ou à distance ≤ 2, et
    prenomsProches) parmi les fiches du même escadron ou d'un escadron hors CARTEC (« En attente ») = probable (à confirmer),
    sinon nouveau. Champs comparés : escadron, peloton, golf, spe (CHAMPS_CARTEC) — jamais grade, dates, contacts.
    absents = fiches des escadrons concernés non retrouvées → archivées (motif « Absent de CARTEC ») par défaut.
  - liens (4e paramètre de planCartec, ca.liens dans l'aperçu) : { cléLigne: id | "nouveau" } choisi dans le menu
    « Déjà dans le suivi ? » / « Fiche du suivi » (caLienSelect : absents de CARTEC, puis « En attente » / hors CARTEC,
    puis un groupe par grade décroissant ; tri parGrade dans chaque groupe) → statut « manuel ».
  - appliquerCartec(data, unites, plan, corresp, refus) : refus = cases décochées (clé de ligne ou id d'absent), ligne
    non appliquée ; probable / manuel appliqués → alias mémorisé ; écrit reo.cartec, meta.cartecUnites, meta.cartecAlias. Un seul modif() (une annulation),
    puis une entrée de journal par fiche (ids → historique de la fiche).
- Compléter depuis le fichier UIR (v3.6, « gestion du personnel », menu « Fichier et réglages », #dlg-uir) — logique pure :
  - lireUIR(grid, champs) : en-tête = ligne NOM + PRENOM puis 0 à 2 lignes de sous-en-têtes (jusqu'à la première ligne
    avec un nom). Chemin de colonne « niveau 1 › 2 › 3 » : un libellé vaut pour les colonnes suivantes (cellules fusionnées)
    jusqu'au libellé suivant du même niveau ou d'un niveau au-dessus ; le dernier niveau n'est pas reporté.
    UIR_COLONNES : règles chemin → champ (le reste est ignoré). Dates : anyDate (série Excel ou JJ/MM/AAAA), date
    illisible signalée ; « NEANT », « - »… = vide ; situation familiale normalisée (SITFAM). Deux colonnes pour un champ
    (téléphone du conjoint) : la première remplie.
  - planUIR(lu, data, escadrons, liens) : uniquement les fiches des escadrons choisis (par défaut ceux de CARTEC), jamais
    de création. Lien manuel (« aucun » = pas dans nos escadrons), SAP, alias (meta.uirAlias), nom + prénom, puis nom
    proche (probable). ajouts = cases vides remplies ; differences = valeurs différentes (memeValeur : téléphone aux
    chiffres près, texte aux accents / casse près = pas une différence) ; sansDonnees = fiches absentes du fichier.
  - appliquerUIR(data, plan, refus, prendre) : PAR DÉFAUT LE FICHIER DE SUIVI A RAISON ; prendre = « cléLigne|champ »
    où l'on choisit la valeur UIR (boutons « Tout garder : suivi / Tout prendre : UIR ») ; cases vides toujours remplies ; alias mémorisé pour probable / manuel.
  - selectFiche : menu « Même personne que… » commun à CARTEC et UIR (groupes prioritaires puis par grade décroissant).
- CARTEC lit aussi la colonne SAP : rapprochement par SAP en premier, SAP enregistré dans la fiche.
- Page « Qualité des données » (controleQualite, logique pure) : doublons probables (nom + prénom, prénom
  préfixe, même mail), mail / téléphone mal formés, date dans le futur (sauf libellés « fin », « échéance »…),
  date avant 1950, sans escadron / peloton, nom ou prénom manquant, grade hors GRADES. Clic = fiche ; export Excel.
- Fiche : section repliable « Historique » (entrées du journal de la personne).
- Écran de verrouillage : nom de l'utilisateur (facultatif, pour le journal, gardé en mémoire
  seulement), ouvrir un fichier existant, en créer un nouveau, ou « Essayer avec des données
  fictives » (donneesDemo : générateur reproductible, noms fictifs, mails @example.org ;
  mot de passe si on l'enregistre : demonstration)
- Verrouillage automatique après meta.verrouMinutes d'inactivité : les données sont chiffrées
  en mémoire (session), l'affichage est vidé (viderAffichage), on reprend avec le mot de passe
  sans perdre les modifications non enregistrées. Les instantanés « Annuler » sont effacés.
- Annuler (bouton + Ctrl+Z hors champ de saisie) : modif(label, détails) AVANT toute
  modification = instantané en mémoire (30 max) + entrée de journal. Toute nouvelle action
  qui modifie les données doit appeler modif().
- Journal des modifications (bouton en haut, recherche) : qui, quand, quoi (diffFiche pour
  les fiches : « Famas › Bravo : 01/01/2025 → 01/10/2026 »)
- Enregistrement et travail à plusieurs (v3.3) : state.base = version du fichier à
  l'ouverture (puis après chaque enregistrement ; gardée chiffrée pendant une session
  verrouillée). Avant d'écrire, lireDisque relit le fichier ; si son IV diffère de
  state.lastIv, il a été réécrit ailleurs. S'il est lisible avec la même clé : fusionner(A =
  base, B = disque, C = mes données) — fusion à trois versions, case par case pour les
  personnes et archives (par id), liste par liste, blocs entiers pour champs / REO / règles
  permis, réglages généraux clé par clé, journal = union. Ce qui n'a changé que d'un côté est
  repris ; même case changée différemment des deux côtés = conflit → fenêtre #dlg-fusion
  (ma version par défaut, « Tout garder : ma version / sa version »). Suppression d'un côté +
  modification de l'autre = conflit. Après fusion : historique « Annuler » vidé, entrée de
  journal. Si illisible (autre mot de passe) : ancien choix Écraser / Copie / Annuler.
- Changement de mot de passe (Champs et réglages) : vérifie l'ancien, nouveau sel + nouvelle clé,
  appliqué au prochain enregistrement
- Saisir une séance (page Personnel) : date + cases des formations faites + liste des présents
  (collée, fichier ou liste enregistrée, rapprochement des noms) ; seanceChangements garde une
  date plus récente déjà saisie sauf « Remplacer aussi » ; une seule entrée d'annulation
- Page « À faire » : echeances() — expirés + à renouveler selon les seuils réglés (jours = null, par défaut) ou sous 0/30/60/90 jours, filtre
  formation (groupe ou champ), « jamais fait » en option ; par escadron · peloton ;
  « Écrire à ces personnes » (mailto: en Cci, objet + texte ; si lien > 1900 caractères,
  adresses copiées dans le presse-papiers), copier les adresses, impression, export Excel
- Écrire aux personnes affichées (Personnel) et à la liste préparée : même mécanisme mailto
- Fiche : dates à échéance colorées (fond + « Expiré depuis… / Valide jusqu'au… »), mises à
  jour pendant la saisie ; boutons Archiver (motif) et Supprimer
- Archives (bouton page Personnel) : restaurer ou supprimer définitivement
- Tableau de situation : une tuile par groupe, une ligne par date à échéance
  renseignée ; compteurs calculés sur l'escadron / peloton filtré ; un clic filtre la liste
- Liste : recherche (toutes valeurs), filtres escadron, peloton, champ + état,
  tri par colonne, première colonne figée, colonnes affichées par groupe (puces)
- Fiche personne dans une modale <dialog>, sections par groupe (groupesFiche : GROUPES_FIN = Famille, Personne à
  prévenir, Administratif affichés à la fin ; l'ordre des champs, du tableau et des exports n'est pas changé)
- « Champs et réglages » : groupes, libellés, validités, ajout / retrait de champs
- En-tête : date du dernier enregistrement (meta.modifie) ; à l'ouverture, date de
  modification du fichier choisi (métadonnée système, lisible sans mot de passe)
- Stats NRBC : répartition des tailles (cliquable → filtre « = valeur »), atmosphère viciée
- Page « Préparer une liste » : coller ou charger (xlsx/csv) une liste grade / nom / prénom,
  rapprochement automatique (ordre libre, accents/casse ignorés ; ambigu, introuvable,
  doublon signalés, correction manuelle : menu groupé par grade décroissant puis nom), choix des champs par groupe, export CSV
  (option : colonne d'état des dates, introuvables en fin de fichier), impression,
  enregistrement de la liste dans le fichier chiffré
- Page « REO » : organigramme d'un escadron construit depuis escadron → peloton → golf.
  PCL golf 0 = bloc « Commandement » ; autres golfs = bandeaux de groupe (noms par défaut :
  PCL 1 à 5 = échelon / ravitaillement / maintenance / SIC / santé, pelotons golf 0 =
  patrouille de commandement, sinon « Patrouille N »). Tri par grade décroissant.
  Postes prévus non occupés = lignes « Poste à pourvoir » (clic = nouvelle fiche préremplie).
  Impression paysage / PDF, export CSV.
- Pages « NRBC » et « CATI » : un tableau par peloton (titre « Peloton N »), un bloc
  vertical par golf (golf 0 = Commandement, sinon « Golf N » ou le nom du réglage REO),
  en-tête de colonnes répété à chaque golf, ligne de totaux (dates à échéance :
  à jour / renseignés ; autres : renseignés / effectif). Colonnes définies dans SYNTHESES :
  NRBC = tailles ANP, T3P, gants, chaussures + atmosphère viciée (+ récap des tailles) ;
  CATI = Famas dernier tir / Bravo / Charlie, HK, Glock, MAG 58, Minimi, M2HB (12,7),
  SCAR H, Akeron MP, Milan MK3. Dates en rouge (expirée), orange (bientôt), vert (à jour).
  Filtre escadron + peloton (« Tous » = un tableau par peloton, une page par peloton à
  l'impression), export CSV avec colonnes d'état.
- Page « Habillement » : même présentation que NRBC (béret, veste, pantalon, gants,
  chaussures + récap des tailles par peloton). CATI : Eryx ajouté en anti-char.
- Page « Permis » (SYNTHESES.permis, crochets colonnes / cellule / xcell / total / filtre) :
  cartes par permis (titulaires / éligibles / à vérifier, cliquables) + filtre « Afficher ».
  Présentation « Par peloton » par défaut (comme CATI) ou « Liste complète » (tableau unique,
  escadron « Tous » possible). Vert = titulaire, bleu = éligible, orange = à vérifier ;
  règles d'éligibilité modifiables ; export Excel coloré dans les deux présentations.
- Page « Statistiques » : filtres escadron (« Tous » possible) + peloton ; chiffres clés
  (effectif, taux de validité global, dates expirées, à prévoir) ; « Armement et formations »
  (FORMATIONS : barres empilées à jour / à prévoir / expiré / jamais fait + tableau formés,
  taux de formation, taux de validité = (à jour + à prévoir) / formés, statut ✓ Bon ≥ 75 %,
  ⚠ Moyen ≥ 50 %, ✗ Critique) ; grille des taux par peloton ; barres permis (titulaires /
  éligibles) ; histogrammes des tailles. Infobulle au survol (#viz-tip), impression / PDF,
  export Excel des tableaux. Graphiques en HTML/CSS (classes .vseg, .colchart), sans bibliothèque.
  Formations sans aucune date dans le fichier masquées.
- Attention aux noms de classes CSS : « .seg » est déjà pris par le sélecteur de l'écran de
  verrouillage.
- Colonne verticale (REO, NRBC, CATI) : largeur fixe ; le libellé n'est jamais plus haut
  que le bloc (libelleVertical : abrégé « Cdt », « G1 »… s'il ne tient pas). Dans NRBC/CATI,
  un golf nommé dans le réglage REO a son nom dans un bandeau horizontal, la colonne
  verticale affiche « Golf N ».
- Enregistrement : File System Access API (Chrome/Edge, réécrit le fichier
  d'origine), sinon téléchargement. Raccourci Ctrl+S.
- Alerte avant de quitter la page s'il reste des modifications non enregistrées
- Exports Excel (.xlsx) mis en forme, générés sans bibliothèque (zipStore + XML, styles XS) :
  Personnel (réimportable : titre, ligne de groupes, ligne de libellés), liste préparée,
  REO, NRBC / CATI (une feuille par peloton). Bandeaux marine / or, dates à échéance en
  couleur (rouge expiré, orange à prévoir, vert à jour), lignes alternées, volets figés,
  impression paysage ajustée à la largeur. Avertissement « non chiffré » avant chaque export.
- Export CSV brut (page Personnel) conservé, compatible Excel FR (BOM UTF-8, ;)

### Style
Identité du hub escadron : bleu marine (#13233F / #0B1629) et or (#C9A227).
Polices Barlow / Barlow Condensed. Couleurs de statut : vert, ambre, rouge, gris.

## Tests (données fictives uniquement, publiables)
- Depuis la racine du dépôt : `node suivi/tests/run.mjs`, `node suivi/tests/ui.mjs`, `node suivi/tests/csp.mjs`.
- `node tests/run.mjs` : logique (chiffrement, import/export Excel et CSV aller-retour,
  rapprochement, permis, migrations, séance, échéances, REO, journal). Charge la partie du
  script située avant le marqueur « /* ===== Interface ===== */ » : garder la logique pure
  (sans DOM) avant ce marqueur.
- `node tests/ui.mjs` : scénario complet dans Chrome headless avec la démo (onglets, séance,
  annuler, archives, journal, exports, session verrouillée, conflit, mot de passe, qualité, historique,
  enregistrement automatique, mise à niveau 310 000 → 600 000, mot de passe changé ailleurs). Le scénario est
  injecté comme second script : son empreinte est ajoutée à la CSP de la page de test.
  Les tests CARTEC et UIR utilisent de faux fichiers (fauxCartec, fauxUIR dans run.mjs, grilles dans ui.mjs), jamais
  les vrais (nePasMettreSurLeRepo/ : CARTEC 2026.xlsx, testData.xlsx = modèle du fichier UIR).
- `node tests/csp.mjs` : met à jour l'empreinte du script dans la CSP (--verifier : contrôle seul).
  Dans le scénario, attendre avec quand() (MessageChannel), pas setTimeout : Chrome accélère
  le temps virtuel alors que PBKDF2 prend du vrai temps (une boucle de messages garde la page occupée ;
  attendre(ms) la suspend pour laisser passer du temps virtuel). Le test dure ~75 s (Chrome est arrêté
  après le scénario, qui prend ~30 s).
- Lancer les deux après chaque évolution. Ne jamais mettre de données réelles dans tests/.

## Limites connues
- Pas de temps réel : on voit les modifications des autres en enregistrant ou en rouvrant.
  La fusion ne marche qu'avec un fichier ouvert via File System Access (Chrome/Edge, dossier
  Google Drive pour ordinateur) et le même mot de passe ; délai de synchronisation Drive.
- Sur Firefox, Safari et mobile, l'enregistrement passe par un téléchargement.

## Pistes d'évolution
- Export calendrier (.ics) des échéances
- Raccourcis clavier (/ recherche, N nouvelle fiche)
