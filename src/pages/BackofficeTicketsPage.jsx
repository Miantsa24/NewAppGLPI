import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

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
    <span style={{ background: color, color: 'white', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.85rem' }}>
      {status}
    </span>
  )
}

function BackofficeTicketsPage() {
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
          setError(data.error)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTickets()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <p><Link to="/backoffice">← Retour au Backoffice</Link></p>
      <h1>Tickets</h1>
      <p>Liste en direct depuis GLPI — cliquez sur un ticket pour voir sa fiche détaillée.</p>

      {loading && <p>Chargement…</p>}

      {error && (
        <pre style={{ background: '#fee', padding: '1rem', overflowX: 'auto' }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      {tickets && tickets.length === 0 && <p>Aucun ticket pour le moment.</p>}

      {tickets && tickets.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
              <th style={{ padding: '0.5rem' }}>Titre</th>
              <th style={{ padding: '0.5rem' }}>Type</th>
              <th style={{ padding: '0.5rem' }}>Statut</th>
              <th style={{ padding: '0.5rem' }}>Priorité</th>
              <th style={{ padding: '0.5rem' }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(ticket => (
              <tr key={ticket.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.5rem' }}>
                  <Link to={`/backoffice/tickets/${ticket.id}`}>{ticket.name}</Link>
                </td>
                <td style={{ padding: '0.5rem' }}>{ticket.type}</td>
                <td style={{ padding: '0.5rem' }}><StatusBadge status={ticket.status} /></td>
                <td style={{ padding: '0.5rem' }}>{ticket.priority}</td>
                <td style={{ padding: '0.5rem' }}>{ticket.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default BackofficeTicketsPage
