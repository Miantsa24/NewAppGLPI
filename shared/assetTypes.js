// ── Types d'assets affichés dans NewApp ───────────────────────────────────────
//
// Source UNIQUE de vérité : NewApp n'affiche (dashboard, Kanban, menus
// Backoffice/FrontOffice, recherche d'éléments, création de ticket...) QUE les
// types listés ici. Pour ajouter ou retirer un type d'asset visible dans
// l'application, il suffit de modifier cette liste — toutes les pages qui
// l'importent s'adaptent automatiquement (menus, routes, dashboard, formulaires).
//
// Note : ceci ne restreint PAS l'IMPORT (server/importPipeline.js), qui peut
// toujours créer n'importe quel itemtype présent dans les CSV — seul l'AFFICHAGE
// est limité ici.
//
// - itemtype : nom GLPI de l'API (v1)
// - slug     : segment d'URL (/elements/<slug>/new, /backoffice/elements/<slug>)
// - label    : libellé pluriel (menus, dashboard, listes)
// - singular : libellé singulier avec article (pages "Créer ...")
export const ASSET_TYPES = [
  { itemtype: 'Computer', slug: 'computers', label: 'Ordinateurs', singular: 'un ordinateur' },
  { itemtype: 'Monitor',  slug: 'monitors',  label: 'Écrans',      singular: 'un écran' },
  { itemtype: 'Phone',    slug: 'phones',    label: 'Téléphones',  singular: 'un téléphone' }
]
