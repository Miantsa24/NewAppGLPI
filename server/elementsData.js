// ── Données des pages Éléments du Backoffice (listes + fiches détail) ─────────
//
// Même principe que ticketsData.js : lecture EN DIRECT depuis GLPI via une
// session v1 dédiée (le Backoffice n'a pas de token OAuth2).
//
// La v1 renvoie des champs "plats" — des identifiants de relation comme
// "locations_id", "manufacturers_id", "states_id" — plutôt que des objets
// imbriqués { id, name } comme la v2 (vérifié en lisant un Computer brut).
// Pour la LISTE, on se contente des champs déjà présents (rapide, aucun appel
// supplémentaire). Pour la FICHE DÉTAIL, on résout ces identifiants en libellés
// lisibles via des appels getItem ciblés — même logique que getTicketDetail,
// qui résout déjà les éléments associés à un ticket de la même façon.

import * as glpi from './glpiV1Client.js'

// "0" : convention GLPI pour "relation non renseignée" (visible sur les champs
// bruts : networks_id, computertypes_id...) — on la traite comme "absente", au
// même titre que null, plutôt que d'aller chercher un item d'id 0 qui n'existe pas.
async function resolveName(sessionToken, itemtype, id) {
  if (!id) return null
  try {
    const item = await glpi.getItem(sessionToken, itemtype, id)
    return item.name
  } catch {
    return null
  }
}

// "?? null" : uniformise les valeurs absentes (GLPI renvoie tantôt null, tantôt
// une chaîne vide selon le champ) — le frontend n'a alors qu'un seul cas à gérer.
function summarize(item) {
  return {
    id:          item.id,
    name:        item.name,
    serial:      item.serial      || null,
    otherserial: item.otherserial || null,
    comment:     item.comment     || null
  }
}

// ── Liste des éléments d'un type donné ────────────────────────────────────────
// "itemtype" couvre les types d'"assets" affichés par ce projet (voir
// shared/assetTypes.js : Computer, Monitor, Phone) — un seul module générique,
// comme la recherche FrontOffice (ElementsPage) qui traite déjà ces types de
// façon uniforme.
//
// Les cartes du Backoffice affichent Statut/Emplacement/Fabricant/Modèle en plus
// du nom et du n° d'inventaire (serial) — on résout ces relations en UNE passe
// par type (Location/State/Manufacturer/<Itemtype>Model), comme le fait déjà
// la recherche FrontOffice (/api/frontoffice/elements), plutôt qu'un appel par
// élément (qui serait beaucoup plus lent sur un inventaire complet).
export async function listElements(itemtype) {
  const sessionToken = await glpi.openSession()
  try {
    const modelType  = `${itemtype}Model`
    const modelField = `${itemtype.toLowerCase()}models_id`

    const [items, locations, states, manufacturers, models] = await Promise.all([
      glpi.listItems(sessionToken, itemtype),
      glpi.listItems(sessionToken, 'Location'),
      glpi.listItems(sessionToken, 'State'),
      glpi.listItems(sessionToken, 'Manufacturer'),
      glpi.listItems(sessionToken, modelType)
    ])

    const locationById     = new Map(locations.map(x => [x.id, x.name]))
    const stateById        = new Map(states.map(x => [x.id, x.name]))
    const manufacturerById = new Map(manufacturers.map(x => [x.id, x.name]))
    const modelById        = new Map(models.map(x => [x.id, x.name]))

    // Tri alphabétique : plus naturel pour parcourir un inventaire qu'un tri
    // par id (qui ne reflète que l'ordre de création).
    return items
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(item => ({
        id:              item.id,
        name:            item.name,
        inventoryNumber: item.serial || null,
        status:          stateById.get(item.states_id)              ?? null,
        location:        locationById.get(item.locations_id)        ?? null,
        manufacturer:    manufacturerById.get(item.manufacturers_id) ?? null,
        model:           modelById.get(item[modelField])             ?? null
      }))
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Image associée à un élément (import ZIP — voir importPipeline.js) ─────────
// Un élément peut avoir 0 ou plusieurs Document_Item liés ; on affiche le
// premier (l'import n'en associe qu'un seul par élément, voir importImages).
// Renvoie null si aucune image n'est associée — la route appelante répond
// alors 404, et le frontend affiche un visuel de remplacement.
export async function getElementImage(itemtype, id) {
  const sessionToken = await glpi.openSession()
  try {
    const docLinks = await glpi.listSubItems(sessionToken, itemtype, id, 'Document_Item')
    if (docLinks.length === 0) return null
    return await glpi.downloadDocument(sessionToken, docLinks[0].documents_id)
  } finally {
    await glpi.closeSession(sessionToken)
  }
}

// ── Fiche détail d'un élément ──────────────────────────────────────────────────
// En plus des champs simples, on résout les TROIS relations communes aux
// "assets" gérés par ce projet : emplacement, fabricant, statut — les mêmes
// que ceux déjà affichés par la recherche FrontOffice (ElementsPage), pour que
// les deux espaces présentent une vision cohérente d'un même élément.
export async function getElementDetail(itemtype, id) {
  const sessionToken = await glpi.openSession()
  try {
    const item = await glpi.getItem(sessionToken, itemtype, id)

    const modelType  = `${itemtype}Model`
    const modelField = `${itemtype.toLowerCase()}models_id`

    const [location, manufacturer, status, model] = await Promise.all([
      resolveName(sessionToken, 'Location',     item.locations_id),
      resolveName(sessionToken, 'Manufacturer', item.manufacturers_id),
      resolveName(sessionToken, 'State',        item.states_id),
      resolveName(sessionToken, modelType,      item[modelField])
    ])

    return {
      ...summarize(item),
      location,
      manufacturer,
      status,
      model
    }
  } finally {
    await glpi.closeSession(sessionToken)
  }
}
