import Database from 'better-sqlite3'
import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// En ES modules ("type":"module" dans package.json), __dirname n'existe pas.
// On le reconstruit à partir de l'URL du fichier courant.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Chemin vers le dossier et le fichier SQLite : <racine>/data/newapp.db
const DATA_DIR = path.join(__dirname, '..', 'data')
const DB_PATH  = path.join(DATA_DIR, 'newapp.db')

// "data/" est dans .gitignore (la base ne doit pas être versionnée) : il n'existe
// donc pas après un clone. better-sqlite3 ne crée PAS le dossier automatiquement
// et lève une erreur s'il est absent → on le crée nous-mêmes avant d'ouvrir la base.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// Ouvre (ou crée) le fichier SQLite.
// SQLite ne nécessite pas de serveur séparé : tout est dans ce fichier.
const db = new Database(DB_PATH)

// Crée la table users si elle n'existe pas encore.
// Elle sert à mettre en cache les infos des utilisateurs GLPI localement.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    glpi_id     INTEGER UNIQUE NOT NULL,
    username    TEXT NOT NULL,
    email       TEXT,
    cached_at   TEXT DEFAULT (datetime('now'))
  )
`)

// Journal d'import : trace CHAQUE élément créé dans GLPI lors d'un import.
// Rôle double :
//   1. Réinitialisation (Phase 3) : pour supprimer "tout ce que l'import a créé",
//      il suffit de relire ce journal et de supprimer les items un par un.
//   2. Ordre des suppressions : "id" s'incrémente dans l'ordre de CRÉATION.
//      Une Location est forcément créée AVANT le Computer qui la référence
//      (sinon on n'aurait pas son id à donner). En supprimant dans l'ordre
//      INVERSE (du plus récent au plus ancien = LIFO, "Last In, First Out"),
//      on supprime donc toujours un item AVANT ce dont il dépend — exactement
//      ce qu'il faut pour ne jamais violer une contrainte de clé étrangère.
//   "label" est juste informatif (affiché à l'écran), pas utilisé pour la logique.
db.exec(`
  CREATE TABLE IF NOT EXISTS import_journal (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    glpi_itemtype TEXT NOT NULL,
    glpi_id       INTEGER NOT NULL,
    label         TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  )
`)

// Historique des modifications des paramètres Kanban.
// Une ligne par sauvegarde, "changes" = JSON des champs modifiés avec leurs anciennes
// et nouvelles valeurs — permet d'afficher un journal lisible dans le Backoffice.
db.exec(`
  CREATE TABLE IF NOT EXISTS kanban_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    changed_at TEXT DEFAULT (datetime('now')),
    changes    TEXT NOT NULL
  )
`)

// Paramètres du tableau Kanban (Phase 11/12) : 9 clés fixes.
// On utilise une table clé/valeur plutôt qu'une table à colonnes fixes pour
// pouvoir ajouter de nouveaux paramètres plus tard sans modifier le schéma.
// "INSERT OR IGNORE" : ne touche pas aux lignes déjà présentes (ex. si
// l'admin a déjà modifié une couleur, on ne l'écrase pas au redémarrage).
db.exec(`
  CREATE TABLE IF NOT EXISTS kanban_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`)

const KANBAN_DEFAULTS = [
  ['color_nouveau',        '#dbeafe'],
  ['color_in_progress',    '#fde8c8'],
  ['color_termine',        '#dcfce7'],
  ['label_fr_nouveau',     'Nouveau'],
  ['label_fr_in_progress', 'In progress'],
  ['label_fr_termine',     'Terminé'],
  ['label_mg_nouveau',     ''],
  ['label_mg_in_progress', ''],
  ['label_mg_termine',     '']
]

const insertDefault = db.prepare('INSERT OR IGNORE INTO kanban_settings (key, value) VALUES (?, ?)')
for (const [key, value] of KANBAN_DEFAULTS) {
  insertDefault.run(key, value)
}

// "Nouveaux" coûts fixes saisis par l'agent FrontOffice à la clôture d'un ticket
// (modale du Kanban) — distincts des coûts importés (TicketCost côté GLPI).
// "actiontime" (secondes) et "cost_time" (tarif horaire) suivent la même
// logique que l'import (Feuille 3) : le coût "temps passé" se calcule en
// cost_time × actiontime / 3600, comme pour les TicketCost GLPI.
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

// Migration : la table existait déjà sans actiontime/cost_time avant l'ajout
// de cette logique — on les ajoute si absentes (les lignes déjà enregistrées
// gardent leur valeur par défaut 0, donc leur coût "temps passé" reste nul).
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

// Migration : la colonne `type` a d'abord été ajoutée avec une affinité REAL
// et un défaut numérique (0) au lieu de 'cloture' — les lignes déjà
// enregistrées ont donc type=0, ce qui fait échouer les requêtes
// WHERE type = 'cloture'. On corrige ces lignes (toutes des coûts de clôture).
db.exec("UPDATE ticket_costs SET type = 'cloture' WHERE type = 0")

export default db
