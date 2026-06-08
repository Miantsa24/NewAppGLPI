import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './DashboardPage.css'

// Variable de module : partagée entre TOUTES les instances du composant.
// Contrairement à useRef qui crée un objet par instance, une variable de module
// est créée une seule fois au chargement du fichier → survit aux remontages StrictMode.
let fetchStarted = false

// onLogout : fonction fournie par App (= () => setToken(null)). On l'appelle
// pour que App mette aussi à jour son état React — sinon App garderait l'ancien
// token en mémoire et la route "/" réafficherait le Dashboard malgré la déconnexion.
function DashboardPage({ onLogout }) {
  const [users,   setUsers]   = useState(null)
  const [error,   setError]   = useState(null)
  const navigate  = useNavigate()
  const token     = localStorage.getItem('access_token')

  useEffect(() => {
    // Empêche le double-appel du mode strict React (qui monte/démonte les composants en dev)
    if (fetchStarted) return
    fetchStarted = true

    // Endpoint confirmé dans la spec OpenAPI de GLPI (doc.json) :
    // GET /Administration/User → liste des utilisateurs, aucun paramètre obligatoire
    fetch('/api/glpi/Administration/User', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async r => {
        // Lit le corps JSON même en cas d'erreur pour afficher le message GLPI exact
        const body = await r.json().catch(() => ({ raw: r.statusText }))
        if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { glpi: body })
        return body
      })
      .then(data  => setUsers(data))
      .catch(err  => {
        // Le détail technique (réponse JSON de GLPI) part dans la console pour
        // le débogage — l'utilisateur, lui, ne voit qu'un message en texte clair.
        console.error('Échec du chargement des utilisateurs GLPI :', err.message, err.glpi)
        setError(true)
      })

    // Réinitialise la garde au démontage (utile en production quand on quitte la page)
    return () => { fetchStarted = false }
  }, [])

  function logout() {
    localStorage.removeItem('access_token')
    fetchStarted = false   // réinitialise pour la prochaine connexion
    onLogout()             // prévient App : son état "token" doit repasser à null
    navigate('/login')
  }

  return (
    <Layout
      title="NewApp GLPI"
      navLinks={FRONTOFFICE_NAV_LINKS}
      actionLabel="Déconnexion"
      onAction={logout}
    >
      <div className="dashboard-page">
        <h1>Tableau de bord</h1>
        <h2>Utilisateurs GLPI</h2>

        {/* Message d'erreur écrit en texte clair — pas de JSON brut à l'écran :
            on garde le détail technique uniquement dans la console (pour le débogage),
            et on affiche à l'utilisateur une phrase compréhensible. */}
        {error && (
          <p className="dashboard-page__error">
            Impossible de charger la liste des utilisateurs. Réessayez dans quelques instants.
          </p>
        )}

        {!users && !error && <p>Chargement...</p>}

        {users && users.length === 0 && <p>Aucun utilisateur trouvé.</p>}

        {users && users.length > 0 && (
          <table className="dashboard-page__table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Identifiant</th>
                <th>Email</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                // "emails" est un tableau d'objets { email, is_default, ... } —
                // on affiche l'adresse par défaut, ou la première à défaut.
                const email = user.emails?.find(e => e.is_default) ?? user.emails?.[0]
                return (
                  <tr key={user.id}>
                    <td>{[user.firstname, user.realname].filter(Boolean).join(' ') || '—'}</td>
                    <td>{user.username}</td>
                    <td>{email?.email ?? '—'}</td>
                    <td>{user.is_active ? 'Actif' : 'Inactif'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}

export default DashboardPage
