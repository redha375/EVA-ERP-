# TODO — CTP SMART Mobile

## Tableau de bord et navigation mobile — ouvert
- L’application Expo/React Native est portrait, en français et utilisable à une main; la barre basse donne accès à Accueil, Atelier, Flux et Modules.
- Le tableau de bord présente date/équipe, indicateurs calculés, état des machines, alertes et raccourcis vers les saisies et validations.
- Les données de démonstration éventuelles sont synthétiques et explicitement marquées; elles ne sont pas stockées comme données d’usine.

## Fiches de production et suivi machine — ouvert
- Les saisies couvrent EVA, SOUMELLE et PVC, EVA1 à EVA4, équipe, quart, modèle, pointure, postes/stations, couleurs, compteurs, production totale, pièces conformes, rebuts, matières consommées, cartons pleins/ouverts, reliquat et arrêts.
- Le modèle EVA approuvé est de 6 stations physiques par machine et 2 moules par station (12 moules au total); les calculs respectent ce modèle et les modes de production source.
- Ne jamais deviner, inventer ni corriger silencieusement; une case vide ne devient pas zéro; production totale ne signifie pas automatiquement production conforme; un modèle inconnu est signalé à vérifier; les cartons ouverts ne sont pas comptés comme cartons pleins.
- Les classements et indicateurs des équipes et des machines sont calculés à partir des données métier disponibles.

## Flux physique, cartons et clôture — ouvert
- Un carton est un objet physique unique qui conserve son identifiant et son état d’une étape/couleur à l’autre; il ne doit pas être recompté comme un nouveau carton à chaque passage.
- Le flux permet les étapes couleur prévues, rattache les cartons ouverts éligibles au modèle et à la pointure et calcule cartons récupérés, nouveaux, complétés et restant ouverts selon les quantités réellement déclarées.
- Tout carton incomplet reste ouvert. La clôture exige toutes les étapes prévues, la quantité requise, une configuration modèle/pointure vérifiée, le contrôle qualité requis et une confirmation d’un opérateur autorisé.

## Comptes, autorisations et validation de production — ouvert
- L’identité de l’application provient de Manus OAuth vérifié; une sélection locale de profil, des en-têtes ou champs client ne prouvent pas l’identité ni le rôle.
- Les rôles ERP pris en charge sont `admin_general`, `direction`, `resp_production`, `gerant`, `chef_equipe`, `resp_qualite`, `resp_maintenance`, `resp_stock`, `resp_commercial`, `rh`, `operateur`, `controleur_production` et `amin_final_approver`.
- Le rôle, l’état actif et les couples d’accès équipe–machine sont affectés côté serveur. Une portée absente/ambiguë ou `*` ne donne aucun accès; l’interface seule ne fait pas autorité.
- Un chef d’équipe affecté soumet une fiche; un Gérant affecté et distinct de l’émetteur confirme ou retourne avec motif; un `amin_final_approver` affecté, distinct de l’émetteur et du Gérant, donne l’approbation finale ou retourne avec motif.
- Les transitions de workflow et les entrées du journal d’audit sont validées/créées côté serveur; le client ne peut pas forger l’auteur ou écrire une preuve d’audit.
- L’Admin peut gérer les comptes et affectations sans obtenir automatiquement accès à tout le contenu métier.

## Modules opérationnels et de gestion — ouvert
- L’application mobile fournit les modules de stock/matières, qualité, maintenance, RH, commercial/ventes, finance/P&L, rapports, catalogue/référentiels, administration et permissions, issus du bundle.
- Chaque lecture ou modification métier persistante est autorisée sur le serveur selon le rôle et les affectations explicitement configurées; aucune fonction d’OCR n’est annoncée active tant que son service serveur n’est pas configuré, et toute valeur OCR est confirmée par un utilisateur.
- La caméra, si disponible sur l’appareil, peut capturer une preuve de compteur/QR; une capture web/Preview ne vaut pas validation d’un comportement natif.

## Stockage persistant et API — ouvert
- Les données métier sont enregistrées dans la base MySQL managée du projet via le serveur Express/tRPC et Drizzle; elles survivent aux redémarrages.
- Le schéma comprend les comptes/affectations, équipes, machines/stations, fiches de production, cartons et événements de flux, validations/audit, ainsi que les entités nécessaires aux modules activés (qualité, stock, maintenance, références, RH, ventes et finance).
- Les secrets restent côté serveur; le client n’accède jamais directement au DSN. Les migrations sont additives et répétables et ne remplacent pas les données existantes.
- Aucune donnée réelle d’usine n’est seedée ou utilisée pour les tests; les tests s’appuient sur des entrées synthétiques.
- L’application ne prétend pas être prête pour les données de production tant que l’identité, les affectations, les règles d’accès, la persistance, la gestion des conflits et les contrôles de récupération ne sont pas effectivement configurés et vérifiés.

## Identité native et exécution mobile — ouvert
- Le logo fourni est repris dans des icônes carrées distinctes sans coins arrondis pré-dessinés; les références dans `app.config.ts` sont mises à jour en conservant `appSlug`, le scheme et les identifiants natifs générés.
- Les diagnostics TypeScript restent enregistrés; les vérifications applicables sont exécutées et les serveurs Expo Metro sur 8081 et API sur 3000 sont prêts pour le Preview.
- Le code livré est checkpointé sur le dépôt Manus; aucune publication publique n’est annoncée sans succès confirmé.

## Préparation release Android / App Store — ouvert
- Fait dans le dépôt : `eas.json` (preview APK, production AAB/IPA), garde de build production (URL API https et configuration OAuth obligatoires), permissions Android vides, plugins audio/vidéo inutilisés retirés, iPad désactivé, schéma OAuth unique (`APP_BUNDLE_ID` / `NATIVE_OAUTH_SCHEME`), `.env` exclu du dépôt, écran dev sorti de `app/`, script `db:migrate`, `.env.example`.
- Vérifié ici : 10 tests des règles métier CTP passent ; syntaxe TypeScript OK ; JSON valides.
- Reste à faire par l’équipe : compte Apple Developer et Google Play, identifiant d’application propre à la société, déploiement de l’API et de MySQL en https, variables EAS, premier build preview, tests sur appareil (voir `RELEASE.md`).
- Reste à décider : nom d’affichage (33 caractères, limite App Store 30), suppression de compte in-app (règle Apple 5.1.1 v), politique de confidentialité publique.
- Reste à implémenter avant usage réel : synchronisation hors ligne et résolution de conflits, caméra/OCR (non annoncés tant qu’ils ne sont pas actifs).
