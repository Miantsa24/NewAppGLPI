// ── Paramètres du tableau Kanban (lecture/écriture SQLite) ────────────────────
//
// Même principe que les autres modules serveur (dashboardData, ticketsData...) :
// toute la logique métier est ici, server/index.js ne fait qu'exposer les routes.
//
// On travaille avec la table kanban_settings(key, value) créée dans db.js.
// Les 9 clés sont fixes ; on ne permet pas d'en créer de nouvelles via ce module
// (updateKanbanSettings ignore les clés inconnues pour éviter les injections).

import db from './db.js'

// Liste exhaustive des clés autorisées — toute clé absente de ce Set est ignorée
// dans updateKanbanSettings, ce qui empêche d'écrire des données arbitraires.
const ALLOWED_KEYS = new Set([
  'color_nouveau', 'color_in_progress', 'color_termine',
  'label_fr_nouveau', 'label_fr_in_progress', 'label_fr_termine',
  'label_mg_nouveau', 'label_mg_in_progress', 'label_mg_termine'
])

// ── Lecture de tous les paramètres ────────────────────────────────────────────
// Retourne un objet plat { color_nouveau: '#dbeafe', label_fr_nouveau: 'Nouveau', ... }
// plus pratique à manipuler côté frontend qu'un tableau de { key, value }.
export function getKanbanSettings() {
  const rows = db.prepare('SELECT key, value FROM kanban_settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// ── Mise à jour partielle des paramètres ─────────────────────────────────────
// "updates" : objet partiel — seules les clés présentes ET autorisées sont mises
// à jour. On utilise une transaction SQLite : si une mise à jour échoue, toutes
// les autres sont annulées (atomicité — on ne laisse pas les paramètres dans un
// état partiellement modifié).
export function updateKanbanSettings(updates) {
  const upsert = db.prepare('INSERT OR REPLACE INTO kanban_settings (key, value) VALUES (?, ?)')

  // db.transaction() crée une fonction SQLite transactionnelle : son corps est
  // automatiquement entouré de BEGIN / COMMIT (ou ROLLBACK en cas d'erreur).
  const applyUpdates = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.has(key)) continue  // clé inconnue → ignorée silencieusement
      upsert.run(key, String(value))         // String() : sécurise contre les non-string
    }
  })

  applyUpdates()
  // Relit les paramètres après mise à jour pour renvoyer l'état final confirmé.
  return getKanbanSettings()
}
