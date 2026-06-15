# 2. SQLite avec `better-sqlite3`

[← Retour au sommaire](README.md)

## Façon de faire

`better-sqlite3` est **synchrone** (pas de `await` sur les requêtes) et utilise
des requêtes **préparées** (paramètres `?` — jamais de concaténation de chaînes,
sinon injection SQL) :

| Méthode            | Quand l'utiliser                                   |
|--------------------|-----------------------------------------------------|
| `.run(...)`        | INSERT / UPDATE / DELETE (ne renvoie pas de lignes) |
| `.get(...)`        | SELECT qui renvoie **une seule ligne** (ou `undefined`) |
| `.all(...)`        | SELECT qui renvoie **un tableau de lignes**         |

```js
db.prepare('INSERT INTO table (col1, col2) VALUES (?, ?)').run(val1, val2)
db.prepare('SELECT * FROM table WHERE id = ?').get(id)
db.prepare('SELECT * FROM table').all()
```

## Extrait réel — [server/index.js:459-473](../../server/index.js#L459-L473)

```js
if (cancelLastCost) {
  const lastClosing = db.prepare(
    "SELECT id FROM ticket_costs WHERE ticket_id = ? AND type = 'cloture' ORDER BY id DESC LIMIT 1"
  ).get(Number(ticketId))
  if (lastClosing) db.prepare('DELETE FROM ticket_costs WHERE id = ?').run(lastClosing.id)
} else if (reopenPercent) {
  const lastClosing = db.prepare(
    "SELECT actiontime, cost_time, cost_fixed FROM ticket_costs WHERE ticket_id = ? AND type = 'cloture' ORDER BY id DESC LIMIT 1"
  ).get(Number(ticketId))
  if (lastClosing) {
    const lastAmount = Number(lastClosing.cost_time) * Number(lastClosing.actiontime) / 3600 + Number(lastClosing.cost_fixed)
    const reopenAmount = lastAmount * (parseFloat(reopenPercent) / 100)
    if (reopenAmount > 0) {
      db.prepare("INSERT INTO ticket_costs (ticket_id, actiontime, cost_time, cost_fixed, type) VALUES (?, 0, 0, ?, 'reouverture')")
        .run(Number(ticketId), reopenAmount)
    }
  }
}
```

---

## Fonctionnement détaillé, bloc par bloc — `server/db.js`

`db.js` n'a pas vraiment de "fonctions" : c'est un **script d'initialisation**
qui s'exécute UNE SEULE FOIS, au premier `import db from './db.js'` (Node met
en cache le module — toutes les autres parties du code qui l'importent
reçoivent la **même** instance `db`, donc la **même** connexion SQLite). Voici
ce que fait chaque bloc, dans l'ordre.

### 1) Localiser/créer le fichier de base — [db.js:6-23](../../server/db.js#L6-L23)

```js
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH  = path.join(DATA_DIR, 'newapp.db')

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const db = new Database(DB_PATH)
```

- `import.meta.url` : en modules ES (`"type": "module"`), il n'y a pas de
  `__dirname` global comme en CommonJS — on le reconstruit à partir de l'URL
  du fichier courant.
- `data/` est dans `.gitignore` : après un `git clone`, ce dossier n'existe
  pas. `better-sqlite3` ne le crée **pas** automatiquement et planterait — donc
  on le crée nous-mêmes avec `fs.mkdirSync(..., { recursive: true })` avant
  d'ouvrir la base.
