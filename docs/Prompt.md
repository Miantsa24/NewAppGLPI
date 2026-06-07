j'ai un projet d'évaluation concernant le GLPI 11.0.7 (ExistingApp) à faire sur un système windows avec un php 8.2.12 et un mysql 8.0.45 à faire en plusieurs jours. 
pour le J-0, voici ce qu'on me demande de faire:
- Prendre le projet GLPI 11.0.7 sur https://www.glpi-project.org/fr/downloads/ 
- Le faire marcher en local
- Compréhension des modules principaux

voici les to do à venir:
- créer NewAPP : Nouvelles pages sur autre techno de votre choix en React-Vite , lié au projet existant (ExistingApp)
A préparer sur NewApp
dans NewApp on me demande de préparer ces suivants:
- Fonctionnalités de reinitialisation de données
- Import de fichier

points important(obligatoire):
- on utilisera SQLite
- l’échange de données avec l’API se fera au format Json

voici ce qui sont déjà fait:
-j'ai déjà le projet  GLPI 11 et il marche localement

voici notre plan d'étude pour cette J-0:
- faire la compréhension complète du projet GLPI(architecture + modules + workflow + base de donnée + tables relationnelles) [FAIT]
- API (compréhension + activation clé + appel/test API) [FAIT]
- création de NewApp en React-Vite(avec authentification entre NewApp et ExistingApp) et SQLite
- test de connexion entre ExistingApp et NewApp
- création des fonctionnalités(import + réinitialisation et autres)

il faut savoir que l'objectif pour cette évaluation c'est que j'arrive à coder à la main en sachant bien chaque fonction du code concernant la création de NewApp plus tard. donc je veux bien que tu mémorise chaque détails de nos conversations pour ne pas se perdre au milieu de route.


Phases proposées (ordre d'implémentation):
# Phase 1 — Authentification Backoffice par code unique
Code secret stocké côté serveur (.env ou table SQLite)
Formulaire à un seul champ, pré-rempli par défaut (selon l'énoncé)
Stockage de session (ex. sessionStorage) + garde de route (ProtectedRoute)
# Phase 2 — Import des 4 fichiers
Télécharger et analyser le contenu réel des 3 CSV + du ZIP d'images
Page d'upload multi-fichiers
Parsing CSV (lib csv-parse), extraction ZIP (lib adm-zip)
Mapping colonnes CSV → champs GLPI, appels API pour créer les items + lier les images
Journal d'import en SQLite + écran de résultat (succès/erreurs)
# Phase 3 — Réinitialisation des données
Bouton avec confirmation
Suppression via API GLPI des items du journal + vidage du journal SQLite
# Phase 4 — Dashboard Backoffice
Requêtes GLPI pour compter éléments par type + tickets par type
Cartes/composants d'affichage des statistiques
# Phase 5 — Page Tickets (liste + fiche)
Liste des tickets GLPI + page de détail (fiche)
# Phase 6 — FrontOffice : liste des éléments + recherche multicritère
Page liste avec filtres (type, statut, nom...)
# Phase 7 — FrontOffice : création de ticket avec association d'éléments
Formulaire de création + sélecteur multi-éléments → POST vers GLPI
# Phase 8 — Vérifications ExistingApp
Confirmer que les données importées apparaissent dans GLPI
Modifier une donnée dans GLPI, vérifier l'impact côté NewApp