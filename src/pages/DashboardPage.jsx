import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

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
      .catch(err  => setError({ message: err.message, detail: err.glpi ?? null }))

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
    <div style={{ maxWidth: '800px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>NewApp — Tableau de bord</h1>
        <button onClick={logout} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Déconnexion
        </button>
      </div>

      <h2>Utilisateurs GLPI</h2>

      {/* Affiche l'erreur complète : message HTTP + corps JSON de GLPI */}
      {error && (
        <div style={{ color: 'red' }}>
          <p><strong>Erreur :</strong> {error.message}</p>
          {error.detail && (
            <pre style={{ background: '#fff0f0', padding: '0.75rem', borderRadius: '4px', fontSize: '0.85rem' }}>
              {JSON.stringify(error.detail, null, 2)}
            </pre>
          )}
        </div>
      )}

      {!users && !error && <p>Chargement...</p>}

      {users && (
        <pre style={{ background: '#f4f4f4', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
          {JSON.stringify(users, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default DashboardPage