- `new Database(DB_PATH)` : ouvre le fichier `data/newapp.db` (le crée s'il
  n'existe pas). Pas de serveur séparé : tout est dans ce fichier.

### 2) Création des tables — `db.exec(\`CREATE TABLE IF NOT EXISTS ...\`)`

Quatre tables sont créées ainsi : `users`, `import_journal`, `kanban_history`,
`kanban_settings`, `ticket_costs`. `IF NOT EXISTS` : si la table existe déjà
(redémarrage du serveur sur une base existante), `CREATE TABLE` ne fait rien —
pas d'erreur, pas de perte de données.

Exemple — [db.js:103-113](../../server/db.js#L103-L113) :

```js
db.exec(`
  CREATE TABLE IF NOT EXISTS ticket_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    actiontime INTEGER NOT NULL DEFAULT 0,
    cost_time REAL NOT NULL DEFAULT 0,
    cost_fixed REAL NOT NULL,
    type TEXT NOT NULL DEFAULT 'cloture',
    created_at TEXT DEFAULT(datetime('now'))
  )
`)
```

- `db.exec(sql)` : exécute du SQL **sans paramètres** et **sans résultat**
  attendu — utilisé uniquement pour le DDL (créer/modifier des tables), jamais
  pour des requêtes avec des valeurs variables (utiliser `.prepare()` pour ça).
- `id INTEGER PRIMARY KEY AUTOINCREMENT` : clé auto-incrémentée, l'ordre des
  id = l'ordre d'insertion (important pour le tri `ORDER BY id DESC`, qui
  donne "la dernière ligne insérée").
- `type TEXT NOT NULL DEFAULT 'cloture'` : si une ligne est insérée sans
  préciser `type`, elle vaut `'cloture'` par défaut.

### 3) Valeurs par défaut — `INSERT OR IGNORE` — [db.js:81-96](../../server/db.js#L81-L96)

```js
const KANBAN_DEFAULTS = [
  ['color_nouveau',        '#dbeafe'],
  ['color_in_progress',    '#fde8c8'],
  // ...
]

const insertDefault = db.prepare('INSERT OR IGNORE INTO kanban_settings (key, value) VALUES (?, ?)')
for (const [key, value] of KANBAN_DEFAULTS) {
  insertDefault.run(key, value)
}
```

- `db.prepare(sql)` : compile la requête **une fois**, renvoie un objet
  réutilisable (`insertDefault`) qu'on appelle ensuite plusieurs fois avec
  `.run(...)` — plus efficace que de "préparer" dans la boucle.
- `INSERT OR IGNORE` : si une ligne avec cette clé primaire (`key`) existe déjà,
  l'instruction est **ignorée silencieusement** (pas d'erreur) — donc au
  redémarrage, les valeurs déjà personnalisées par l'utilisateur ne sont
  **jamais écrasées**, seules les clés manquantes sont ajoutées.

### 4) Migrations "à la main" — `PRAGMA table_info` + `ALTER TABLE` — [db.js:118-127](../../server/db.js#L118-L127)

SQLite ne sait pas modifier facilement le schéma d'une table existante (pas de
`ALTER COLUMN`). La technique : vérifier colonne par colonne si elle existe,
et l'ajouter si besoin.

```js
const ticketCostsColumns = db.prepare("PRAGMA table_info(ticket_costs)").all().map(c => c.name)
if (!ticketCostsColumns.includes('actiontime')) {
  db.exec('ALTER TABLE ticket_costs ADD COLUMN actiontime INTEGER NOT NULL DEFAULT 0')
}
if (!ticketCostsColumns.includes('cost_time')) {
  db.exec('ALTER TABLE ticket_costs ADD COLUMN cost_time REAL NOT NULL DEFAULT 0')
}
if (!ticketCostsColumns.includes('type')) {
  db.exec("ALTER TABLE ticket_costs ADD COLUMN type TEXT NOT NULL DEFAULT 'cloture'")
}
```

- `PRAGMA table_info(<table>)` : requête spéciale SQLite qui renvoie une ligne
  par colonne de la table, avec son `name`, son type déclaré, etc.
- `.all().map(c => c.name)` : transforme ce résultat en simple tableau de noms
  de colonnes, ex. `['id', 'ticket_id', 'actiontime', ...]`.
