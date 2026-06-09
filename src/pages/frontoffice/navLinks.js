// Liens de navigation du FrontOffice — centralisés ici pour que toutes les
// pages affichent EXACTEMENT le même menu dans la sidebar (Layout). "end: true"
// sur "/" évite que ce lien reste actif sur toutes les autres pages (sans ça,
// NavLink considère que "/elements" commence par "/" et active aussi ce lien).
export const FRONTOFFICE_NAV_LINKS = [
  { to: '/',                    label: 'Tableau de bord',        end: true },
  { to: '/elements',            label: 'Rechercher des éléments' },
  { to: '/elements/computers/new', label: 'Créer un ordinateur' },
  { to: '/elements/monitors/new',  label: 'Créer un écran' },
  { to: '/elements/others/new',    label: 'Créer un autre élément' },
  { to: '/tickets/new',         label: 'Créer un ticket' }
]
