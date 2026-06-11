import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import './Layout.css'

function linkClassName({ isActive }) {
  return isActive ? 'app-layout__link app-layout__link--active' : 'app-layout__link'
}

// Composant de mise en page partagé entre FrontOffice et Backoffice : une
// barre de navigation en haut (identité de l'espace + action principale,
// ex. déconnexion/verrouillage) et un menu latéral à gauche (liens vers les
// pages de l'espace). Les deux espaces le configurent via des props plutôt
// que de dupliquer la structure HTML/CSS.
//
// "navLinks" : tableau d'entrées de deux formes possibles :
//   - { to, label, end? } : lien direct. "end" correspond à la prop NavLink
//     "end" — nécessaire pour que des routes "racines" comme "/" ou
//     "/backoffice" ne restent pas actives en permanence (sans "end", NavLink
//     considère qu'un préfixe d'URL correspondant suffit à activer le lien).
//   - { category, links } : groupe de liens affiché comme une liste déroulante,
//     repliée par défaut sauf si l'une de ses pages est la page courante.
function Layout({ title, navLinks, actionLabel, onAction, children }) {
  const location = useLocation()

  const [openCategories, setOpenCategories] = useState(() => {
    const initial = {}
    for (const item of navLinks) {
      if (item.category) {
        initial[item.category] = item.links.some(link => location.pathname.startsWith(link.to))
      }
    }
    return initial
  })

  function toggleCategory(category) {
    setOpenCategories(current => ({ ...current, [category]: !current[category] }))
  }

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
          {navLinks.map(item => (
            item.category ? (
              <div className="app-layout__group" key={item.category}>
                <button
                  type="button"
                  className="app-layout__group-toggle"
                  aria-expanded={!!openCategories[item.category]}
                  onClick={() => toggleCategory(item.category)}
                >
                  <span>{item.category}</span>
                  <span className="app-layout__group-arrow">
                    {openCategories[item.category] ? '▾' : '▸'}
                  </span>
                </button>
                {openCategories[item.category] && (
                  <div className="app-layout__group-links">
                    {item.links.map(({ to, label, end }) => (
                      <NavLink key={to} to={to} end={end} className={linkClassName}>
                        {label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} className={linkClassName}>
                {item.label}
              </NavLink>
            )
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
