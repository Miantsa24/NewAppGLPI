import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './DashboardPage.css'

// Petit composant réutilisable : une "carte" affichant un nombre + un libellé.
// Le découper ainsi évite de répéter la même structure JSX pour chaque ligne
// de statistique (éléments ET tickets utilisent la même présentation visuelle).
function StatCard({ label, count }) {
  return (
    <div className="stat-card">
      <div className="stat-card__count">{count}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeDashboardPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

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
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement des statistiques :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement des statistiques :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadStats()
    return () => { cancelled = true }
  }, [])

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="backoffice-dashboard-page">
        <h1>Dashboard</h1>
        <p className="backoffice-dashboard-page__intro">Comptages en direct depuis GLPI — toute modification faite dans GLPI apparaît ici immédiatement (rechargez la page).</p>

        {loading && <p>Chargement…</p>}

        {error && (
          <p className="backoffice-dashboard-page__error">
            Impossible de charger les statistiques. Réessayez dans quelques instants.
          </p>
        )}

        {stats && (
          <>
            <h2>Éléments par type — {stats.totalElements} au total</h2>
            <div className="backoffice-dashboard-page__cards">
              {stats.elements.map(e => (
                <StatCard key={e.itemtype} label={e.label} count={e.count} />
              ))}
            </div>

            <h2 className="backoffice-dashboard-page__section-title">Tickets par type — {stats.totalTickets} au total</h2>
            <div className="backoffice-dashboard-page__cards">
              {stats.ticketsByType.map(t => (
                <StatCard key={t.type} label={t.label} count={t.count} />
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeDashboardPage
