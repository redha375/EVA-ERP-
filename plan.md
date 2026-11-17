# Plan — CTP SMART Mobile

## Périmètre produit

Application Expo/React Native portrait, en français, qui transpose sur téléphone le domaine fonctionnel du bundle fourni : pilotage d’usine C.T PLAST, production EVA/SOUMELLE/PVC, machines et équipes, fiches journalières, flux physique et cartons, stock, qualité, maintenance, RH, commercial, finance/P&L, rapports, référentiels, administration et permissions. La navigation doit être utilisable à une main et distinguer les opérations d’atelier des modules de supervision.

La première expérience ouvrira sur un tableau de bord d’atelier : date/équipe, indicateurs calculés, états des machines, alertes et accès rapides aux saisies et validations. Les parcours mobiles principaux couvriront la fiche quotidienne (machine, équipe, poste/station, matière, modèle, pointure, compteurs, quantité totale, bonnes pièces, rebuts, cartons pleins/ouverts, reliquat, matière consommée et arrêts), le suivi de la machine EVA, le flux des cartons, les approbations et les modules secondaires issus du dépôt. Les champs absents resteront absents : une case vide ne devient pas zéro, « production totale » ne vaut pas implicitement « production conforme », un modèle non répertorié est signalé à vérifier, et un carton ouvert ne devient pas un carton plein.

Le calcul de flux reprendra les règles source : un carton garde son identifiant et son état au fil des étapes; la réutilisation des cartons ouverts est déduite du flux réellement traité; aucun double comptage; un carton incomplet demeure ouvert; la clôture requiert les étapes prévues, la quantité cible, une configuration modèle/pointure valide, le contrôle qualité et la confirmation d’un acteur autorisé. Les calculs d’équipe/machine et de rendement s’appuieront sur les données métier et les règles déterministes du dépôt, non sur des totaux saisis arbitrairement.

## Décision métier confirmée

L’utilisateur a confirmé le modèle du moteur métier : **6 stations physiques par machine EVA et 2 moules par station, soit 12 moules au total**. Les formulaires mobiles et les calculs utilisent six numéros de station; les deux moules restent des positions par station. Les machines de référence initiales conservent ces paramètres par défaut.

## Architecture et données

Conserver le starter mobile imposé : Expo Router, React Native, TypeScript, NativeWind, API Express/tRPC et Drizzle sur la base MySQL gérée. Étendre le schéma existant de façon additive pour les affectations utilisateur, équipes, machines/stations, saisies de production, cartons et journal de leurs étapes, contrôles qualité, stocks/mouvements, maintenance, références et validations. Les données durablement modifiées passent par des procédures serveur; l’API ne fait confiance ni à un rôle, ni à un identifiant d’utilisateur, ni à une affectation envoyés par le client.

Utiliser Manus OAuth comme identité par défaut. Une identité OAuth vérifiée est reliée côté serveur à un compte ERP actif, à un rôle et aux couples d’affectation explicites équipe–machine. Pas d’écran de sélection de rôle faisant office de connexion, pas de rôle/niveau d’accès présumé, pas de portée `*`; une affectation absente ou ambiguë est refusée. Reprendre les rôles nommés dans le dépôt : `admin_general`, `direction`, `resp_production`, `gerant`, `chef_equipe`, `resp_qualite`, `resp_maintenance`, `resp_stock`, `resp_commercial`, `rh`, `operateur`, `controleur_production` et `amin_final_approver`. Le rôle Admin gère les comptes et affectations sans obtenir automatiquement accès à tout le contenu métier.

Respecter les étapes d’approbation représentées dans le code source : chef d’équipe soumet; un Gérant affecté confirme ou retourne avec motif; un acteur distinct `amin_final_approver`, lui aussi affecté explicitement au couple équipe–machine, approuve ou retourne avec motif. L’auteur ne valide pas son propre enregistrement. Les contrôles sont côté serveur et les événements d’audit sont créés côté serveur, pas écrits par le client.

Le tableau de bord de démonstration peut employer uniquement des données synthétiques explicitement marquées comme telles. Aucune donnée réelle d’usine, aucun faux compte de démonstration et aucune fausse disponibilité de synchronisation ne seront introduits. Les prérequis mentionnés dans le bundle — identité réellement vérifiée, données persistées, autorisations/périmètres vérifiés, gestion de conflits et tests de récupération — restent à établir avant usage avec des enregistrements de production. La caméra peut servir à capturer une preuve de compteur/QR; toute valeur proposée par OCR doit rester à confirmer par un utilisateur, et l’OCR ne sera annoncé comme actif que si son service serveur est effectivement configuré.

