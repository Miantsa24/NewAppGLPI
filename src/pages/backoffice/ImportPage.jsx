import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession, backofficeFetch } from './api.js'
import './ImportPage.css'

function BackofficeImportPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
    onLock()
    navigate('/backoffice/login')
  }

  const [feuille1, setFeuille1] = useState(null)
  const [feuille2, setFeuille2] = useState(null)
  const [feuille3, setFeuille3] = useState(null)
  const [images,   setImages]   = useState(null)

  const [loading,  setLoading]  = useState(false)
  // "progress" : dernier événement de progression reçu via SSE.
  // null = l'import n'a pas encore commencé (ou on affiche la barre indéterminée).
  // { percent, label } = étape courante connue.
  const [progress, setProgress] = useState(null)
  const [result,   setResult]   = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()

    const formData = new FormData()
    formData.append('feuille1', feuille1)
    // Feuille 2 (tickets), feuille 3 (coûts) et le ZIP d'images sont optionnels —
    // on ne les ajoute que s'ils ont été sélectionnés.
    if (feuille2) formData.append('feuille2', feuille2)
    if (feuille3) formData.append('feuille3', feuille3)
    if (images) formData.append('images', images)

    setLoading(true)
    setProgress(null)
    setResult(null)

    try {
      const response = await backofficeFetch('http://localhost:3001/api/backoffice/import', {
        method: 'POST',
        body:   formData
      })

      // 400 = fichiers manquants : réponse JSON classique, pas SSE
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setResult({ ok: false, error: data.error })
        return
      }

      // Lecture du flux SSE.
      // Format de chaque événement : "data: {json}\n\n"
      // Plusieurs événements peuvent arriver dans un même "chunk" lu par reader.read(),
      // ou un seul événement peut être fragmenté en plusieurs chunks — d'où le buffer.
      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // { stream: true } : signale au décodeur que d'autres chunks vont suivre —
        // il ne génère pas de caractère de remplacement pour les séquences UTF-8
        // qui se coupent en plein milieu d'un chunk.
        buffer += decoder.decode(value, { stream: true })

        // Chaque événement SSE est séparé par une ligne vide (double \n).
        const parts = buffer.split('\n\n')
        buffer = parts.pop() // dernier fragment potentiellement incomplet

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'progress') setProgress(event)
            else if (event.type === 'done') setResult(event)
          } catch { /* fragment malformé */ }
        }
      }
    } catch (err) {
      console.error('Échec de l\'import :', err.message)
      setResult({ ok: false })
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = feuille1 && !loading

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="import-page">
      <header className="import-page__header">
        <h1>Import de données</h1>
        <p className="import-page__intro">
          Seule la feuille 1 (« Éléments ») est obligatoire. Les feuilles 2
          (tickets) et 3 (coûts de tickets), ainsi que le fichier ZIP contenant
          les images, sont optionnels et peuvent être importés indépendamment.
          Chaque création dans GLPI est journalisée pour permettre une
          réinitialisation ultérieure.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="import-page__form">
        <div className="import-page__fields">
          <label>
            Feuille 1 — Éléments (CSV)
            <input type="file" accept=".csv" onChange={e => setFeuille1(e.target.files[0])} />
          </label>
          <label>
            Feuille 2 — Tickets (CSV) — optionnel
            <input type="file" accept=".csv" onChange={e => setFeuille2(e.target.files[0])} />
          </label>
          <label>
            Feuille 3 — Coûts de tickets (CSV) — optionnel
            <input type="file" accept=".csv" onChange={e => setFeuille3(e.target.files[0])} />
          </label>
          <label>
            Images (ZIP) — optionnel
            <input type="file" accept=".zip" onChange={e => setImages(e.target.files[0])} />
          </label>
        </div>

        <div className="import-page__form-footer">
          <button type="submit" disabled={!canSubmit} className="import-page__submit">
            {loading ? 'Import en cours…' : 'Lancer l\'import'}
          </button>
        </div>
      </form>

      {/* Barre de progression : indéterminée tant que le premier événement SSE
          n'est pas arrivé (phase d'envoi des fichiers), puis déterminée dès
          que le serveur commence à émettre sa progression. */}
      {loading && (
        <div className="import-page__progress-wrap">
          <p className="import-page__step-label">
            {progress?.label ?? 'Envoi des fichiers…'}
          </p>
          <div
            className="import-page__progress"
            role="progressbar"
            aria-valuenow={progress?.percent ?? 0}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              className={`import-page__progress-bar${!progress ? ' import-page__progress-bar--indeterminate' : ''}`}
              style={progress ? { width: `${progress.percent}%` } : undefined}
            />
          </div>
          {progress && (
            <span className="import-page__percent">{progress.percent} %</span>
          )}
        </div>
      )}

      {result && (
        <div className="import-page__result">
          {result.ok ? (
            <>
              <p className="import-page__success">
                Import terminé avec succès — {result.log.length} opération(s) effectuée(s).
              </p>
              <ul className="import-page__log">
                {result.log.map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            </>
          ) : (
            <p className="import-page__error">
              L'import a échoué. Vérifiez les fichiers sélectionnés et réessayez.
            </p>
          )}
        </div>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeImportPage
