# GLPI 11.0.7 - Synthèse complète et sans répétition

## Contexte

- GLPI 11.0.7 est l'application existante.
- Environnement local : Windows, PHP 8.2.12, MySQL 8.0.45.
- Future application : React-Vite + SQLite.
- Les échanges entre les deux applications se feront en JSON via l'API REST de GLPI.

## Vue d'ensemble

GLPI est une application web PHP/MySQL de gestion de parc informatique et de support ITSM. Elle sert à gérer les utilisateurs, les actifs, les tickets, les documents, les entités et les règles d'accès. L'architecture est classique : interface web côté navigateur, traitement PHP côté serveur, et persistance dans MySQL.

### Chaîne générale

Navigateur -> pages PHP -> classes métier -> base MySQL

## Architecture importante

### Couches principales

- Couche client : interface HTML, CSS et JavaScript, avec quelques appels AJAX et l'API REST.
- Couche application : fichiers d'entrée comme front/ ou index.php, logique métier dans src/, vues Twig dans templates/.
- Couche métier : classes PHP de GLPI, souvent basées sur CommonDBTM pour le CRUD.
- Couche données : base MySQL structurée en tables préfixées par glpi_.

### Dossiers à retenir

- front/ : points d'entrée des pages web.
- src/ : classes métier principales.
- templates/ : vues Twig.
- ajax/ : traitements asynchrones internes.
- config/ : configuration, dont la connexion BDD.
- install/ : installation et migration.
- plugins/ : extensions.
- public/ : ressources statiques.

## Modules principaux

### Helpdesk et ITIL

GLPI gère les incidents, demandes, problèmes et changements. Le module ticket est le cœur fonctionnel pour le support utilisateur.

Tables principales :

- glpi_tickets
- glpi_tickets_users
- glpi_itilcategories
- glpi_itilfollowups
- glpi_itilsolutions
- glpi_tickettasks

### Parc informatique

Ce module couvre l'inventaire des équipements et composants associés : ordinateurs, écrans, imprimantes, téléphones, équipements réseau, logiciels et périphériques.

Tables principales :

- glpi_computers
- glpi_monitors
- glpi_printers
- glpi_phones
- glpi_networkequipments
- glpi_softwares

### Utilisateurs, profils et groupes

GLPI gère les comptes, les rôles, les groupes et les droits par entité.

Tables principales :

- glpi_users
- glpi_profiles
- glpi_groups
- glpi_profiles_users
- glpi_groups_users

### Entités et droits

Le système multi-entités permet de cloisonner les données et d'appliquer des droits différents selon le périmètre.

Table principale :

- glpi_entities

### Documents

Les documents peuvent être importés puis liés à un ticket, un équipement ou un autre objet.

Tables principales :

- glpi_documents
- glpi_documents_items

## Workflow d'un ticket

Le cycle utile à retenir est le suivant : création, affectation, traitement, résolution, puis fermeture.

### États principaux

- 1 : Nouveau
- 2 : En cours / affecté
- 3 : En attente
- 5 : Résolu
- 6 : Clos

### Étapes et tables

- Création du ticket -> glpi_tickets.
- Affectation d'un demandeur, technicien ou observateur -> glpi_tickets_users.
- Suivis et commentaires -> glpi_itilfollowups.
- Tâches techniques -> glpi_tickettasks.
- Solution -> glpi_itilsolutions.
- Notification des acteurs -> glpi_notifications.

## Modèle de données à retenir

### Principes récurrents

- Toutes les tables importantes utilisent le préfixe glpi_.
- entities_id est présent dans la majorité des objets pour gérer le multi-entités.
- CommonDBTM est la classe mère la plus fréquente pour le CRUD.
- Les relations N:N passent souvent par des tables de liaison.
- Le couple items_id + itemtype sert à relier un enregistrement à plusieurs types d'objets.

### Tables clés

#### glpi_tickets

Contient les informations principales du ticket : titre, contenu, statut, priorité, type, dates, catégorie, entité.

#### glpi_tickets_users

Table de liaison entre tickets et utilisateurs.

- tickets_id : ticket lié
- users_id : utilisateur lié
- type : rôle dans le ticket

Types à retenir :

- 1 : demandeur
- 2 : technicien affecté
- 3 : observateur

#### glpi_users

Contient le login, le nom, le prénom, l'email, le profil et l'entité.

#### glpi_itilcategories

Catégories ITIL utilisées pour classer les tickets et filtrer le helpdesk.

#### glpi_itilfollowups

Historique des messages et actions sur un ticket.

#### glpi_itilsolutions

Solutions associées à un ticket.

#### glpi_computers

Table de base pour les ordinateurs et leur affectation technique.

## Relations essentielles

Le schéma à garder en tête est simple :

- glpi_users est lié aux tickets via glpi_tickets_users.
- glpi_tickets est enrichi par les suivis, tâches et solutions.
- glpi_computers et les autres actifs peuvent être liés aux documents et aux tickets.
- glpi_entities influence presque tous les objets métier.

## API REST

GLPI expose une API REST centrale, utilisée plus tard par NewApp.

### Ce qu'il faut retenir

- Point d'entrée unique de l'API REST.
- Échanges en JSON.
- Opérations de base : GET, POST, PUT, DELETE.
- Cas d'usage prioritaire : lecture et synchronisation des données utiles à NewApp.

### Ressources les plus utiles pour NewApp

- glpi_users
- glpi_tickets
- glpi_documents
- glpi_computers
- glpi_entities

## Ce qu'il faut vraiment retenir pour la suite

1. GLPI est une application PHP/MySQL structurée autour de modules métier et d'une base très normalisée.
2. Le cœur fonctionnel pour l'évaluation est le workflow ticket, les utilisateurs, les entités et les documents.
3. Les patterns de base à reconnaître sont les tables de liaison, entities_id et le couple items_id/itemtype.
4. NewApp communiquera avec GLPI en JSON via l'API REST, puis stockera localement les données utiles dans SQLite.
5. Les futures fonctions à concevoir dans NewApp seront l'import de fichier et la réinitialisation des données.

## Schéma de liaison avec NewApp

GLPI MySQL -> API PHP JSON -> React-Vite NewApp -> SQLite local