## Navigation et structure visées

Garder la structure Expo existante (`app/`, `components/`, `hooks/`, `lib/`, `server/`, `drizzle/`) et organiser le code par domaine à l’intérieur :

- `app/(tabs)/` : accueil, atelier/production, flux/cartons et hub « Modules »; parcours détaillés et formulaires dans des routes Expo Router dédiées.
- `components/ctp/` : cartes KPI, sélecteurs d’équipe/machine, formulaires mobiles, états, alertes, navigation et composants de revue.
- `hooks/` : session/compte ERP et requêtes mobiles; aucun stockage de secrets côté client.
- `lib/ctp/` : types métier, calculs purs, validations, mapping des rôles et fonctions de présentation.
- `server/ctp/` et `server/routers.ts` : procédures protégées, vérification d’affectation, transitions de workflow, écritures métier et audit.
- `drizzle/schema.ts` et `drizzle/` : tables et migrations additives.
- `assets/images/` : réemploi de l’identité graphique et du logo fournis dans le bundle, avec les déclinaisons carrées natives requises.

La barre basse doit garder quatre entrées prioritaires (Accueil, Atelier, Flux, Modules) et les listes/formulaires doivent être conçus pour un écran portrait, de grands contrôles tactiles, clavier numérique pour les quantités et confirmations explicites des actions de workflow.

## Direction visuelle proposée

Trois styles rares envisagés : **poste de pilotage industriel suisse** (0,082); **brutalisme doux d’atelier** (0,041); **registre éditorial de manufacture** (0,067). Choix proposé : poste de pilotage industriel suisse, en reprenant les tons bleu nuit, bleu vif et ambre du projet source.

- **Mouvement** : design suisse de tableaux de bord industriels, précis et lisible dans un environnement d’atelier.
- **Principes** : lisibilité à distance; données et alertes hiérarchisées; unités et états explicites; peu d’ornement.
- **Philosophie couleur** : bleu nuit pour l’autorité et le fond de travail, surfaces claires pour les formulaires, bleu CTP pour l’action et ambre pour l’attention; vert réservé aux états réellement validés.
- **Paradigme de mise en page** : ruban d’état compact en haut, grandes valeurs opérationnelles sous forme de cartes à largeur variable, listes verticales défilantes et barre d’action persistante pour les tâches d’atelier; éviter les tableaux larges de bureau.
- **Signatures** : filets colorés d’état; compteur de progression des étapes/cartons; identifiants courts et badges de machine/équipe.
- **Interaction** : une action principale par écran, saisie séquencée, calculs visibles à côté de leur source, erreurs et avertissements non bloquants clairement nommés; aucune transition de workflow silencieuse.
- **Animation** : transitions courtes de 150–220 ms; progression des étapes animée sans déplacer le contenu; réduire les animations si l’utilisateur préfère le mouvement réduit; aucun clignotement d’alerte.
- **Typographie** : Plus Jakarta Sans pour l’interface latine et Cairo pour l’arabe/RTL, hiérarchie numérique tabulaire pour compteurs et KPI; utiliser des polices chargées/bundlées et préserver les identifiants lisibles.
- **Essence de marque** : « Le poste de pilotage mobile qui relie la pièce produite au flux réel de l’usine »; personnalité : rigoureuse, directe, utile.
- **Voix** : courte et factuelle. Exemples : « Saisir le poste »; « 4 cartons restent ouverts — étape 2 attendue ».
- **Logo** : reprendre le logo chaussure CTP fourni, recadré sans coin arrondi incrusté dans l’icône carrée; monogramme CTP net pour le fond de lancement et les variantes Android.
- **Couleur signature** : bleu CTP lumineux, porté par le bleu nuit d’atelier.

## Démarrage et livraison

Après accord sur le plan et le modèle EVA, créer `TODO.md` avant l’implémentation. Porter les règles métier pertinentes depuis le bundle plutôt que de recopier les composants web. Préparer les migrations sans écraser les données existantes; exécuter la synchronisation de schéma de démarrage du template uniquement avant les premiers appels OAuth/API, sur la base gérée propre à ce nouveau projet. Configurer les icônes natives et la marque de projet, effectuer les vérifications TypeScript et tests métier disponibles, puis lancer les listeners Metro 8081 et API 3000 pour le Preview. Le Preview web ne valide pas à lui seul les comportements natifs de caméra; les builds APK/AAB ou iOS restent une action Dashboard distincte et ne seront pas déclarés construits sans résultat de build réel. Le code sera sauvegardé comme checkpoint Manus, sans publication publique automatique.
