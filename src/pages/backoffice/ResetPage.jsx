import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './ResetPage.css'

// Page dédiée à la réinitialisation des données importées — sortie de la page
// d'accueil du Backoffice pour que cette action destructrice ait son propre
// espace, plutôt que de cohabiter avec la simple navigation.
// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeResetPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  // "loading" désactive le bouton pendant l'opération (la suppression de
  // dizaines d'items dans GLPI prend quelques secondes).
  // "result" stocke { ok, log } renvoyé par le serveur, affiché tel quel.
  const [resetLoading, setResetLoading] = useState(false)
  const [resetResult,  setResetResult]  = useState(null)

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
      // Le détail technique part dans la console — l'affichage à l'écran
      // (ci-dessous) ne montre qu'un message en texte clair en cas d'échec.
      if (!data.ok) console.error('Échec de la réinitialisation :', data.error)
      setResetResult(data)
    } catch (err) {
      console.error('Échec de la réinitialisation :', err.message)
      setResetResult({ ok: false })
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="reset-page">
        <h1>Réinitialisation des données</h1>
        <p className="reset-page__intro">
          Supprime dans GLPI tout ce que le dernier import a créé (en s'appuyant
          sur le journal SQLite), puis vide ce journal — pour repartir d'une base propre.
        </p>
        <button
          onClick={handleReset}
          disabled={resetLoading}
          className="reset-page__button"
        >
          {resetLoading ? 'Suppression en cours…' : 'Réinitialiser les données importées'}
        </button>

        {/* Barre de progression indéterminée : même raison que sur la page
            d'import — le serveur ne renvoie le résultat qu'à la toute fin,
            donc pas de vrai pourcentage possible, juste une animation en boucle. */}
        {resetLoading && (
          <div className="reset-page__progress" role="progressbar" aria-label="Réinitialisation en cours">
            <div className="reset-page__progress-bar"></div>
          </div>
        )}

        {resetResult && (
          <div className="reset-page__result">
            {resetResult.ok ? (
              <>
                <p className="reset-page__success">
                  Réinitialisation terminée avec succès — {resetResult.log.length} opération(s) effectuée(s).
                </p>
                <ul className="reset-page__log">
                  {resetResult.log.map((line, index) => <li key={index}>{line}</li>)}
                </ul>
              </>
            ) : (
              <p className="reset-page__error">
                La réinitialisation a échoué. Réessayez dans quelques instants.
              </p>
            )}
          </div>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeResetPage
