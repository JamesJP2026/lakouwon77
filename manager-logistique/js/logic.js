/* =========================================================
   LOGIQUE MÉTIER — statuts, tarification, numérotation,
   code-barres. Fonctions pures, sans accès au DOM.
========================================================= */

/* ---------- Cycle de vie d'un colis ----------
   Inspiré des « milestones » de Magaya / CargoWise :
   réception entrepôt → consolidation → transit → douane →
   arrivée succursale → retrait / livraison.                */
export const STATUTS = [
  { id: "recu",      label: "Reçu à l'entrepôt",   short: "Entrepôt",   tone: "info"    },
  { id: "consolide", label: "Consolidé (manifeste)", short: "Consolidé", tone: "info"    },
  { id: "transit",   label: "En transit",          short: "Transit",    tone: "accent"  },
  { id: "douane",    label: "En dédouanement",     short: "Douane",     tone: "warn"    },
  { id: "arrive",    label: "Arrivé en Haïti",     short: "Arrivé",     tone: "accent"  },
  { id: "pret",      label: "Prêt pour retrait",   short: "Prêt",       tone: "good"    },
  { id: "livraison", label: "En livraison",        short: "En livraison", tone: "accent" },
  { id: "livre",     label: "Livré",               short: "Livré",      tone: "done"    },
  { id: "probleme",  label: "Exception / bloqué",  short: "Exception",  tone: "bad"     },
];
export const statut = id => STATUTS.find(s => s.id === id) || { id, label: id, short: id, tone: "info" };
export const STATUT_ORDER = Object.fromEntries(STATUTS.map((s, i) => [s.id, i]));

/** Statuts autorisés à partir d'un statut donné (garde-fou contre les erreurs de saisie). */
export function nextStatuts(current) {
  const flow = {
    recu: ["consolide", "transit", "probleme"],
    consolide: ["transit", "recu", "probleme"],
    transit: ["douane", "arrive", "probleme"],
    douane: ["arrive", "probleme"],
    arrive: ["pret", "livraison", "probleme"],
    pret: ["livre", "livraison", "probleme"],
    livraison: ["livre", "pret", "probleme"],
    livre: [],
    probleme: ["recu", "transit", "douane", "arrive", "pret"],
  };
  return flow[current] || [];
}

export const STATUTS_MANIFESTE = [
  { id: "ouvert",  label: "Ouvert (chargement)", tone: "info"   },
  { id: "ferme",   label: "Fermé / prêt",        tone: "warn"   },
  { id: "transit", label: "En transit",          tone: "accent" },
  { id: "douane",  label: "En douane",           tone: "warn"   },
  { id: "arrive",  label: "Arrivé",              tone: "good"   },
];
export const statutManifeste = id => STATUTS_MANIFESTE.find(s => s.id === id) || { id, label: id, tone: "info" };
/** Statut appliqué aux colis quand le manifeste change de statut. */
export const MANIFESTE_TO_COLIS = { ferme: "consolide", transit: "transit", douane: "douane", arrive: "arrive" };

export const METHODES_PAIEMENT = [
  { id: "cash_usd", label: "Cash USD" },
  { id: "cash_htg", label: "Cash HTG" },
  { id: "moncash",  label: "MonCash" },
  { id: "natcash",  label: "NatCash" },
  { id: "carte",    label: "Carte / Zelle (Miami)" },
  { id: "virement", label: "Virement bancaire" },
];
export const methode = id => METHODES_PAIEMENT.find(m => m.id === id)?.label || id;

export const CATEGORIES = ["Vêtements", "Électronique", "Alimentaire", "Pièces auto", "Documents", "Médicaments", "Cosmétiques", "Électroménager", "Divers"];

/* ---------- Tarification ----------
   Poids facturable = max(poids réel, poids volumétrique) pour
   l'aérien (standard IATA : L×l×h en pouces ÷ diviseur).
   Le maritime est facturé au pied cube, avec un minimum.     */
export function poidsVolumetrique(c, diviseur) {
  const v = (+c.longueur || 0) * (+c.largeur || 0) * (+c.hauteur || 0);
  return v > 0 ? v / (diviseur || 166) : 0;
}
export const piedsCubes = c => ((+c.longueur || 0) * (+c.largeur || 0) * (+c.hauteur || 0)) / 1728;

