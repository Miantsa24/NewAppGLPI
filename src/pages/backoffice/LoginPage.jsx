import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './LoginPage.css'

// onUnlock : fonction fournie par App pour le prévenir que le code est validé
// (même principe que onLogin dans LoginPage — voir App.jsx pour l'explication
// du problème de re-rendu que ça résout).
function BackofficeLoginPage({ onUnlock }) {
  // import.meta.env.VITE_xxx : façon dont Vite expose les variables d'environnement
  // préfixées VITE_ au code frontend (à la différence de process.env côté serveur).
  // On pré-remplit le champ avec ce code, comme demandé par l'énoncé.
  const [code,    setCode]    = useState(import.meta.env.VITE_BACKOFFICE_CODE ?? '')
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res  = await fetch('/api/backoffice/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ code })
      })
      const data = await res.json()

      if (data.ok) {
        // sessionStorage : contrairement à localStorage, vidé à la fermeture de l'onglet.
        // Logique pour un accès "temporaire" type backoffice — pas besoin de persister
        // indéfiniment comme le token GLPI (qui sert, lui, à des appels API répétés).
        sessionStorage.setItem('backoffice_unlocked', 'true')
        onUnlock()                 // prévient App → re-rendu → route backoffice accessible
        navigate('/backoffice')
      } else {
        setError(data.error ?? 'Code incorrect.')
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="backoffice-login-page">
      <h1>Backoffice NewApp</h1>
      <p className="backoffice-login-page__subtitle">Entrez le code d'accès pour continuer</p>

      <form onSubmit={handleSubmit} className="backoffice-login-page__form">
        <input
          type="text"
          placeholder="Code d'accès"
          value={code}
          onChange={e => setCode(e.target.value)}
          required
          className="backoffice-login-page__input"
        />

        {error && <p className="backoffice-login-page__error">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="backoffice-login-page__submit"
        >
          {loading ? 'Vérification...' : 'Accéder au backoffice'}
        </button>
      </form>
    </div>
  )
}

export default BackofficeLoginPage
