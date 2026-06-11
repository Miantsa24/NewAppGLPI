import { useState, useEffect, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession, backofficeFetch } from './api.js'
import './TicketDetailPage.css'

// Options des <select> du formulaire de modification — mêmes codes que les
// dictionnaires TICKET_TYPES/STATUSES/PRIORITIES de server/ticketsData.js.
// Le serveur renvoie déjà les codes bruts via typeId/statusId/priorityId
// (ajoutés à describeTicket), ce qui permet de préremplir ces <select>.
const TYPE_OPTIONS = [
  { value: 1, label: 'Incident' },
  { value: 2, label: 'Demande' }
]
const STATUS_OPTIONS = [
  { value: 1, label: 'Nouveau' },
  { value: 2, label: 'En cours (attribué)' },
  { value: 6, label: 'Clos' }
]
const PRIORITY_OPTIONS = [
  { value: 1, label: 'Très basse' },
  { value: 2, label: 'Basse' },
  { value: 3, label: 'Moyenne' },
  { value: 4, label: 'Haute' },
  { value: 5, label: 'Très haute' },
  { value: 6, label: 'Majeure' }
]

// useParams() lit les segments dynamiques de l'URL définis dans App.jsx
// (ex. "/backoffice/tickets/:id" → { id: "5" }). C'est l'équivalent React-Router
// de récupérer un paramètre dans une route Express (req.params.id côté serveur).
// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeTicketDetailPage({ onLock }) {
  const { id } = useParams()
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
    onLock()
    navigate('/backoffice/login')
  }

  const [ticket,  setTicket]  = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  // Mode édition : "form" contient une copie modifiable des champs du ticket
  // (codes bruts pour les <select>) ; null tant qu'on n'a pas cliqué "Modifier".
  const [editing,   setEditing]   = useState(false)
  const [form,      setForm]      = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [deleting,    setDeleting]    = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // useCallback : on réutilise loadTicket après un PUT réussi pour réafficher
  // la fiche avec les libellés à jour, sans dupliquer la logique de fetch.
  const loadTicket = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`http://localhost:3001/api/backoffice/tickets/${id}`)
      const data = await response.json()
      if (data.ok) {
        setTicket(data.ticket)
      } else {
        // Le détail technique part dans la console — l'utilisateur ne voit
        // qu'un message en texte clair (pas de JSON brut à l'écran).
        console.error('Échec du chargement du ticket :', data.error)
        setError(true)
      }
    } catch (err) {
      console.error('Échec du chargement du ticket :', err.message)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setTicket(null)
    loadTicket()
  }, [loadTicket])

  function startEditing() {
    setForm({
      name:     ticket.name,
      content:  ticket.content ?? '',
      type:     ticket.typeId,
      status:   ticket.statusId,
      priority: ticket.priorityId
    })
    setSaveError(null)
    setEditing(true)
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setSaveError(null)

    try {
      const response = await backofficeFetch(`http://localhost:3001/api/backoffice/tickets/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form)
      })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec de la modification du ticket :', data.error)
        setSaveError('La modification a échoué. Réessayez.')
        return
      }
      setEditing(false)
      await loadTicket()
    } catch (err) {
      console.error('Échec de la modification du ticket :', err.message)
      setSaveError('La modification a échoué. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Supprimer définitivement le ticket "${ticket.name}" ?\n\n` +
      'Cette action est IRRÉVERSIBLE : le ticket et ses éléments/coûts associés seront effacés de GLPI.'
    )
    if (!confirmed) return

    setDeleting(true)
    setDeleteError(null)

    try {
      const response = await backofficeFetch(`http://localhost:3001/api/backoffice/tickets/${id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!data.ok) {
        console.error('Échec de la suppression du ticket :', data.error)
        setDeleteError('La suppression a échoué. Réessayez.')
        setDeleting(false)
        return
      }
      navigate('/backoffice/tickets')
    } catch (err) {
      console.error('Échec de la suppression du ticket :', err.message)
      setDeleteError('La suppression a échoué. Réessayez.')
      setDeleting(false)
    }
  }

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="ticket-detail-page">
      <Link to="/backoffice/tickets" className="ticket-detail-page__back">← Retour à la liste des tickets</Link>

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="ticket-detail-page__error">
          Impossible de charger ce ticket. Réessayez dans quelques instants.
        </p>
      )}

      {deleteError && <p className="ticket-detail-page__error">{deleteError}</p>}

      {ticket && !editing && (
        <>
          <header className="ticket-detail-page__header">
            <div className="ticket-detail-page__title-row">
              <h1>{ticket.name}</h1>
              <div className="ticket-detail-page__actions">
                <button onClick={startEditing} className="ticket-detail-page__btn">
                  Modifier
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="ticket-detail-page__btn ticket-detail-page__btn--danger"
                >
                  {deleting ? 'Suppression…' : 'Supprimer'}
                </button>
              </div>
            </div>
            <div className="ticket-detail-page__meta">
              <p><strong>Type :</strong> {ticket.type}</p>
              <p><strong>Statut :</strong> {ticket.status}</p>
              <p><strong>Priorité :</strong> {ticket.priority}</p>
              <p><strong>Date :</strong> {ticket.date}</p>
            </div>
          </header>

          <section className="ticket-detail-page__section">
            <h2>Description</h2>
            {/* whiteSpace: 'pre-wrap' : GLPI stocke le contenu avec des sauts de
                ligne ; sans cette règle CSS, le HTML les ignorerait et tout
                s'afficherait sur une seule ligne. */}
            <p className="ticket-detail-page__content">
              {ticket.content || '(aucune description)'}
            </p>
          </section>

          <section className="ticket-detail-page__section">
            <h2>Éléments associés</h2>
            {ticket.items.length === 0 ? (
              <p className="ticket-detail-page__empty">Aucun élément associé à ce ticket.</p>
            ) : (
              <ul className="ticket-detail-page__items">
                {ticket.items.map((item, index) => (
                  <li key={index}>{item.name} <em>({item.itemtype})</em></li>
                ))}
              </ul>
            )}
          </section>

          <section className="ticket-detail-page__section">
            <h2>Coûts</h2>
            {ticket.costs.length === 0 ? (
              <p className="ticket-detail-page__empty">Aucun coût enregistré pour ce ticket.</p>
            ) : (
              <div className="ticket-detail-page__results">
                <table className="ticket-detail-page__table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Temps (s)</th>
                      <th>Coût horaire</th>
                      <th>Coût fixe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticket.costs.map((cost, index) => (
                      <tr key={index}>
                        <td>{cost.name}</td>
                        <td>{cost.actiontime}</td>
                        <td>{cost.cost_time}</td>
                        <td>{cost.cost_fixed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {ticket && editing && (
        <form onSubmit={handleSave} className="ticket-detail-page__edit-form">
          <h1>Modifier le ticket</h1>

          <div className="ticket-detail-page__field">
            <label>
              Titre
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="ticket-detail-page__field">
            <label>
              Description
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={5}
              />
            </label>
          </div>

          <div className="ticket-detail-page__row">
            <label>
              Type
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: Number(e.target.value) }))}>
                {TYPE_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Statut
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: Number(e.target.value) }))}>
                {STATUS_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              Priorité
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))}>
                {PRIORITY_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>

          {saveError && <p className="ticket-detail-page__error">{saveError}</p>}

          <div className="ticket-detail-page__form-footer">
            <button type="button" onClick={() => setEditing(false)} className="ticket-detail-page__btn">
              Annuler
            </button>
            <button type="submit" disabled={saving} className="ticket-detail-page__submit">
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeTicketDetailPage
