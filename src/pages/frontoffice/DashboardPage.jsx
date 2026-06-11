import { Link } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { FRONTOFFICE_NAV_LINKS } from './navLinks.js'
import './DashboardPage.css'

// Tableau de bord FrontOffice — page d'accueil sans authentification.
// Affiche 3 cartes de navigation rapide vers les fonctionnalités principales.
function DashboardPage() {
  return (
    <Layout title="NewApp GLPI" navLinks={FRONTOFFICE_NAV_LINKS}>
      <div className="dashboard-page">
        <h1>Tableau de bord</h1>
        <p className="dashboard-page__intro">
          Bienvenue sur NewApp GLPI. Choisissez une action ci-dessous ou utilisez le menu latéral.
        </p>

        <div className="dashboard-page__cards">
          <Link to="/kanban" className="dashboard-page__card">
            <span className="dashboard-page__card-title">Kanban</span>
            <span className="dashboard-page__card-desc">
              Visualisez et déplacez vos tickets entre les différentes étapes de traitement.
            </span>
          </Link>

          <Link to="/elements" className="dashboard-page__card">
            <span className="dashboard-page__card-title">Rechercher des éléments</span>
            <span className="dashboard-page__card-desc">
              Parcourez le parc informatique — ordinateurs, écrans et téléphones.
            </span>
          </Link>

          <Link to="/tickets/new" className="dashboard-page__card">
            <span className="dashboard-page__card-title">Créer un ticket</span>
            <span className="dashboard-page__card-desc">
              Déclarez un incident ou soumettez une demande de service.
            </span>
          </Link>
        </div>
      </div>
    </Layout>
  )
}

export default DashboardPage
