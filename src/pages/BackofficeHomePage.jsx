import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'

// onLock : prévient App que l'accès backoffice doit être reverrouillé
// (symétrique de onUnlock dans BackofficeLoginPage).
function BackofficeHomePage({ onLock }) {
  const navigate = useNavigate()

  // "loading" désactive le bouton pendant l'opération (la suppression de
  // dizaines d'items dans GLPI prend quelques secondes).
  // "result" stocke { ok, log } renvoyé par le serveur, affiché tel quel.
  const [resetLoading, setResetLoading] = useState(false)
  const [resetResult,  setResetResult]  = useState(null)

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  async function handleReset() {
    // window.confirm() : boîte de dialogue native du navigateur, bloquante —
    // le code ne continue QUE si l'utilisateur clique sur "OK". C'est la façon
    // la plus simple de répondre à l'exigence "bouton avec confirmation" pour
    // une action destructrice (suppression dans GLPI).
    const confirmed = window.confirm(
      'Supprimer toutes les données importées dans GLPI ?\n\n' +
      'Cette action est IRRÉVERSIBLE : tous les éléments, tickets, images et ' +
      'données de référence créés par le dernier import seront définitivement effacés.'
    )
    if (!confirmed) return

    setResetLoading(true)
    setResetResult(null)

    try {
      const response = await fetch('http://localhost:3001/api/backoffice/reset', { method: 'POST' })
      const data = await response.json()
      setResetResult(data)
    } catch (err) {
      setResetResult({ ok: false, error: err.message })
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Backoffice — Accueil</h1>
        <button onClick={lock} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Verrouiller
        </button>
      </div>

      <nav style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <Link to="/backoffice/dashboard">Dashboard</Link>
        <Link to="/backoffice/tickets">Tickets</Link>
        <Link to="/backoffice/import">Importer des données</Link>
      </nav>

      <section style={{ borderTop: '1px solid #ccc', paddingTop: '1rem' }}>
        <h2>Réinitialisation des données</h2>
        <p>
          Supprime dans GLPI tout ce que le dernier import a créé (en s'appuyant
          sur le journal SQLite), puis vide ce journal — pour repartir d'une base propre.
        </p>
        <button
          onClick={handleReset}
          disabled={resetLoading}
          style={{ padding: '0.5rem 1rem', cursor: resetLoading ? 'not-allowed' : 'pointer', background: '#c0392b', color: 'white', border: 'none', borderRadius: '4px' }}
        >
          {resetLoading ? 'Suppression en cours…' : 'Réinitialiser les données importées'}
        </button>

        {resetResult && (
          <div style={{ marginTop: '1rem' }}>
            <h3>{resetResult.ok ? 'Réinitialisation terminée' : 'Échec de la réinitialisation'}</h3>
            {resetResult.ok ? (
              <ul style={{ maxHeight: '300px', overflowY: 'auto', background: '#f5f5f5', padding: '1rem' }}>
                {resetResult.log.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            ) : (
              <pre style={{ background: '#fee', padding: '1rem', overflowX: 'auto' }}>
                {JSON.stringify(resetResult.error, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default BackofficeHomePage
