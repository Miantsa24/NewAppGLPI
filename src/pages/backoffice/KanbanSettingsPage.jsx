import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './KanbanSettingsPage.css'

const COLUMNS = [
  { key: 'nouveau',     labelFr: 'Nouveau' },
  { key: 'in_progress', labelFr: 'In progress' },
  { key: 'termine',     labelFr: 'Terminé' }
]

// Libellés lisibles pour chaque clé de paramètre (affiché dans l'historique).
const FIELD_LABELS = {
  color_nouveau:        'Couleur Nouveau',
  color_in_progress:    'Couleur In progress',
  color_termine:        'Couleur Terminé',
  label_fr_nouveau:     'Label FR Nouveau',
  label_fr_in_progress: 'Label FR In progress',
  label_fr_termine:     'Label FR Terminé',
  label_mg_nouveau:     'Label MG Nouveau',
  label_mg_in_progress: 'Label MG In progress',
  label_mg_termine:     'Label MG Terminé'
}

// Détecte si une clé correspond à une couleur (pour afficher un swatch).
function isColorKey(key) { return key.startsWith('color_') }

// Formate un horodatage SQLite "YYYY-MM-DD HH:MM:SS" en date locale lisible.
function formatDate(sqliteDate) {
  if (!sqliteDate) return '—'
  const d = new Date(sqliteDate.replace(' ', 'T') + 'Z')
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function BackofficeKanbanSettingsPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  const [colors, setColors] = useState({
    nouveau:     '#dbeafe',
    in_progress: '#fde8c8',
    termine:     '#dcfce7'
  })
  const [labelsMg, setLabelsMg] = useState({
    nouveau:     '',
    in_progress: '',
    termine:     ''
  })

  const [loadError,  setLoadError]  = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saveResult, setSaveResult] = useState(null)

  // Historique des modifications — rechargé après chaque sauvegarde réussie.
  const [history,        setHistory]        = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = useCallback(() => {
    setHistoryLoading(true)
    fetch('http://localhost:3001/api/backoffice/kanban/history')
      .then(r => r.json())
      .then(data => { if (data.ok) setHistory(data.history) })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [])

  useEffect(() => {
    // Chargement initial des paramètres ET de l'historique en parallèle.
    Promise.all([
      fetch('http://localhost:3001/api/kanban/settings').then(r => r.json()),
      fetch('http://localhost:3001/api/backoffice/kanban/history').then(r => r.json())
    ])
      .then(([settingsData, historyData]) => {
        if (!settingsData.ok) { setLoadError(true); return }
        const s = settingsData.settings
        setColors({
          nouveau:     s.color_nouveau,
          in_progress: s.color_in_progress,
          termine:     s.color_termine
        })
        setLabelsMg({
          nouveau:     s.label_mg_nouveau,
          in_progress: s.label_mg_in_progress,
          termine:     s.label_mg_termine
        })
        if (historyData.ok) setHistory(historyData.history)
      })
      .catch(() => setLoadError(true))
      .finally(() => setHistoryLoading(false))
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setSaveResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/backoffice/kanban/settings', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          color_nouveau:        colors.nouveau,
          color_in_progress:    colors.in_progress,
          color_termine:        colors.termine,
          label_mg_nouveau:     labelsMg.nouveau,
          label_mg_in_progress: labelsMg.in_progress,
          label_mg_termine:     labelsMg.termine
        })
      })
      const data = await response.json()
      if (!data.ok) {
        console.error('Échec sauvegarde paramètres Kanban :', data.error)
        setSaveResult('error')
      } else {
        setSaveResult('success')
        loadHistory()
      }
    } catch (err) {
      console.error('Échec sauvegarde paramètres Kanban :', err.message)
      setSaveResult('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="kanban-settings-page">
      <h1>Paramètres du Kanban</h1>
      <p className="kanban-settings-page__intro">
        Personnalisez les couleurs de fond de chaque colonne et les noms en malgache affichés
        dans le tableau Kanban du FrontOffice.
      </p>

      {loadError && (
        <p className="kanban-settings-page__error">
          Impossible de charger les paramètres actuels. Réessayez dans quelques instants.
        </p>
      )}

      <form onSubmit={handleSubmit} className="kanban-settings-page__form">

        <section className="kanban-settings-page__section">
          <h2>Couleurs de fond</h2>
          <p className="kanban-settings-page__section-intro">
            Choisissez la couleur de fond de chaque colonne du Kanban.
          </p>
          <div className="kanban-settings-page__colors">
            {COLUMNS.map(({ key, labelFr }) => (
              <label key={key} className="kanban-settings-page__color-field">
                <span>{labelFr}</span>
                <input
                  type="color"
                  value={colors[key]}
                  onChange={e => setColors(c => ({ ...c, [key]: e.target.value }))}
                />
                <span className="kanban-settings-page__color-preview" style={{ background: colors[key] }}>
                  {colors[key]}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="kanban-settings-page__section">
          <h2>Noms en malgache</h2>
          <p className="kanban-settings-page__section-intro">
            Saisissez la traduction malgache de chaque statut. Laissez vide pour
            que le FrontOffice affiche le nom français par défaut.
          </p>
          <div className="kanban-settings-page__labels">
            {COLUMNS.map(({ key, labelFr }) => (
              <label key={key} className="kanban-settings-page__label-field">
                <span>{labelFr}</span>
                <input
                  type="text"
                  value={labelsMg[key]}
                  onChange={e => setLabelsMg(l => ({ ...l, [key]: e.target.value }))}
                  placeholder={`Traduction de « ${labelFr} »…`}
                />
              </label>
            ))}
          </div>
        </section>

        {saveResult === 'success' && (
          <p className="kanban-settings-page__success">Paramètres enregistrés avec succès.</p>
        )}
        {saveResult === 'error' && (
          <p className="kanban-settings-page__error">L'enregistrement a échoué. Réessayez.</p>
        )}

        <button type="submit" disabled={saving} className="kanban-settings-page__submit">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>

      {/* ── Historique des modifications ─────────────────────────────────────── */}
      <section className="kanban-settings-page__history">
        <h2>Historique des modifications</h2>
        <p className="kanban-settings-page__intro">
          Les 30 dernières sauvegardes qui ont modifié au moins un paramètre.
        </p>

        {historyLoading && <p className="kanban-settings-page__history-empty">Chargement…</p>}

        {!historyLoading && history.length === 0 && (
          <p className="kanban-settings-page__history-empty">Aucune modification enregistrée pour l'instant.</p>
        )}

        {!historyLoading && history.length > 0 && (
          <ul className="kanban-settings-page__history-list">
            {history.map(entry => (
              <li key={entry.id} className="kanban-settings-page__history-entry">
                <span className="kanban-settings-page__history-date">{formatDate(entry.changedAt)}</span>
                <ul className="kanban-settings-page__history-changes">
                  {Object.entries(entry.changes).map(([key, { from, to }]) => (
                    <li key={key} className="kanban-settings-page__history-change">
                      <span className="kanban-settings-page__history-field">
                        {FIELD_LABELS[key] ?? key}
                      </span>
                      {isColorKey(key) ? (
                        // Pour les couleurs : affiche un swatch + le code hex
                        <span className="kanban-settings-page__history-value">
                          <span className="kanban-settings-page__swatch" style={{ background: from ?? 'transparent' }} title={from} />
                          {from ?? '—'}
                          {' → '}
                          <span className="kanban-settings-page__swatch" style={{ background: to }} title={to} />
                          {to}
                        </span>
                      ) : (
                        // Pour les labels texte : affiche la valeur brute (ou "vide")
                        <span className="kanban-settings-page__history-value">
                          <em>{from || '(vide)'}</em>
                          {' → '}
                          <em>{to || '(vide)'}</em>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </Layout>
  )
}

export default BackofficeKanbanSettingsPage
