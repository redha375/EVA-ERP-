# Déploiement du serveur API — CTP SMART

Le serveur (Express + tRPC) doit être joignable en HTTPS publiquement. L'application mobile s'y connecte via `EXPO_PUBLIC_API_BASE_URL`.

## 1. Prérequis

- Une base MySQL 8 accessible depuis le serveur, avec `DATABASE_URL` (`mysql://user:password@host:3306/ctp_smart`).
- Un nom de domaine avec HTTPS (le fournisseur de la plateforme gère souvent le certificat).
- Les valeurs de `.env.example` pour le serveur : `MANUS_PROJECT_ID`, `MANUS_OAUTH_API_URL`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_JWT_SECRET`, `NATIVE_OAUTH_SCHEME`.

## 2. Construction de l'image

```bash
docker build -t ctp-smart-api .
```

Ou sans Docker : `pnpm install --frozen-lockfile && pnpm build && NODE_ENV=production node dist/index.js`.

## 3. Migrations de la base (une fois, puis à chaque mise à jour du schéma)

Les migrations utilisent `drizzle-kit`, qui est une dépendance de développement. Lancez-les depuis un poste disposant des dépendances complètes :

```bash
pnpm install --frozen-lockfile
DATABASE_URL='mysql://...' pnpm db:migrate
```

Ne lancez pas `pnpm db:push` en production.

## 4. Lancement

```bash
docker run --env-file .env -p 3000:3000 ctp-smart-api
```

Vérification : `curl https://votre-domaine/api/health` doit répondre `{"ok":true,...}`.

## 5. Premier administrateur

1. Connectez-vous une fois à l'application avec votre compte Manus (le compte est créé automatiquement).
2. Relevez votre `openId` dans la table `users` (`SELECT openId FROM users;`).
3. Définissez `OWNER_OPEN_ID` avec cette valeur, puis redémarrez le serveur.
4. Depuis l'écran d'administration de l'application, affectez rôles et couples équipe–machine aux autres comptes.

## 6. Points à surveiller

- `NATIVE_OAUTH_SCHEME` doit correspondre exactement au schéma de l'application construite (`manus<chiffres>`, dérivé de l'identifiant d'application). Un écart provoque l'erreur « Invalid native redirect ».
- Sauvegardez MySQL régulièrement et testez une restauration avant la mise en service.
- Ne placez jamais `.env` dans l'image ni dans le dépôt ; les variables doivent être fournies à l'exécution.
