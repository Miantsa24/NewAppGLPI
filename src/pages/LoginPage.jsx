import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// onLogin : fonction fournie par App (= setToken). On l'appelle après un login
// réussi pour que App connaisse le nouveau token et déclenche un re-rendu —
// sans ça, App ne saurait pas qu'on vient de se connecter (voir App.jsx).
function LoginPage({ onLogin }) {
  // useState : valeur du champ + fonction pour la mettre à jour
  // Chaque frappe appelle setUsername/setPassword → React re-rend le champ
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)

  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()   // empêche le rechargement de page (comportement par défaut des formulaires HTML)
    setError(null)
    setLoading(true)

    try {
      // POST /api/auth/login → Express → GLPI (grant_type=password)
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password })
      })
      const data = await res.json()

      if (data.access_token) {
        // Stocke le token Bearer dans localStorage pour les futures requêtes GLPI
        // (persistance : survit aux rechargements de page)
        localStorage.setItem('access_token', data.access_token)

        // Met à jour l'état React de App → déclenche un re-rendu →
        // la route "/" recalcule son élément avec le nouveau token → Dashboard s'affiche
        onLogin(data.access_token)

        navigate('/')   // redirige vers le tableau de bord
      } else {
        // GLPI a répondu mais sans token (mauvais credentials, client mal configuré, etc.)
        setError('Identifiants incorrects. Vérifiez votre nom d\'utilisateur et mot de passe GLPI.')
      }
    } catch (err) {
      setError('Impossible de contacter le serveur.')
    } finally {
      // finally s'exécute toujours, succès ou erreur — pour enlever le "Chargement..."
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '6rem' }}>
      <h1>NewApp GLPI</h1>
      <p style={{ color: '#666' }}>Connectez-vous avec vos identifiants GLPI</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '280px' }}>
        <input
          type="text"
          placeholder="Nom d'utilisateur GLPI"
          value={username}
          onChange={e => setUsername(e.target.value)}  // e.target.value = ce que l'utilisateur a tapé
          required
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ padding: '0.5rem', fontSize: '1rem' }}
        />

        {/* Affichage conditionnel de l'erreur */}
        {error && <p style={{ color: 'red', margin: 0, fontSize: '0.9rem' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '0.75rem', fontSize: '1rem', cursor: loading ? 'default' : 'pointer' }}
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
