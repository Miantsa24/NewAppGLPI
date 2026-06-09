// Liens de navigation du Backoffice — centralisés ici pour que toutes les
// pages affichent EXACTEMENT le même menu dans la sidebar (Layout). "end: true"
// sur "/backoffice" évite que ce lien reste actif sur toutes les sous-pages
// (sans ça, NavLink considère que "/backoffice/tickets" commence par
// "/backoffice" et active aussi ce lien).
export const BACKOFFICE_NAV_LINKS = [
  { to: '/backoffice',                 label: 'Accueil',                   end: true },
  { to: '/backoffice/dashboard',       label: 'Dashboard' },
  { to: '/backoffice/tickets',         label: 'Tickets' },
  { to: '/backoffice/elements/computers', label: 'Ordinateurs' },
  { to: '/backoffice/elements/monitors',  label: 'Écrans' },
  { to: '/backoffice/elements/others',    label: 'Autres éléments' },
  { to: '/backoffice/kanban-settings', label: 'Paramètres Kanban' },
  { to: '/backoffice/import',          label: 'Importer des données' },
  { to: '/backoffice/reset',           label: 'Réinitialiser les données' }
]
