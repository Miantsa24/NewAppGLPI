import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import { clearBackofficeSession } from './api.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './ElementDetailPage.css'

// Retrouve la page-liste d'origine à partir du type GLPI de l'élément affiché —
// nécessaire pour le lien "Retour" : Ordinateurs et Écrans ont chacun leur menu
// dédié, les 4 autres types partagent la page "Autres éléments".
function listPathFor(itemtype) {
  if (itemtype === 'Computer') return '/backoffice/elements/computers'
  if (itemtype === 'Monitor')  return '/backoffice/elements/monitors'
  return '/backoffice/elements/others'
}

// Libellé lisible du type GLPI (ex. "Computer" → "Ordinateurs") — repris de la
// même source que les menus et le dashboard (shared/assetTypes.js).
function itemTypeLabel(itemtype) {
  return ASSET_TYPES.find(t => t.itemtype === itemtype)?.label ?? itemtype
}

const LIST_LABELS = {
  computers: 'la liste des ordinateurs',
  monitors:  'la liste des écrans',
  others:    'la liste des autres éléments'
}

// useParams() lit ":itemtype" et ":id" dans l'URL (ex. "/backoffice/elements/Computer/64")
// — un seul composant générique couvre les 6 types, comme la fiche détail des
// tickets (BackofficeTicketDetailPage) couvre tous les tickets.
// onLock : même rôle que BackofficeTicketDetailPage — reverrouille l'accès backoffice.
function BackofficeElementDetailPage({ onLock }) {
  const { itemtype, id } = useParams()
  const navigate = useNavigate()

  function lock() {
    clearBackofficeSession()
    onLock()
    navigate('/backoffice/login')
  }

  const [element, setElement] = useState(null)
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(true)

  // [itemtype, id] en dépendance : si on navigue d'une fiche à une autre sans
  // démontage, l'effet relance le chargement avec les nouveaux paramètres.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setElement(null)

    async function loadElement() {
      try {
        const response = await fetch(`http://localhost:3001/api/backoffice/elements/${itemtype}/${id}`)
        const data = await response.json()
        if (cancelled) return

        if (data.ok) {
          setElement(data.element)
        } else {
          // Le détail technique part dans la console — l'utilisateur ne voit
          // qu'un message en texte clair (pas de JSON brut à l'écran).
          console.error('Échec du chargement de l\'élément :', data.error)
          setError(true)
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Échec du chargement de l\'élément :', err.message)
          setError(true)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadElement()
    return () => { cancelled = true }
  }, [itemtype, id])

  const listPath = listPathFor(itemtype)

  return (
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
    <div className="element-detail-page">
      <Link to={listPath} className="element-detail-page__back">
        ← Retour à {LIST_LABELS[listPath.split('/').pop()]}
      </Link>

      {loading && <p>Chargement…</p>}

      {error && (
        <p className="element-detail-page__error">
          Impossible de charger cet élément. Réessayez dans quelques instants.
        </p>
      )}

      {element && (
        <>
          <h1 className="element-detail-page__title">{element.name}</h1>

          <div className="element-detail-page__main">
            <div className="element-detail-page__image">
              <img
                src={`http://localhost:3001/api/backoffice/elements/${itemtype}/${id}/image`}
                alt=""
                onError={e => { e.currentTarget.style.display = 'none' }}
              />
              <span className="element-detail-page__placeholder" aria-hidden="true">
                {itemtype[0]}
              </span>
            </div>

            <dl className="element-detail-page__info">
              <div className="element-detail-page__info-row">
                <dt>Nom</dt>
                <dd>{element.name}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>Statut</dt>
                <dd>{element.status ?? '—'}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>Emplacement</dt>
                <dd>{element.location ?? '—'}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>Fabricant</dt>
                <dd>{element.manufacturer ?? '—'}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>Type</dt>
                <dd>{itemTypeLabel(itemtype)}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>Modèle</dt>
                <dd>{element.model ?? '—'}</dd>
              </div>
              <div className="element-detail-page__info-row">
                <dt>N° d'inventaire</dt>
                <dd>{element.serial ?? '—'}</dd>
              </div>
            </dl>
          </div>

          <section className="element-detail-page__section">
            <h2>Commentaire</h2>
            {/* white-space: pre-wrap (voir CSS) : GLPI conserve les sauts de
                ligne du commentaire — sans cette règle ils seraient ignorés. */}
            <p className="element-detail-page__content">
              {element.comment || '(aucun commentaire)'}
            </p>
          </section>
        </>
      )}
    </div>
    </Layout>
  )
}

export default BackofficeElementDetailPage
