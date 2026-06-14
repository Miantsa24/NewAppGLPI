import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession } from './api.js'
import './DashboardPage.css'

// Petit composant réutilisable : une "carte" affichant un nombre + un libellé.
// Le découper ainsi évite de répéter la même structure JSX pour chaque ligne
// de statistique (éléments ET tickets utilisent la même présentation visuelle).
// "color" (optionnel) : utilisé pour les cartes "Tickets par statut", avec les
// mêmes couleurs que les pastilles de TicketsPage.jsx — repère visuel rapide.
function StatCard({ label, count, color }) {
  return (
    <div className="stat-card" style={color ? { borderTopColor: color } : undefined}>
      <div className="stat-card__count" style={color ? { color } : undefined}>{count}</div>
      <div className="stat-card__label">{label}</div>
    </div>
  )
}

// Mêmes couleurs que STATUS_COLORS dans TicketsPage.jsx — gardées synchronisées
// "à la main" (le projet duplique volontairement ces petites tables de
// correspondance plutôt que d'ajouter une dépendance partagée pour 3 entrées).
const STATUS_COLORS = {
  'Nouveau':              '#c0392b',
  'En cours (attribué)':  '#e67e22',
  'Clos':                 '#7f8c8d'
}

// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeDashboardPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
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
        <header className="backoffice-dashboard-page__header">
          <h1>Dashboard</h1>
          <p className="backoffice-dashboard-page__intro">Comptages en direct depuis GLPI — toute modification faite dans GLPI apparaît ici immédiatement (rechargez la page).</p>
        </header>

        {loading && <p>Chargement…</p>}

        {error && (
          <p className="backoffice-dashboard-page__error">
            Impossible de charger les statistiques. Réessayez dans quelques instants.
          </p>
        )}

        {stats && (
          <>
            <section className="backoffice-dashboard-page__section backoffice-dashboard-page__section--elements">
              <div className="backoffice-dashboard-page__section-header">
                <h2>Éléments par type</h2>
                <div className="backoffice-dashboard-page__total">
                  <span className="backoffice-dashboard-page__total-count">{stats.totalElements}</span>
                  <span className="backoffice-dashboard-page__total-label">au total</span>
                </div>
              </div>
              <div className="backoffice-dashboard-page__cards">
                {stats.elements.map(e => (
                  <StatCard key={e.itemtype} label={e.label} count={e.count} />
                ))}
              </div>
            </section>

            <section className="backoffice-dashboard-page__section backoffice-dashboard-page__section--tickets">
              <div className="backoffice-dashboard-page__section-header">
                <h2>Tickets</h2>
                <div className="backoffice-dashboard-page__total">
                  <span className="backoffice-dashboard-page__total-count">{stats.totalTickets}</span>
                  <span className="backoffice-dashboard-page__total-label">au total</span>
                </div>
              </div>

              <h3 className="backoffice-dashboard-page__subheading">Par type</h3>
              <div className="backoffice-dashboard-page__cards">
                {stats.ticketsByType.map(t => (
                  <StatCard key={t.type} label={t.label} count={t.count} />
                ))}
              </div>

              <h3 className="backoffice-dashboard-page__subheading">Par statut</h3>
              <div className="backoffice-dashboard-page__cards">
                {stats.ticketsByStatus.map(s => (
                  <StatCard key={s.status} label={s.label} count={s.count} color={STATUS_COLORS[s.label]} />
                ))}
              </div>
            </section>

            <section className="backoffice-dashboard-page__section backoffice-dashboard-page__section--costs">
              <div className="backoffice-dashboard-page__section-header">
                <h2>Coûts</h2>
              </div>
              <div className="backoffice-dashboard-page__cards">
                <StatCard label="Coûts enregistrés" count={stats.totalCostsCount} />
                <StatCard label="Coût total à l'import (Ar)" count={stats.totalCostAmount.toLocaleString('fr-FR')} />
                <StatCard label="Coût total après enregistrement (Ar)" count={stats.totalNewCostAmount.toLocaleString('fr-FR')} />
                <StatCard label="Coût total de réouverture (Ar)" count={stats.totalReopenCostAmount.toLocaleString('fr-FR')} />
                <StatCard label="Coût total (Ar)" count={stats.totalGeneralCostAmount.toLocaleString('fr-FR')} />
              </div>
            </section>
          </>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeDashboardPage
