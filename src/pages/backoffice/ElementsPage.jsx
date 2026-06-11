import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession } from './api.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './ElementsPage.css'

// "Item_Type" (colonne du CSV d'import, voir importPipeline.js) — la page ne
// liste qu'un seul itemtype à la fois, donc cette valeur est identique pour
// toutes les cartes. On la dérive de ASSET_TYPES (ex. "un ordinateur" → "Ordinateur").
function itemTypeLabel(itemtype) {
  const entry = ASSET_TYPES.find(t => t.itemtype === itemtype)
  if (!entry) return itemtype
  return entry.singular.replace(/^(un|une)\s+/, '').replace(/^./, c => c.toUpperCase())
}

// onLock : même rôle que dans BackofficeTicketsPage — prévenir App que l'accès
// backoffice doit être reverrouillé.
//
// "itemtype" : type GLPI fixe pour la page (Computer, Monitor, Phone) — un seul
// composant générique pour les trois entrées de menu (Ordinateurs / Téléphones
// / Écrans).
function BackofficeElementsPage({ onLock, pageTitle, itemtype, intro }) {
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
    onLock()
    navigate('/backoffice/login')
  }

  const [elements, setElements] = useState(null)
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setElements(null)

    async function loadElements() {
      try {
        const response = await fetch(`http://localhost:3001/api/backoffice/elements/${itemtype}`)
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setElements(data.elements)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement des éléments :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement des éléments :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadElements()
    return () => { cancelled = true }
  }, [itemtype])

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="backoffice-elements-page">
        <header className="backoffice-elements-page__header">
          <h1>{pageTitle}</h1>
          <p className="backoffice-elements-page__intro">{intro}</p>
        </header>

        {loading && <p>Chargement…</p>}

        {error && (
          <p className="backoffice-elements-page__error">
            Impossible de charger la liste. Réessayez dans quelques instants.
          </p>
        )}

        {elements && elements.length === 0 && (
          <p className="backoffice-elements-page__empty">Aucun élément pour le moment.</p>
        )}

        {elements && elements.length > 0 && (
          <div className="backoffice-elements-page__cards">
            {elements.map(element => (
              <Link
                key={element.id}
                to={`/backoffice/elements/${itemtype}/${element.id}`}
                className="element-card"
              >
                <div className="element-card__image">
                  <img
                    src={`http://localhost:3001/api/backoffice/elements/${itemtype}/${element.id}/image`}
                    alt=""
                    loading="lazy"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                  <span className="element-card__placeholder" aria-hidden="true">{itemtype[0]}</span>
                </div>
                <div className="element-card__body">
                  <h3 className="element-card__name">{element.name}</h3>
                  <dl className="element-card__details">
                    <div>
                      <dt>Statut</dt>
                      <dd>{element.status ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Emplacement</dt>
                      <dd>{element.location ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Fabricant</dt>
                      <dd>{element.manufacturer ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Type</dt>
                      <dd>{itemTypeLabel(itemtype)}</dd>
                    </div>
                    <div>
                      <dt>Modèle</dt>
                      <dd>{element.model ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>N° d'inventaire</dt>
                      <dd>{element.inventoryNumber ?? '—'}</dd>
                    </div>
                  </dl>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}

export default BackofficeElementsPage
