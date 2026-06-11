import { Link } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import { ASSET_TYPES } from '../../../shared/assetTypes.js'
import './DashboardPage.css'

// Icônes décoratives (SVG inline, "stroke: currentColor") — pas de dépendance
// supplémentaire pour 3 pictogrammes simples.
function KanbanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="6" height="18" rx="1.5" />
      <rect x="14" y="3" width="7" height="11" rx="1.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z" />
      <line x1="12" y1="5" x2="12" y2="19" strokeDasharray="2 3" />
    </svg>
  )
}

// Icône générique "ajouter un élément" — réutilisée pour les 3 cartes de
// création d'asset (Computer, Monitor, Phone), générées depuis ASSET_TYPES.
function AddBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

// Tableau de bord FrontOffice — page d'accueil sans authentification.
// Affiche 3 cartes de navigation rapide vers les fonctionnalités principales.
function DashboardPage() {
  return (
    <Layout title="NewApp GLPI" navLinks={FRONTOFFICE_NAV_LINKS}>
      <div className="dashboard-page">
        <header className="dashboard-page__header">
          <h1>Tableau de bord</h1>
          <p className="dashboard-page__intro">
            Bienvenue sur NewApp GLPI. Choisissez une action ci-dessous ou utilisez le menu latéral.
          </p>
        </header>

        <div className="dashboard-page__cards">
          <Link to="/kanban" className="dashboard-page__card">
            <span className="dashboard-page__card-icon dashboard-page__card-icon--kanban"><KanbanIcon /></span>
            <span className="dashboard-page__card-body">
              <span className="dashboard-page__card-title">Kanban</span>
              <span className="dashboard-page__card-desc">
                Visualisez et déplacez vos tickets entre les différentes étapes de traitement.
              </span>
            </span>
          </Link>

          <Link to="/elements" className="dashboard-page__card">
            <span className="dashboard-page__card-icon dashboard-page__card-icon--search"><SearchIcon /></span>
            <span className="dashboard-page__card-body">
              <span className="dashboard-page__card-title">Rechercher des éléments</span>
              <span className="dashboard-page__card-desc">
                Parcourez le parc informatique — ordinateurs, écrans et téléphones.
              </span>
            </span>
          </Link>

          <Link to="/tickets/new" className="dashboard-page__card">
            <span className="dashboard-page__card-icon dashboard-page__card-icon--ticket"><TicketIcon /></span>
            <span className="dashboard-page__card-body">
              <span className="dashboard-page__card-title">Créer un ticket</span>
              <span className="dashboard-page__card-desc">
                Déclarez un incident ou soumettez une demande de service.
              </span>
            </span>
          </Link>

          {/* Une carte par type d'asset (ASSET_TYPES) — même source que le menu
              "Assets" de la sidebar (voir navLinks.js). */}
          {ASSET_TYPES.map(({ slug, singular }) => (
            <Link key={slug} to={`/elements/${slug}/new`} className="dashboard-page__card">
              <span className="dashboard-page__card-icon dashboard-page__card-icon--asset"><AddBoxIcon /></span>
              <span className="dashboard-page__card-body">
                <span className="dashboard-page__card-title">Créer {singular}</span>
                <span className="dashboard-page__card-desc">
                  Ajoutez {singular} au parc informatique.
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  )
}

export default DashboardPage
