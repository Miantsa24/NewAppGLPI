import { useNavigate } from 'react-router-dom'

// onLock : prévient App que l'accès backoffice doit être reverrouillé
// (symétrique de onUnlock dans BackofficeLoginPage).
function BackofficeHomePage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Backoffice — Accueil</h1>
        <button onClick={lock} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Verrouiller
        </button>
      </div>

      <p>
        Accès backoffice validé. Les pages Dashboard, Import et Réinitialisation
        viendront se brancher ici dans les prochaines phases.
      </p>
    </div>
  )
}

export default BackofficeHomePage
