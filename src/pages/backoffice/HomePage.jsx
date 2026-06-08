import { useNavigate } from 'react-router-dom'
import Layout from '../../components/Layout.jsx'
import { BACKOFFICE_NAV_LINKS } from './navLinks.js'
import './HomePage.css'

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
    <Layout
      title="Backoffice NewApp"
      navLinks={BACKOFFICE_NAV_LINKS}
      actionLabel="Verrouiller"
      onAction={lock}
    >
      <div className="backoffice-home-page">
        <h1>Accueil</h1>
        <p className="backoffice-home-page__intro">
          Bienvenue dans l'espace d'administration de NewApp — utilisez le menu
          à gauche pour accéder au tableau de bord, aux tickets, à l'import ou
          à la réinitialisation des données.
        </p>
      </div>
    </Layout>
  )
}

export default BackofficeHomePage
