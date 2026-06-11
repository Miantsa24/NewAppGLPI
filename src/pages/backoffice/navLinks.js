import { ASSET_TYPES } from '../../../shared/assetTypes.js'

// Liens de navigation du Backoffice — centralisés ici pour que toutes les
// pages affichent EXACTEMENT le même menu dans la sidebar (Layout). "end: true"
// sur "/backoffice" évite que ce lien reste actif sur toutes les sous-pages
// (sans ça, NavLink considère que "/backoffice/tickets" commence par
// "/backoffice" et active aussi ce lien).
//
// Chaque entrée est soit un lien direct ({ to, label, end? }), soit un groupe
// ({ category, links }) affiché sous un en-tête dans la sidebar (voir Layout.jsx).
//
// Le menu "Assets" est généré depuis ASSET_TYPES (shared/assetTypes.js) — la
// source unique des types d'assets affichés dans NewApp.
export const BACKOFFICE_NAV_LINKS = [
  { to: '/backoffice/dashboard',       label: 'Dashboard' },
  {
    category: 'Assets',
    links: ASSET_TYPES.map(({ slug, label }) => ({ to: `/backoffice/elements/${slug}`, label }))
  },
  {
    category: 'Assistance',
    links: [
      { to: '/backoffice/tickets',   label: 'Tickets' },
      { to: '/backoffice/costs/new', label: 'Ajouter un coût' }
    ]
  },
  {
    category: 'Configuration',
    links: [
      { to: '/backoffice/kanban-settings', label: 'Paramètres Kanban' },
      { to: '/backoffice/import',          label: 'Importer des données' },
      { to: '/backoffice/reset',           label: 'Réinitialiser les données' }
    ]
  },
  { to: '/',                            label: '→ FrontOffice',              end: true }
]
