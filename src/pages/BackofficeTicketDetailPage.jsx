import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'

// useParams() lit les segments dynamiques de l'URL définis dans App.jsx
// (ex. "/backoffice/tickets/:id" → { id: "5" }). C'est l'équivalent React-Router
// de récupérer un paramètre dans une route Express (req.params.id côté serveur).
function BackofficeTicketDetailPage() {
  const { id } = useParams()

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
          setError(data.error)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadTicket()
    return () => { cancelled = true }
  }, [id])

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <p><Link to="/backoffice/tickets">← Retour à la liste des tickets</Link></p>

      {loading && <p>Chargement…</p>}

      {error && (
        <pre style={{ background: '#fee', padding: '1rem', overflowX: 'auto' }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      {ticket && (
        <>
          <h1>{ticket.name}</h1>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', margin: '1rem 0' }}>
            <p><strong>Type :</strong> {ticket.type}</p>
            <p><strong>Statut :</strong> {ticket.status}</p>
            <p><strong>Priorité :</strong> {ticket.priority}</p>
            <p><strong>Date :</strong> {ticket.date}</p>
          </div>

          <h2>Description</h2>
          {/* whiteSpace: 'pre-wrap' : GLPI stocke le contenu avec des sauts de
              ligne ; sans cette règle CSS, le HTML les ignorerait et tout
              s'afficherait sur une seule ligne. */}
          <p style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
            {ticket.content || '(aucune description)'}
          </p>

          <h2>Éléments associés</h2>
          {ticket.items.length === 0 ? (
            <p>Aucun élément associé à ce ticket.</p>
          ) : (
            <ul>
              {ticket.items.map((item, index) => (
                <li key={index}>{item.name} <em>({item.itemtype})</em></li>
              ))}
            </ul>
          )}

          <h2>Coûts</h2>
          {ticket.costs.length === 0 ? (
            <p>Aucun coût enregistré pour ce ticket.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                  <th style={{ padding: '0.5rem' }}>Nom</th>
                  <th style={{ padding: '0.5rem' }}>Temps (s)</th>
                  <th style={{ padding: '0.5rem' }}>Coût horaire</th>
                  <th style={{ padding: '0.5rem' }}>Coût fixe</th>
                </tr>
              </thead>
              <tbody>
                {ticket.costs.map((cost, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '0.5rem' }}>{cost.name}</td>
                    <td style={{ padding: '0.5rem' }}>{cost.actiontime}</td>
                    <td style={{ padding: '0.5rem' }}>{cost.cost_time}</td>
                    <td style={{ padding: '0.5rem' }}>{cost.cost_fixed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  )
}

export default BackofficeTicketDetailPage