export function calculerFacture(c, settings) {
  const svc = settings.services.find(s => s.id === c.service) || settings.services[0];
  const t = settings.frais;
  const lignes = [];
  let base;
  if (svc.unite === "pi3") {
    const pi3 = Math.max(piedsCubes(c), 0);
    base = Math.max(pi3 * svc.prix, svc.minimum);
    lignes.push({ label: `Fret ${svc.nom} — ${round(pi3, 2)} pi³ × ${money(svc.prix)}`, montant: base });
  } else {
    const vol = poidsVolumetrique(c, settings.diviseurVolumetrique);
    const facturable = Math.max(+c.poids || 0, vol);
    base = Math.max(Math.ceil(facturable) * svc.prix, svc.minimum);
    lignes.push({ label: `Fret ${svc.nom} — ${Math.ceil(facturable)} lb × ${money(svc.prix)}${vol > (+c.poids || 0) ? " (poids volumétrique)" : ""}`, montant: base });
  }
  if (t.manutention) lignes.push({ label: "Manutention", montant: t.manutention * (+c.pieces || 1) });
  if (c.assurance && t.assurancePct) lignes.push({ label: `Assurance (${t.assurancePct} % de la valeur)`, montant: (+c.valeur || 0) * t.assurancePct / 100 });
  if ((+c.valeur || 0) > t.seuilDouane && t.douanePct) lignes.push({ label: `Frais de douane (${t.douanePct} % au-delà de ${money(t.seuilDouane)})`, montant: ((+c.valeur || 0) - t.seuilDouane) * t.douanePct / 100 });
  if (c.livraisonDomicile && t.livraison) lignes.push({ label: "Livraison à domicile", montant: t.livraison });
  if (+c.remise) lignes.push({ label: "Remise", montant: -Math.abs(+c.remise) });
  const total = round(lignes.reduce((s, l) => s + l.montant, 0), 2);
  return { lignes: lignes.map(l => ({ ...l, montant: round(l.montant, 2) })), total, service: svc };
}

