import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession, backofficeFetch } from './api.js'
import './ResetPage.css'

function BackofficeResetPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
    onLock()
    navigate('/backoffice/login')
  }

  const [resetLoading,  setResetLoading]  = useState(false)
  // "resetProgress" : dernier événement SSE de progression.
  // { current, total, percent, label } une fois la suppression commencée.
  const [resetProgress, setResetProgress] = useState(null)
  const [resetResult,   setResetResult]   = useState(null)

  async function handleReset() {
    const confirmed = window.confirm(
      'Supprimer toutes les données importées dans GLPI ?\n\n' +
      'Cette action est IRRÉVERSIBLE : tous les éléments, tickets, images et ' +
      'données de référence créés par le dernier import seront définitivement effacés.'
    )
    if (!confirmed) return

    setResetLoading(true)
    setResetProgress(null)
    setResetResult(null)

    try {
      const response = await backofficeFetch('http://localhost:3001/api/backoffice/reset', { method: 'POST' })

      // Lecture du flux SSE — même logique que ImportPage.
      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop()

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') setResetProgress(event)
            else if (event.type === 'done') setResetResult(event)
          } catch { /* fragment malformé */ }
        }
      }
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
        <header className="reset-page__header">
          <h1>Réinitialisation des données</h1>
          <p className="reset-page__intro">
            Supprime dans GLPI tout ce que le dernier import a créé (en s'appuyant
            sur le journal SQLite), puis vide ce journal — pour repartir d'une base propre.
          </p>
        </header>

        <div className="reset-page__panel">
          <button
            onClick={handleReset}
            disabled={resetLoading}
            className="reset-page__button"
          >
            {resetLoading ? 'Suppression en cours…' : 'Réinitialiser les données importées'}
          </button>

          {/* Barre de progression : indéterminée pendant la connexion à GLPI,
              puis déterminée dès que le serveur commence à supprimer des items
              et émet des événements SSE avec current/total/percent. */}
          {resetLoading && (
            <div className="reset-page__progress-wrap">
              <p className="reset-page__step-label">
                {resetProgress?.label ?? 'Connexion à GLPI…'}
              </p>
              <div
                className="reset-page__progress"
                role="progressbar"
                aria-valuenow={resetProgress?.percent ?? 0}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div
                  className={`reset-page__progress-bar${!resetProgress ? ' reset-page__progress-bar--indeterminate' : ''}`}
                  style={resetProgress ? { width: `${resetProgress.percent}%` } : undefined}
                />
              </div>
              {resetProgress && (
                <span className="reset-page__percent">
                  {resetProgress.current} / {resetProgress.total} — {resetProgress.percent} %
                </span>
              )}
            </div>
          )}
        </div>

        {resetResult && (
          <div className="reset-page__result">
            {resetResult.ok ? (
              <>
                <p className="reset-page__success">
                  Réinitialisation terminée avec succès — {resetResult.log.length} opération(s) effectuée(s).
                </p>
                {/* <ul className="reset-page__log">
                  {resetResult.log.map((line, index) => <li key={index}>{line}</li>)}
                </ul> */}
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
