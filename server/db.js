import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

// En ES modules ("type":"module" dans package.json), __dirname n'existe pas.
// On le reconstruit à partir de l'URL du fichier courant.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Chemin vers le fichier SQLite : <racine>/data/newapp.db
const DB_PATH = path.join(__dirname, '..', 'data', 'newapp.db')

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

export default db