export const round = (n, d = 2) => Math.round((+n || 0) * 10 ** d) / 10 ** d;
export const money = n => "$" + (+n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const htg = n => (+n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " HTG";
export const num = (n, d = 1) => (+n || 0).toLocaleString("fr-FR", { maximumFractionDigits: d });
export const fdate = iso => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fdatetime = iso => iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/* ---------- Numérotation ---------- */
const pad = (n, l) => String(n).padStart(l, "0");
export function numeroTracking(seq, date = new Date()) {
  return `ML${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}${pad(seq, 5)}`;
}
export const numeroManifeste = (seq, mode, date = new Date()) =>
  `${mode === "mer" ? "MS" : "MA"}-${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}-${pad(seq, 3)}`;
export const numeroTransfert = (seq, date = new Date()) => `TR-${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}-${pad(seq, 3)}`;
export const numeroReception = (seq, date = new Date()) => `RC-${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}-${pad(seq, 3)}`;
export const LIVREURS_USA = ["Amazon", "UPS", "FedEx", "USPS", "DHL", "OnTrac", "Client (dépôt)", "Autre"];
export const codeClient = seq => `CL-${pad(seq, 4)}`;
export const numeroRecu = seq => `R-${pad(seq, 6)}`;

/* ---------- Code-barres Code 39 (SVG) ----------
   Lisible par n'importe quelle douchette USB standard.       */
const C39 = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};
export function barcodeSvg(text, { height = 56, narrow = 2 } = {}) {
  const wide = narrow * 2.5;
  const chars = ("*" + String(text).toUpperCase().replace(/[^0-9A-Z\-. ]/g, "") + "*").split("");
  let x = 10; const rects = [];
  for (const ch of chars) {
    const p = C39[ch];
    for (let i = 0; i < 9; i++) {
      const w = p[i] === "w" ? wide : narrow;
      if (i % 2 === 0) rects.push(`<rect x="${x}" y="0" width="${w}" height="${height}"/>`);
      x += w;
    }
    x += narrow; // espace inter-caractère
  }
  const width = x + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Code-barres ${text}"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${rects.join("")}</g></svg>`;
}

/* ---------- Modèles de SMS / WhatsApp ---------- */
export function messageStatut(c, client, settings) {
  const s = statut(c.statut);
  const suc = settings.succursales.find(b => b.id === c.destination);
  const base = `${nomEntreprise(settings)}: Bonjour ${client?.nom || ""}, votre colis ${c.tracking}`;
  switch (c.statut) {
    case "recu": return `${base} (${c.description}) a été reçu à notre entrepôt de Miami. Poids: ${c.poids} lb.`;
    case "transit": return `${base} est en route vers Haïti.`;
    case "arrive":
    case "pret": return `${base} est arrivé et prêt pour retrait à ${suc?.nom || "notre succursale"}. Montant: ${money(c._solde ?? 0)}. Horaires: ${settings.entreprise.horaires}.`;
    case "livraison": return `${base} est en cours de livraison. Notre livreur vous contactera.`;
    case "livre": return `${base} a été livré. Mèsi paske w chwazi nou!`;
    default: return `${base} — statut: ${s.label}.`;
  }
}
/** Nom affiché de l'entreprise (à renseigner dans Paramètres). */
export const nomEntreprise = settings => settings.entreprise?.nom?.trim() || "Manager Logistique";
export const waLink = (tel, msg) => `https://wa.me/${String(tel || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;

/* ---------- Acheminement : points de transit et itinéraires ----------
   Chaque manifeste suit un itinéraire fait d'étapes (entrepôt →
   aéroport/port de départ → escales éventuelles → aéroport/port
   d'arrivée → mainlevée douane → succursale). Chaque étape a une date
   prévue et une date réelle : c'est ce qui permet de contrôler les
   retards de bout en bout, comme la « control tower » des TMS.      */
export const TYPES_POINT = [
  { id: "entrepot", label: "Entrepôt" },
  { id: "aeroport", label: "Aéroport" },
  { id: "port", label: "Port maritime" },
  { id: "douane", label: "Douane / poste frontière" },
  { id: "autre", label: "Autre" },
];
export const typePoint = id => TYPES_POINT.find(t => t.id === id)?.label || id;

export const ACTIONS_ETAPE = [
  { id: "chargement", label: "Départ entrepôt / chargement", short: "Chargement", statut: "ferme" },
  { id: "depart",     label: "Départ (décollage / appareillage)", short: "Départ", statut: "transit" },
  { id: "escale",     label: "Escale / transbordement", short: "Escale", statut: null },
  { id: "terrestre",  label: "Transport par camion", short: "Camion", statut: null },
  { id: "arrivee",    label: "Arrivée en Haïti", short: "Arrivée", statut: "douane" },
  { id: "mainlevee",  label: "Mainlevée douane", short: "Mainlevée", statut: null },
  { id: "succursale", label: "Réception en succursale", short: "Succursale", statut: "arrive" },
];
export const actionEtape = id => ACTIONS_ETAPE.find(a => a.id === id) || { id, label: id, short: id, statut: null };

export const DEFAULT_POINTS = [
  { id: "WH-FLL",   nom: "Entrepôt Fort Lauderdale", code: "ENT-FLL", ville: "Fort Lauderdale, FL", pays: "USA", type: "entrepot" },
  { id: "MIA",      nom: "Aéroport international de Miami", code: "MIA", ville: "Miami, FL", pays: "USA", type: "aeroport" },
  { id: "FLL-APT",  nom: "Aéroport Fort Lauderdale-Hollywood", code: "FLL", ville: "Fort Lauderdale, FL", pays: "USA", type: "aeroport" },
  { id: "PEV",      nom: "Port Everglades", code: "USPEF", ville: "Fort Lauderdale, FL", pays: "USA", type: "port" },
  { id: "PMIA",     nom: "PortMiami", code: "USMIA", ville: "Miami, FL", pays: "USA", type: "port" },
  { id: "PAP-APT",  nom: "Aéroport Toussaint Louverture", code: "PAP", ville: "Port-au-Prince", pays: "Haïti", type: "aeroport" },
  { id: "CAP-APT",  nom: "Aéroport de Cap-Haïtien", code: "CAP", ville: "Cap-Haïtien", pays: "Haïti", type: "aeroport" },
  { id: "MANZ",     nom: "Port de Manzanillo (Pepillo Salcedo)", code: "DOMAN", ville: "Montecristi", pays: "Rép. dominicaine", type: "port" },
  { id: "DOPOP",    nom: "Port de Puerto Plata", code: "DOPOP", ville: "Puerto Plata", pays: "Rép. dominicaine", type: "port" },
  { id: "DAJ",      nom: "Poste frontière de Dajabón", code: "DAJ", ville: "Dajabón", pays: "Rép. dominicaine", type: "douane" },
  { id: "OUA",      nom: "Poste frontière de Ouanaminthe (douane)", code: "OUA", ville: "Ouanaminthe", pays: "Haïti", type: "douane" },
  { id: "PAP-PORT", nom: "Port de Port-au-Prince (APN)", code: "HTPAP", ville: "Port-au-Prince", pays: "Haïti", type: "port" },
  { id: "LAFITO",   nom: "Port Lafito", code: "HTLAF", ville: "Lafito", pays: "Haïti", type: "port" },
  { id: "CAP-PORT", nom: "Port de Cap-Haïtien", code: "HTCAP", ville: "Cap-Haïtien", pays: "Haïti", type: "port" },
];

/* Réseau routier haïtien (délais estimés en jours) :
   - succursales de la zone de Port-au-Prince : livrées directement ;
   - Gonaïves et Saint-Marc : sur la route Ouanaminthe → Port-au-Prince (bateau),
     ou desservies par camion depuis Port-au-Prince (avion) ;
   - Jérémie et Les Cayes : camion depuis Port-au-Prince.                     */
export const ZONE_PAP = ["PAP", "RFT", "TAB"];
const DEPUIS_PAP = { GON: 0.5, STM: 0.4, CAY: 1, JER: 1.5 };
const DEPUIS_OUA = { CAP: 0.4, GON: 0.8, STM: 1 };

/** Itinéraire type selon le mode et la succursale de destination. Décalages en jours depuis le départ. */
export function itineraireType(mode, destination, dateDepart) {
  const d0 = new Date(dateDepart || Date.now()).getTime();
  const at = j => new Date(d0 + j * 86400000).toISOString();
  const nord = destination === "CAP";
  // Bateau (Solution Cargo) : Floride → port en République dominicaine → camion jusqu'à la
  // frontière Dajabón / Ouanaminthe (douane haïtienne) → camion de Ouanaminthe vers la
  // succursale : Cap-Haïtien, ou Port-au-Prince (Delmas 95, Route Frères / Technozi) et Jérémie via Port-au-Prince.
  const mer = [["WH-FLL", "chargement", -2], ["PEV", "depart", 0], ["MANZ", "escale", 3], ["DAJ", "terrestre", 4], ["OUA", "arrivee", 5], ["OUA", "mainlevee", 6], ["OUA", "terrestre", 6.2]];
  if (DEPUIS_OUA[destination]) mer.push([destination, "succursale", 6.2 + DEPUIS_OUA[destination]]);
  else if (ZONE_PAP.includes(destination)) mer.push([destination, "succursale", 7.5]);
  else mer.push(["PAP", "terrestre", 7.5], [destination, "succursale", 7.5 + (DEPUIS_PAP[destination] || 1.5)]);
  const air = [["WH-FLL", "chargement", -1], ["MIA", "depart", 0], [nord ? "CAP-APT" : "PAP-APT", "arrivee", 0.2], [nord ? "CAP-APT" : "PAP-APT", "mainlevee", 1]];
  if (nord || ZONE_PAP.includes(destination)) air.push([destination, "succursale", 2]);
  else air.push(["PAP-APT", "terrestre", 1.5], [destination, "succursale", 1.5 + (DEPUIS_PAP[destination] || 1.5)]);
  const route = mode === "mer" ? mer : air;
  return route.map(([pointId, action, j], i) => ({ id: "e" + i + Math.random().toString(36).slice(2, 7), pointId, action, prevu: at(j), reel: null, note: "" }));
}
/** Marque comme réalisées les étapes cohérentes avec un statut de manifeste (données existantes / démo). */
export function etapesPourStatut(etapes, statutM) {
  // Toutes les étapes jusqu'à l'étape clé du statut (incluse) sont considérées comme réalisées
  const cle = { ferme: "chargement", transit: "depart", douane: "arrivee" }[statutM];
  const fin = statutM === "arrive" ? etapes.length - 1 : cle ? etapes.findIndex(e => e.action === cle) : -1;
  etapes.forEach((e, i) => { if (i <= fin) e.reel = e.prevu; });
  return etapes;
}
/** Retard (en jours, > 0) d'une étape non réalisée dont la date prévue est dépassée. */
export const retardEtape = e => !e.reel && e.prevu && Date.now() > new Date(e.prevu).getTime() + 3600000 ? (Date.now() - new Date(e.prevu).getTime()) / 86400000 : 0;
/** Écart (jours) entre réalisé et prévu : > 0 = en retard. */
export const ecartEtape = e => e.reel && e.prevu ? (new Date(e.reel) - new Date(e.prevu)) / 86400000 : 0;
