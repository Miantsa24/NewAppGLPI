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

  // ── Autres types d'assets gérés par GLPI, désactivés pour l'instant ─────────
  // Pour réafficher l'un de ces types partout dans NewApp (dashboard, menus,
  // routes, formulaires), il suffit de décommenter sa ligne et de l'ajouter
  // au tableau ci-dessus — aucun autre fichier à modifier.
  // { itemtype: 'NetworkEquipment',   slug: 'network-equipments',     label: 'Équipements réseau',       singular: 'un équipement réseau' },
  // { itemtype: 'Peripheral',         slug: 'peripherals',            label: 'Périphériques',            singular: 'un périphérique' },
  // { itemtype: 'Printer',            slug: 'printers',               label: 'Imprimantes',              singular: 'une imprimante' },
  // { itemtype: 'Enclosure',          slug: 'enclosures',             label: 'Châssis',                  singular: 'un châssis' },
  // { itemtype: 'PDU',                slug: 'pdus',                   label: 'Blocs de prises (PDU)',    singular: 'un bloc de prises (PDU)' },
  // { itemtype: 'PassiveDCEquipment', slug: 'passive-dc-equipments',  label: 'Équipements passifs',      singular: 'un équipement passif' },
  // { itemtype: 'Cable',              slug: 'cables',                 label: 'Câbles',                   singular: 'un câble' },
  // { itemtype: 'Appliance',          slug: 'appliances',             label: 'Appliances',               singular: 'une appliance' },
  // { itemtype: 'Software',           slug: 'software',               label: 'Logiciels',                singular: 'un logiciel' },
  // { itemtype: 'SoftwareLicense',    slug: 'software-licenses',      label: 'Licences logicielles',     singular: 'une licence logicielle' },
  // { itemtype: 'Certificate',        slug: 'certificates',           label: 'Certificats',              singular: 'un certificat' },
  // { itemtype: 'Rack',               slug: 'racks',                  label: 'Racks',                    singular: 'un rack' }
]
