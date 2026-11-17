# Mise en production — CTP SMART (Android & App Store)

Ce document liste ce qui est prêt dans le code, ce qui doit être fait avec vos comptes et votre infrastructure, et les contrôles à passer avant d’envoyer l’application à de vraies équipes d’usine.

## 1. État du code

Préparé dans le dépôt :

- `eas.json` : profils `development`, `preview` (APK de test interne), `production` (AAB Android, build iOS, numéro de build incrémenté automatiquement).
- `app.config.ts` :
  - identifiant d’application configurable via `APP_BUNDLE_ID` ;
  - build de production **refusé** si l’URL API n’est pas en `https://` ou si la configuration Manus OAuth est absente ;
  - permissions Android vides (aucune caméra, micro ni notification n’est utilisée aujourd’hui) ;
  - plugins audio et vidéo inutilisés retirés ;
  - iPad désactivé (application portrait pour téléphone, selon `plan.md`).
- `constants/oauth.ts` et `server/_core/oauth.ts` : le schéma de retour OAuth est lu depuis une seule source (`app.config.ts` côté app, `NATIVE_OAUTH_SCHEME` côté serveur).
- `server/_core/index.ts` : un échec de démarrage affiche la cause et quitte avec un code d’erreur, au lieu de passer silencieusement.
- `.gitignore` : `.env` n’est plus versionné ; seul `.env.example` l’est.
- `dev/theme-lab.tsx` : écran de développement sorti des routes (il n’est plus compilé dans l’application).
- `package.json` : script `db:migrate` (migration seule, à utiliser en production ; `db:push` génère de nouvelles migrations et ne doit pas servir au déploiement).

Vérifications effectuées dans cet environnement :

- Les 10 tests des règles métier (`tests/ctp.rules.test.ts`, cartons, capacité 6 stations × 2 moules, clôture, identité des cartons) passent.
- Aucune erreur de syntaxe dans les fichiers TypeScript.
- Les fichiers JSON (`eas.json`, `package.json`) sont valides.

Non vérifié ici (les dépendances ne sont pas installées dans cet environnement) :

- compilation TypeScript complète (`pnpm check`) ;
- suites `tests/cors.test.ts` et `tests/auth.logout.test.ts` (`pnpm test`) ;
- build serveur (`pnpm build`) et démarrage réel ;
- build EAS et exécution sur appareil.

## 2. Comptes et accès à obtenir

| Élément | Nécessaire pour | Remarque |
|---|---|---|
| Compte Expo (EAS) | builds cloud et soumission | `eas login` |
| Apple Developer Program | App Store | abonnement annuel, identifiant d’application propre à votre société |
| Google Play Console | Android en production | frais d’inscription unique, clé de signature gérée par EAS |
| Projet Manus OAuth | connexion | `MANUS_PROJECT_ID`, URL du portail, URL API ; faire enregistrer la redirection native `<schéma>://oauth/callback` |
| Serveur Node + MySQL 8 | API et données | URL `https` publique ; sauvegardes et restauration testées |

**Décision à prendre avant toute soumission** : l’identifiant actuel `space.manus.ctpsmart.t251309797782513` appartient au modèle Manus. Pour publier sous votre nom, choisissez un identifiant du type `com.votresociete.ctpsmart` et définissez `APP_BUNDLE_ID`. Définissez ensuite `NATIVE_OAUTH_SCHEME` sur le serveur avec le schéma correspondant (`manus<chiffres>`, dérivé de l’identifiant). Sans cela, la connexion échouera avec une erreur « Invalid native redirect ».

## 3. Serveur API

```bash
pnpm install --frozen-lockfile
pnpm build                 # produit dist/index.js
pnpm db:migrate            # DATABASE_URL requis ; ne pas utiliser db:push en production
pnpm start                 # NODE_ENV=production
```

- Variables serveur : voir `.env.example` (`DATABASE_URL`, `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL`, `NATIVE_OAUTH_SCHEME`, `OWNER_OPEN_ID`, `PORT`).
- Vérification : `GET https://votre-api/api/health` doit répondre `{"ok":true,...}`.
- **Premier administrateur** : connectez-vous une fois avec votre compte Manus, relevez votre `openId` dans la table `users`, renseignez `OWNER_OPEN_ID` puis redémarrez. Ce compte peut ensuite affecter rôles et couples équipe–machine à tous les autres utilisateurs.
- Sans affectation active, le serveur refuse les données ERP avec le message « Compte CTP non activé » : c’est le comportement voulu. Vérifiez son affichage à l’écran lors du test sur appareil (section 6).