- `if (!columns.includes('actiontime'))` : si la colonne n'existe pas encore
  (base créée AVANT l'ajout de cette fonctionnalité), on l'ajoute avec
  `ALTER TABLE ... ADD COLUMN` et une valeur par défaut — les lignes
  existantes reçoivent cette valeur par défaut automatiquement.
- Ce bloc s'exécute à **chaque démarrage du serveur**, mais après la première
  migration les `if` sont tous faux → aucune action, juste 3 `PRAGMA` rapides.

### 5) Migration de DONNÉES (pas seulement de schéma) — [db.js:129-133](../../server/db.js#L129-L133)

```js
// Migration : la colonne `type` a d'abord été ajoutée avec une affinité REAL
// et un défaut numérique (0) au lieu de 'cloture' — les lignes déjà
// enregistrées ont donc type=0, ce qui fait échouer les requêtes
// WHERE type = 'cloture'. On corrige ces lignes (toutes des coûts de clôture).
db.exec("UPDATE ticket_costs SET type = 'cloture' WHERE type = 0")
```

- Contrairement aux blocs précédents (qui modifient la **structure** des
  tables), celui-ci corrige les **données déjà stockées** — une migration
  "de données", nécessaire quand un bug a laissé des lignes dans un état
  incohérent (voir l'historique du bug ci-dessous).
- `db.exec(...)` à nouveau (pas de paramètre variable, donc pas besoin de
  `.prepare()`).

### 6) Export — [db.js:135](../../server/db.js#L135)

```js
export default db
```

- Toutes les autres fonctions du serveur (`server/ticketsData.js`,
  `server/index.js`, etc.) font `import db from './db.js'` et utilisent
  directement `db.prepare(...)` — c'est la **même connexion** partout (module
  Node mis en cache).

---

## Le piège qu'on a rencontré : "affinité de type" SQLite

On a eu un vrai bug de ce type dans ce projet : la colonne `type` avait été
créée une première fois en `REAL NOT NULL DEFAULT 0`. Du coup :
- les lignes existantes avaient `type = 0` (un nombre), **pas** `'cloture'` (texte)
- la requête `WHERE type = 'cloture'` ne matchait **jamais rien**
- conséquence en cascade : `lastClosing` était toujours `undefined`, donc
  l'`INSERT` du coût de réouverture ne s'exécutait jamais — et côté frontend,
  les colonnes "Coût de réouverture" restaient à 0 alors que le total général
  augmentait (le montant partait dans `newCostByTicket` au lieu de
  `reopenCostByTicket`, voir [03-calcul-couts.md](03-calcul-couts.md)).

**Correctif** : une requête de migration de **données** (pas seulement de
schéma), montrée au point 5 ci-dessus :
```js
db.exec("UPDATE ticket_costs SET type = 'cloture' WHERE type = 0")
```

---

## Fonctionnement détaillé — l'extrait de `server/index.js`

Le bloc `cancelLastCost` / `reopenPercent` ([index.js:459-473](../../server/index.js#L459-L473))
fait partie de la route PATCH `/api/frontoffice/kanban-tickets/:id/status`
(voir [06-express-routes.md](06-express-routes.md) pour la route complète).
Décomposition requête par requête :

**Cas `cancelLastCost` (bouton "Annuler")** :
```js
const lastClosing = db.prepare(
  "SELECT id FROM ticket_costs WHERE ticket_id = ? AND type = 'cloture' ORDER BY id DESC LIMIT 1"
).get(Number(ticketId))
if (lastClosing) db.prepare('DELETE FROM ticket_costs WHERE id = ?').run(lastClosing.id)
```
- `SELECT id FROM ... WHERE ticket_id = ? AND type = 'cloture' ORDER BY id DESC LIMIT 1`
  : parmi tous les coûts de **clôture** de ce ticket, prend **le plus récent**
  (`ORDER BY id DESC` = id décroissant, `LIMIT 1` = un seul résultat).
- `.get(Number(ticketId))` : `.get` car on attend **une seule ligne** (ou
  `undefined` si le ticket n'a aucun coût de clôture).
- `if (lastClosing)` : protège contre le cas où aucune ligne n'a été trouvée —
  sans ce test, `lastClosing.id` planterait (`Cannot read properties of
  undefined`).
- `DELETE FROM ticket_costs WHERE id = ?` : supprime cette ligne précise par
  son `id` (clé primaire) — jamais par `ticket_id` seul, qui supprimerait
  TOUS les coûts du ticket.

**Cas `reopenPercent` (bouton "Réouverture")** :
```js
const lastClosing = db.prepare(
  "SELECT actiontime, cost_time, cost_fixed FROM ticket_costs WHERE ticket_id = ? AND type = 'cloture' ORDER BY id DESC LIMIT 1"
).get(Number(ticketId))
if (lastClosing) {
  const lastAmount = Number(lastClosing.cost_time) * Number(lastClosing.actiontime) / 3600 + Number(lastClosing.cost_fixed)
  const reopenAmount = lastAmount * (parseFloat(reopenPercent) / 100)
  if (reopenAmount > 0) {
    db.prepare("INSERT INTO ticket_costs (ticket_id, actiontime, cost_time, cost_fixed, type) VALUES (?, 0, 0, ?, 'reouverture')").run(Number(ticketId), reopenAmount)
  }
}
```
- Même `SELECT` que ci-dessus, mais cette fois on récupère les **colonnes de
  calcul** (`actiontime`, `cost_time`, `cost_fixed`) au lieu de juste `id`,
  car on ne supprime rien : on s'en sert comme **base de calcul**.
- `lastAmount = cost_time × actiontime / 3600 + cost_fixed` : reconstruit le
  montant total du dernier coût de clôture (même formule que partout ailleurs
  — temps passé converti en heures × tarif horaire, plus un montant fixe).
- `reopenAmount = lastAmount × (reopenPercent / 100)` : applique le
  pourcentage saisi par l'utilisateur (ex. 10 → `× 0.10`).
- `if (reopenAmount > 0)` : on n'insère une ligne que si le montant est
  positif — évite des lignes "coût de réouverture = 0" inutiles.
- `INSERT INTO ticket_costs (..., type) VALUES (?, 0, 0, ?, 'reouverture')` :
  remarquer les **deux `0` littéraux** pour `actiontime`/`cost_time` — le coût
  de réouverture est stocké **uniquement** comme un `cost_fixed` (le montant
  déjà calculé), donc pas besoin de retenir un temps/tarif horaire pour cette
  ligne. Le nombre de `?` (2) doit correspondre au nombre d'arguments de
  `.run()` (`Number(ticketId), reopenAmount` = 2) — les `0` et `'reouverture'`
  sont des valeurs **fixes** écrites directement dans le SQL, pas des `?`.

---

## À retenir pour coder à la main

- Une requête préparée **sans tous les `?` correspondants** = erreur à
  l'exécution (pas à l'écriture du code) → toujours compter les `?` et les
  arguments de `.run()/.get()`.
- `INSERT INTO t (a, b, c) VALUES (?, ?, ?)` : le nombre de colonnes **doit**
  correspondre au nombre de valeurs (`?` ou littéraux comme `0`, `'texte'`).
- Si une requête `WHERE colonne = 'texte'` ne retourne jamais rien alors que
  les données semblent correctes → vérifier le **type réel stocké** avec :
  ```js
  db.prepare('SELECT *, typeof(colonne) FROM table').all()
  ```
- `.get()` peut renvoyer `undefined` — toujours tester avec `if (resultat)`
  avant d'accéder à ses propriétés.
- `ORDER BY id DESC LIMIT 1` = "la dernière ligne insérée correspondant à ce
  filtre" — pattern très utilisé dans ce projet pour retrouver "le dernier
  coût de clôture" d'un ticket.
