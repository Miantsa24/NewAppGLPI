import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './ImportPage.css'

// Page d'import : un formulaire à 4 champs fichiers (3 CSV + 1 ZIP), envoyés
// en une seule requête "multipart/form-data" — le même format qu'un <form> HTML
// classique avec <input type="file">, mais construit ici en JavaScript via
// l'objet FormData (API native du navigateur).
// onLock : même rôle que dans BackofficeHomePage — prévenir App que l'accès
// backoffice doit être reverrouillé (le bouton apparaît dans la navbar partagée).
function BackofficeImportPage({ onLock }) {
  const navigate = useNavigate()

  function lock() {
    sessionStorage.removeItem('backoffice_unlocked')
    onLock()
    navigate('/backoffice/login')
  }

  // Un état par fichier sélectionné : on affiche le nom du fichier choisi,
  // et ça permet de vérifier que les 4 champs sont bien remplis avant l'envoi.
  const [feuille1, setFeuille1] = useState(null)
  const [feuille2, setFeuille2] = useState(null)
  const [feuille3, setFeuille3] = useState(null)
  const [images,   setImages]   = useState(null)

  // "loading" désactive le bouton pendant l'envoi (l'import peut prendre du
  // temps : plusieurs dizaines d'appels à l'API GLPI s'enchaînent côté serveur).
  const [loading, setLoading] = useState(false)

  // "result" stocke la réponse du serveur : { ok, log } en cas de succès,
  // ou { ok: false, error } en cas d'échec — affiché tel quel à l'écran.
  const [result, setResult] = useState(null)

  async function handleSubmit(event) {
    // Empêche le rechargement de page par défaut d'un <form> HTML —
    // on veut gérer l'envoi nous-mêmes, en JavaScript, sans navigation.
    event.preventDefault()

    // FormData : structure native du navigateur représentant un corps
    // "multipart/form-data". Chaque .append(nom, fichier) ajoute un champ —
    // les noms ("feuille1", "feuille2"...) doivent correspondre EXACTEMENT
    // à ceux attendus par multer côté serveur (upload.fields([{ name: ... }])).
    const formData = new FormData()
    formData.append('feuille1', feuille1)
    formData.append('feuille2', feuille2)
    formData.append('feuille3', feuille3)
    formData.append('images',   images)

    setLoading(true)
    setResult(null)

    try {
      // Pas d'en-tête "Content-Type" à fixer manuellement : le navigateur le
      // génère lui-même à partir d'un FormData, AVEC la "boundary" (frontière)
      // correcte qui sépare les parties du corps multipart. Le fixer à la main
      // casserait l'envoi (boundary manquante ou incohérente).
      const response = await fetch('http://localhost:3001/api/backoffice/import', {
        method: 'POST',
        body:   formData
      })
      const data = await response.json()
      // Le détail technique part dans la console — l'affichage à l'écran
      // (ci-dessous) ne montre qu'un message en texte clair en cas d'échec.
      if (!data.ok) console.error('Échec de l\'import :', data.error)
      setResult(data)
    } catch (err) {
      console.error('Échec de l\'import :', err.message)
      setResult({ ok: false })
    } finally {
      setLoading(false)
    }
  }

  // Tous les champs doivent être remplis pour activer le bouton d'envoi.
  const canSubmit = feuille1 && feuille2 && feuille3 && images && !loading

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="import-page">
      <h1>Import de données</h1>
      <p className="import-page__intro">
        Sélectionnez les 3 fichiers CSV (« Import-data-juin-26 ») et le fichier
        ZIP contenant les images, puis lancez l'import. Chaque création dans
        GLPI est journalisée pour permettre une réinitialisation ultérieure.
      </p>

      <form onSubmit={handleSubmit} className="import-page__form">
        <label>
          Feuille 1 — Éléments (CSV)
          <input type="file" accept=".csv" onChange={e => setFeuille1(e.target.files[0])} />
        </label>

        <label>
          Feuille 2 — Tickets (CSV)
          <input type="file" accept=".csv" onChange={e => setFeuille2(e.target.files[0])} />
        </label>

        <label>
          Feuille 3 — Coûts de tickets (CSV)
          <input type="file" accept=".csv" onChange={e => setFeuille3(e.target.files[0])} />
        </label>

        <label>
          Images (ZIP)
          <input type="file" accept=".zip" onChange={e => setImages(e.target.files[0])} />
        </label>

        <button type="submit" disabled={!canSubmit} className="import-page__submit">
          {loading ? 'Import en cours…' : 'Lancer l\'import'}
        </button>
      </form>

      {/* Barre de progression indéterminée : le serveur traite tout en une seule
          requête et ne renvoie le résultat qu'à la toute fin — impossible de
          connaître une vraie progression en %. La barre s'anime juste en boucle
          pour montrer que l'import est en cours (pattern courant pour ce cas). */}
      {loading && (
        <div className="import-page__progress" role="progressbar" aria-label="Import en cours">
          <div className="import-page__progress-bar"></div>
        </div>
      )}

      {result && (
        <div className="import-page__result">
          {result.ok ? (
            <>
              <p className="import-page__success">
                Import terminé avec succès — {result.log.length} opération(s) effectuée(s).
              </p>
              {/* "log" : tableau de messages texte renvoyé par le pipeline,
                  un par opération effectuée (création, association, ou ignorée). */}
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