## 4. Variables de build mobile (EAS)

À enregistrer dans EAS, pas dans le dépôt :

```bash
eas env:create --environment production --name EXPO_PUBLIC_API_BASE_URL --value https://votre-api --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_OAUTH_PORTAL_URL --value <url-portail> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_OAUTH_SERVER_URL --value <url-oauth-api> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_APP_ID --value <id-projet-manus> --visibility plaintext
```

Si `APP_BUNDLE_ID` est défini, ajoutez-le aussi à l’environnement `production`.

## 5. Builds et soumission

```bash
eas init                                              # lie le projet à votre compte Expo
eas build --platform android --profile preview        # APK pour test interne
eas build --platform android --profile production     # AAB pour Google Play
eas build --platform ios --profile production         # IPA pour App Store Connect
eas submit --platform android --latest
eas submit --platform ios --latest
```

Si `eas init` vous demande d’ajouter un `projectId` dans `app.config.ts`, faites-le sous `extra.eas`.

## 6. Contrôles sur appareil réel (avant tout usage en production)

1. Installer l’APK de prévisualisation sur un Android et un iPhone réels.
2. Connexion Manus : le navigateur revient bien dans l’application et ouvre l’écran « Connexion établie ».
3. Un compte sans affectation voit le message de refus ; après affectation par l’administrateur, l’accès est accordé.
4. Un chef d’équipe soumet une fiche ; un Gérant distinct la confirme ou la retourne avec motif ; l’approbateur final distinct l’approuve. L’auteur ne peut pas valider sa propre fiche.
5. Une machine ou un couple équipe–machine hors affectation est refusé côté serveur.
6. Déconnexion puis reconnexion ; redémarrage de l’appareil sans perte de session.
7. Coupure réseau pendant une saisie : vérifier que l’application affiche une erreur et ne présente jamais la saisie comme enregistrée (non testé à ce stade).
8. Sauvegarde et restauration de la base MySQL testées avant mise en service.

`plan.md` précise que l’application ne doit pas être utilisée avec de véritables enregistrements de production tant que l’identité, les affectations, la persistance, la gestion des conflits et les tests de récupération ne sont pas vérifiés. Les contrôles 1 à 8 couvrent une partie de ces points ; la gestion des conflits de synchronisation n’est pas implémentée.

## 7. Fiche store

Textes et données à préparer (non générés ici) :

- **Nom** : l’`appName` actuel « CTP SMART — ERP mobile industriel » fait 33 caractères. L’App Store limite le nom à 30 caractères. Exemple : « CTP SMART ERP ».
- **Captures d’écran** : téléphone en portrait ; App Store Connect demande une série pour la taille de grand écran qu’il indique au moment de la soumission ; Google Play exige au moins 2 captures.
- **Politique de confidentialité** : URL publique obligatoire. Données traitées : nom, e-mail, identifiant Manus, rôle ERP, affectations équipe–machine, fiches de production et journal d’audit. Aucun suivi publicitaire.
- **Suppression de compte** : si la connexion crée un compte utilisateur, Apple (règle 5.1.1 v) et Google Play exigent un moyen de demander la suppression. Ce point n’est pas implémenté ; prévoyez-le ou justifiez-le auprès de la revue.
- **Fonctions annoncées** : ne décrivez pas la caméra ni l’OCR comme disponibles. Elles ne sont pas implémentées (voir `plan.md`).
- **Formulaires** : « Data Safety » (Google Play) et « App Privacy » (App Store) à remplir d’après la liste ci-dessus.
- **Classification d’âge** : usage professionnel, aucun contenu sensible.

## 8. Limites connues

- Aucune synchronisation hors ligne ni résolution de conflits entre saisies simultanées.
- Caméra, capture de compteur et OCR : non implémentés.
- Les modules secondaires (stock, qualité, RH, finance…) sont présents en interface ; leurs règles de droits doivent être relues avant usage réel.
- Les données de démonstration du tableau de bord sont désactivées (`synthetic: false` côté serveur) ; vérifiez qu’aucun texte d’interface ne suggère le contraire.
