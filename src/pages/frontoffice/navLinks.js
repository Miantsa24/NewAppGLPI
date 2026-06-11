import { ASSET_TYPES } from '../../../shared/assetTypes.js'

// Liens de navigation du FrontOffice — centralisés ici pour que toutes les
// pages affichent EXACTEMENT le même menu dans la sidebar (Layout). "end: true"
// sur "/" évite que ce lien reste actif sur toutes les autres pages (sans ça,
// NavLink considère que "/elements" commence par "/" et active aussi ce lien).
//
// Chaque entrée est soit un lien direct ({ to, label, end? }), soit un groupe
// ({ category, links }) affiché sous un en-tête dans la sidebar (voir Layout.jsx).
//
// Le menu "Assets" est généré depuis ASSET_TYPES (shared/assetTypes.js) — la
// source unique des types d'assets affichés dans NewApp.
export const FRONTOFFICE_NAV_LINKS = [
  { to: '/',                    label: 'Tableau de bord',        end: true },
  {
    category: 'Assets',
    links: [
      { to: '/elements', label: 'Rechercher des éléments' },
      ...ASSET_TYPES.map(({ slug, singular }) => ({ to: `/elements/${slug}/new`, label: `Créer ${singular}` }))
    ]
  },
  {
    category: 'Assistance',
    links: [
      { to: '/kanban',     label: 'Kanban' },
      { to: '/tickets/new', label: 'Créer un ticket' }
    ]
  },
  { to: '/backoffice',          label: '→ Backoffice',           end: true }
]
