import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

// Petit composant réutilisable : une "carte" affichant un nombre + un libellé.
// Le découper ainsi évite de répéter la même structure JSX pour chaque ligne
// de statistique (éléments ET tickets utilisent la même présentation visuelle).
function StatCard({ label, count }) {
  return (
    <div style={{ background: '#f5f5f5', borderRadius: '8px', padding: '1rem', minWidth: '160px', textAlign: 'center' }}>
      <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>{count}</div>
      <div>{label}</div>
    </div>
  )
}

function BackofficeDashboardPage() {
  // "stats" : null tant que rien n'est chargé, puis l'objet { elements,
  // totalElements, ticketsByType, totalTickets } renvoyé par le serveur.
  const [stats,   setStats]   = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  // useEffect avec un tableau de dépendances vide [] : exécuté UNE seule fois,
  // au montage du composant — exactement ce qu'il faut pour un chargement
  // initial de données (pas besoin de relancer à chaque rendu).
  useEffect(() => {
    let cancelled = false   // évite d'appeler setState après démontage du composant

    async function loadStats() {
      try {
        const response = await fetch('http://localhost:3001/api/backoffice/dashboard')
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setStats(data.stats)
        } else {
          setError(data.error)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStats()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <p><Link to="/backoffice">← Retour au Backoffice</Link></p>
      <h1>Dashboard</h1>
      <p>Comptages en direct depuis GLPI — toute modification faite dans GLPI apparaît ici immédiatement (rechargez la page).</p>

      {loading && <p>Chargement…</p>}

      {error && (
        <pre style={{ background: '#fee', padding: '1rem', overflowX: 'auto' }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      )}

      {stats && (
        <>
          <h2>Éléments par type — {stats.totalElements} au total</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {stats.elements.map(e => (
              <StatCard key={e.itemtype} label={e.label} count={e.count} />
            ))}
          </div>

          <h2 style={{ marginTop: '2rem' }}>Tickets par type — {stats.totalTickets} au total</h2>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {stats.ticketsByType.map(t => (
              <StatCard key={t.type} label={t.label} count={t.count} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default BackofficeDashboardPage
