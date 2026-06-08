import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './TicketDetailPage.css'

// useParams() lit les segments dynamiques de l'URL définis dans App.jsx
// (ex. "/backoffice/tickets/:id" → { id: "5" }). C'est l'équivalent React-Router
// de récupérer un paramètre dans une route Express (req.params.id côté serveur).
// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeTicketDetailPage({ onLock }) {
  const { id } = useParams()
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  const [ticket,  setTicket]  = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  // [id] en dépendance : si jamais on navigue d'une fiche ticket à une autre
  // sans démonter le composant (ex. lien vers un autre ticket), l'effet relance
  // le chargement avec le nouvel id plutôt que de garder l'ancienne fiche affichée.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setTicket(null)

    async function loadTicket() {
      try {
        const response = await fetch(`http://localhost:3001/api/backoffice/tickets/${id}`)
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setTicket(data.ticket)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement du ticket :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement du ticket :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTicket()
    return () => { cancelled = true }
  }, [id])

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="ticket-detail-page">
      <p className="ticket-detail-page__back"><Link to="/backoffice/tickets">← Retour à la liste des tickets</Link></p>

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="ticket-detail-page__error">
          Impossible de charger ce ticket. Réessayez dans quelques instants.
        </p>
      )}

      {ticket && (
        <>
          <h1>{ticket.name}</h1>

          <div className="ticket-detail-page__meta">
            <p><strong>Type :</strong> {ticket.type}</p>
            <p><strong>Statut :</strong> {ticket.status}</p>
            <p><strong>Priorité :</strong> {ticket.priority}</p>
            <p><strong>Date :</strong> {ticket.date}</p>
          </div>

          <h2>Description</h2>
          {/* whiteSpace: 'pre-wrap' : GLPI stocke le contenu avec des sauts de
              ligne ; sans cette règle CSS, le HTML les ignorerait et tout
              s'afficherait sur une seule ligne. */}
          <p className="ticket-detail-page__content">
            {ticket.content || '(aucune description)'}
          </p>

          <h2>Éléments associés</h2>
          {ticket.items.length === 0 ? (
            <p>Aucun élément associé à ce ticket.</p>
          ) : (
            <ul className="ticket-detail-page__items">
              {ticket.items.map((item, index) => (
                <li key={index}>{item.name} <em>({item.itemtype})</em></li>
              ))}
            </ul>
          )}

          <h2>Coûts</h2>
          {ticket.costs.length === 0 ? (
            <p>Aucun coût enregistré pour ce ticket.</p>
          ) : (
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
          )}
        </>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeTicketDetailPage
