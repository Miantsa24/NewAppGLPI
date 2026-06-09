import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './KanbanSettingsPage.css'

// Les 3 colonnes du Kanban — on les définit ici plutôt qu'en dur dans le JSX
// pour boucler proprement sur elles et éviter la répétition de code.
const COLUMNS = [
  { key: 'nouveau',     labelFr: 'Nouveau' },
  { key: 'in_progress', labelFr: 'In progress' },
  { key: 'termine',     labelFr: 'Terminé' }
]

// onLock : même rôle que dans les autres pages Backoffice — reverrouille l'accès.
function BackofficeKanbanSettingsPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  // "settings" contient les valeurs actuelles telles que renvoyées par l'API :
  // { color_nouveau, color_in_progress, color_termine, label_fr_..., label_mg_... }
  // On les charge une seule fois au montage, puis on les stocke localement dans
  // le formulaire (les champs contrôlés React).
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

  const [loadError, setLoadError]   = useState(false)
  const [saving,    setSaving]      = useState(false)
  const [saveResult, setSaveResult] = useState(null)  // null | 'success' | 'error'

  // Charge les paramètres existants pour pré-remplir les champs du formulaire.
  useEffect(() => {
    fetch('http://localhost:3001/api/kanban/settings')
      .then(r => r.json())
      .then(data => {
        if (!data.ok) { setLoadError(true); return }
        const s = data.settings
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
      })
      .catch(() => setLoadError(true))
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
        console.error('Échec de la sauvegarde des paramètres Kanban :', data.error)
        setSaveResult('error')
      } else {
        setSaveResult('success')
      }
    } catch (err) {
      console.error('Échec de la sauvegarde des paramètres Kanban :', err.message)
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

        {/* ── Section couleurs ──────────────────────────────────────────────── */}
        <section className="kanban-settings-page__section">
          <h2>Couleurs de fond</h2>
          <p className="kanban-settings-page__section-intro">
            Choisissez la couleur de fond de chaque colonne du Kanban.
          </p>
          <div className="kanban-settings-page__colors">
            {COLUMNS.map(({ key, labelFr }) => (
              <label key={key} className="kanban-settings-page__color-field">
                <span>{labelFr}</span>
                {/* "type=color" : sélecteur de couleur natif du navigateur — ouvre
                    la palette système. La valeur est toujours un code hex #rrggbb. */}
                <input
                  type="color"
                  value={colors[key]}
                  onChange={e => setColors(c => ({ ...c, [key]: e.target.value }))}
                />
                {/* Aperçu de la couleur avec le code hex — plus lisible que le
                    carré seul, surtout pour vérifier des nuances proches. */}
                <span className="kanban-settings-page__color-preview" style={{ background: colors[key] }}>
                  {colors[key]}
                </span>
              </label>
            ))}
          </div>
        </section>

        {/* ── Section noms malgaches ────────────────────────────────────────── */}
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
    </div>
    </Layout>
  )
}

export default BackofficeKanbanSettingsPage
