# Guide — Comprendre et reproduire les parties "difficiles" du code

Ce guide est découpé en plusieurs fichiers, un par sujet. Pour chacun, on
retrouve la même structure :

1. **Façon de faire** — la recette générale, indépendante de ce projet.
2. **Extrait réel** — le code de NewAppGLPI qui l'illustre, avec lien vers le
   fichier source.
3. **Fonctionnement détaillé, fonction par fonction** — pour chaque fonction
   citée : ce qu'elle reçoit en entrée, ce que fait chaque bloc important, et
   ce qu'elle renvoie.
4. **À retenir pour coder à la main** — les pièges et règles à mémoriser pour
   une évaluation.

## Sommaire

1. [Sessions GLPI (API v1)](01-sessions-glpi.md) — `openSession`/`closeSession`,
   CRUD générique (`getItem`, `listItems`, `createItem`...), upload de documents.
2. [SQLite avec better-sqlite3](02-sqlite.md) — `prepare/run/get/all`,
   migrations (`ALTER TABLE`, `PRAGMA table_info`), le bug d'affinité de type.
3. [Calcul des coûts](03-calcul-couts.md) — agrégation avec `Map`, `reduce`,
   répartition par élément (`listCostsByAsset`, `totalsByType`, `grandTotal`).
4. [Kanban : drag & drop + état React](04-kanban-drag-drop.md) — drag & drop
   HTML5 natif, mise à jour optimiste de l'état (`patchStatus`, `handleDrop`).
5. [Popups / Modales React](05-modales.md) — `SolveModal`, `ReopenModal`,
   `DetailModal`, et les handlers qui les pilotent.
6. [Express : routes & middlewares](06-express-routes.md) — convention
   `{ ok, ... }`, `requireBackofficeCode`, la route de changement de statut Kanban.
7. [Gestion des tickets (Backoffice)](07-gestion-tickets.md) — CRUD complet :
   liste, fiche détail, modification, suppression (codes bruts vs libellés).
8. [Ajouter une statistique au Dashboard](08-dashboard.md) — recette en 3 étapes
   + explication complète de `getDashboardStats`.
9. [Autres patterns utiles](09-autres-patterns.md) — SSE (progression en temps
   réel), "find-or-create" (import + création FrontOffice).

## Comment utiliser ce guide pour réviser

- Si tu dois comprendre **une feature précise** (ex. "comment marche le
  Kanban ?"), va directement au fichier correspondant.
- Si tu dois **coder une fonctionnalité similaire à la main** (évaluation),
  lis d'abord "Façon de faire", puis relis l'extrait réel en te demandant
  *"est-ce que je saurais ré-écrire ça sans regarder ?"*, puis vérifie avec
  "À retenir".
- Les liens `[fichier.js:12-34](../../server/fichier.js#L12-L34)` pointent vers
  le code source réel — ouvre-les pour voir le contexte complet autour de
  l'extrait.
