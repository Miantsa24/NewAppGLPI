import { NavLink } from 'react-router-dom'
import './Layout.css'

// Composant de mise en page partagé entre FrontOffice et Backoffice : une
// barre de navigation en haut (identité de l'espace + action principale,
// ex. déconnexion/verrouillage) et un menu latéral à gauche (liens vers les
// pages de l'espace). Les deux espaces le configurent via des props plutôt
// que de dupliquer la structure HTML/CSS.
//
// "navLinks" : tableau d'objets { to, label, end? }. "end" correspond à la
// prop NavLink "end" — nécessaire pour que des routes "racines" comme "/" ou
// "/backoffice" ne restent pas actives en permanence (sans "end", NavLink
// considère qu'un préfixe d'URL correspondant suffit à activer le lien).
function Layout({ title, navLinks, actionLabel, onAction, children }) {
  return (
    <div className="app-layout">
      <header className="app-layout__navbar">
        <span className="app-layout__brand">{title}</span>
        {actionLabel && (
          <button onClick={onAction} className="app-layout__action">
            {actionLabel}
          </button>
        )}
      </header>

      <div className="app-layout__body">
        <nav className="app-layout__sidebar">
          {navLinks.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                isActive ? 'app-layout__link app-layout__link--active' : 'app-layout__link'
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="app-layout__content">
          {children}
        </main>
      </div>
    </div>
  )
}

export default Layout
