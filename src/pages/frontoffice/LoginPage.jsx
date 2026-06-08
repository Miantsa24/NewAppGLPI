import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './LoginPage.css'

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
    <div className="login-page">
      <h1>NewApp GLPI</h1>
      <p className="login-page__subtitle">Connectez-vous avec vos identifiants GLPI</p>

      <form onSubmit={handleSubmit} className="login-page__form">
        <input
          type="text"
          placeholder="Nom d'utilisateur GLPI"
          value={username}
          onChange={e => setUsername(e.target.value)}  // e.target.value = ce que l'utilisateur a tapé
          required
          className="login-page__input"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="login-page__input"
        />

        {/* Affichage conditionnel de l'erreur */}
        {error && <p className="login-page__error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="login-page__submit"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}

export default LoginPage
