import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './TicketsPage.css'

// Petite "pastille" colorée pour le statut — aide à repérer d'un coup d'œil
// les tickets encore ouverts (rouge/orange) des tickets clos (vert/gris).
// On choisit la couleur à partir du LIBELLÉ déjà traduit par le serveur
// (voir ticketsData.js) — pas besoin de connaître à nouveau les codes ici.
const STATUS_COLORS = {
  'Nouveau':              '#c0392b',
  'En cours (attribué)':  '#e67e22',
  'En cours (planifié)':  '#e67e22',
  'En attente':           '#f1c40f',
  'Résolu':               '#27ae60',
  'Clos':                 '#7f8c8d'
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] ?? '#7f8c8d'
  return (
    <span className="status-badge" style={{ background: color }}>
      {status}
    </span>
  )
}

// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeTicketsPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  // "tickets" : null tant que rien n'est chargé, puis le tableau renvoyé
  // par le serveur (déjà trié et avec les libellés traduits).
  const [tickets, setTickets] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadTickets() {
      try {
        const response = await fetch('http://localhost:3001/api/backoffice/tickets')
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setTickets(data.tickets)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement des tickets :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement des tickets :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTickets()
    return () => { cancelled = true }
  }, [])

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="backoffice-tickets-page">
        <h1>Tickets</h1>
        <p className="backoffice-tickets-page__intro">Liste en direct depuis GLPI — cliquez sur un ticket pour voir sa fiche détaillée.</p>

        {loading && <p>Chargement…</p>}

        {error && (
          <p className="backoffice-tickets-page__error">
            Impossible de charger la liste des tickets. Réessayez dans quelques instants.
          </p>
        )}

        {tickets && tickets.length === 0 && <p>Aucun ticket pour le moment.</p>}

        {tickets && tickets.length > 0 && (
          <table className="backoffice-tickets-page__table">
            <thead>
              <tr>
                <th>Titre</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Priorité</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(ticket => (
                <tr key={ticket.id}>
                  <td>
                    <Link to={`/backoffice/tickets/${ticket.id}`}>{ticket.name}</Link>
                  </td>
                  <td>{ticket.type}</td>
                  <td><StatusBadge status={ticket.status} /></td>
                  <td>{ticket.priority}</td>
                  <td>{ticket.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeTicketsPage
