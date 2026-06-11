import db from './db.js'

const ALLOWED_KEYS = new Set([
  'color_nouveau', 'color_in_progress', 'color_termine',
  'label_fr_nouveau', 'label_fr_in_progress', 'label_fr_termine',
  'label_mg_nouveau', 'label_mg_in_progress', 'label_mg_termine'
])

export function getKanbanSettings() {
  const rows = db.prepare('SELECT key, value FROM kanban_settings').all()
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

// Met à jour les paramètres autorisés, détecte les changements réels et les
// enregistre dans kanban_history pour constituer le journal d'audit.
export function updateKanbanSettings(updates) {
  const current = getKanbanSettings()
  const upsert  = db.prepare('INSERT OR REPLACE INTO kanban_settings (key, value) VALUES (?, ?)')
  const changes = {}

  const applyAndTrack = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_KEYS.has(key)) continue
      const strValue = String(value)
      if (current[key] !== strValue) {
        changes[key] = { from: current[key] ?? null, to: strValue }
      }
      upsert.run(key, strValue)
    }
    // N'insère dans l'historique que s'il y a eu au moins une vraie modification.
    if (Object.keys(changes).length > 0) {
      db.prepare('INSERT INTO kanban_history (changes) VALUES (?)').run(JSON.stringify(changes))
    }
  })

  applyAndTrack()
  return getKanbanSettings()
}

// Retourne les 30 dernières entrées du journal, du plus récent au plus ancien.
// "changes" est désérialisé en objet JS — le frontend reçoit directement l'objet.
export function getKanbanHistory() {
  return db.prepare(
    'SELECT id, changed_at, changes FROM kanban_history ORDER BY id DESC LIMIT 30'
  ).all().map(row => ({
    id:        row.id,
    changedAt: row.changed_at,
    changes:   JSON.parse(row.changes)
  }))
}
