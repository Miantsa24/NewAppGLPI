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
- faire la compréhension complète du projet GLPI(architecture + modules + workflow + base de donnée + tables relationnelles) 
- API (compréhension + activation clé + appel/test API) 
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

# Phase 9 — CRUD Éléments FrontOffice (Ordinateur, Écran, Autres)
FrontOffice : formulaire de création générique (Nom, N° série, Autre n° série, Commentaire) + 3 entrées de menu (Ordinateur / Écran / Autre élément — sélecteur de type pour les 4 types restants)
POST vers GLPI via proxy v2 avec le Bearer token de l'utilisateur connecté
Message de succès/erreur, formulaire réinitialisé après création pour en créer plusieurs à la suite
# Phase 10 — CRUD Éléments Backoffice (liste + fiche détail)
Backoffice : liste en direct depuis GLPI (via session v1) pour 3 menus (Ordinateurs / Écrans / Autres éléments)
Fiche détail : emplacement, fabricant, statut, numéros de série, commentaire — relations résolues via appels parallèles (Promise.all)
Composant générique unique pour les 6 types, paramétré par itemtype
# Phase 11 — Kanban FrontOffice (J-2)
Table SQLite kanban_settings : 3 couleurs de fond + labels FR + labels Malgaches (9 clés)
FrontOffice : page Kanban avec 3 colonnes (Nouveau / In progress / Terminé), couleurs et labels depuis l'API
Drag & drop HTML5 natif entre colonnes ; dialogue obligatoire (saisie de la solution) pour passer en Terminé
Sélecteur de langue FR/MG sur la page ; fallback sur le français si la traduction Malgache n'est pas configurée
Clic sur un ticket → modale de détail (titre, type, statut, priorité, date, description, éléments associés)
Bouton « Ajouter 1 ticket » (bas de la colonne Nouveau) → modale de création (Titre + Description)
# Phase 12 — Paramètres Kanban Backoffice (J-2)
Page Backoffice dédiée : 3 color pickers (couleurs de fond) + 3 champs texte (noms Malgaches)
Persistance dans SQLite via PUT /api/backoffice/kanban/settings
Lecture partagée via GET /api/kanban/settings (accessible aussi par le FrontOffice)


## Structure du projet
NEWAPPGLPI/
│
├── data/
├── dist/
├── docs/
├── node_modules/
├── public/
├── server/
├── shared/
│
├── src/
│   │
│   ├── api/
│   ├── assets/
│   │
│   ├── components/
│   │   ├── Layout.css
│   │   └── Layout.jsx
│   │
│   ├── pages/
│   │   │
│   │   ├── backoffice/
│   │   │   ├── AddCostPage.css
│   │   │   ├── AddCostPage.jsx
│   │   │   ├── DashboardPage.css
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── ElementDetailPage.css
│   │   │   ├── ElementDetailPage.jsx
│   │   │   ├── ElementsPage.css
│   │   │   ├── ElementsPage.jsx
│   │   │   ├── HomePage.css
│   │   │   ├── HomePage.jsx
│   │   │   ├── ImportPage.css
│   │   │   ├── ImportPage.jsx
│   │   │   ├── KanbanSettingsPage.css
│   │   │   ├── KanbanSettingsPage.jsx
│   │   │   ├── LoginPage.css
│   │   │   ├── LoginPage.jsx
│   │   │   ├── navLinks.js
│   │   │   ├── ResetPage.css
│   │   │   ├── ResetPage.jsx
│   │   │   ├── TicketDetailPage.css
│   │   │   ├── TicketDetailPage.jsx
│   │   │   ├── TicketsPage.css
│   │   │   └── TicketsPage.jsx
│   │   │
│   │   ├── frontoffice/
│   │   │   ├── CreateElementPage.css
│   │   │   ├── CreateElementPage.jsx
│   │   │   ├── CreateTicketPage.css
│   │   │   ├── CreateTicketPage.jsx
│   │   │   ├── DashboardPage.css
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── ElementsPage.css
│   │   │   ├── ElementsPage.jsx
│   │   │   ├── KanbanPage.css
│   │   │   ├── KanbanPage.jsx
│   │   │   ├── LoginPage.css
│   │   │   ├── LoginPage.jsx
│   │   │   └── navLinks.js
│   │   │
│   │   ├── CallbackPage.jsx
│   │   └── Home.jsx
│   │
│   ├── App.css
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
│
├── .env
├── .gitattributes
├── .gitignore
├── eslint.config.js
├── index.html
├── package-lock.json
├── package.json
├── README.md
└── vite.config.js