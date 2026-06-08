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

export default db
