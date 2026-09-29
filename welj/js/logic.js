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
  return `WX${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}${pad(seq, 5)}`;
}
export const numeroManifeste = (seq, mode, date = new Date()) =>
  `${mode === "mer" ? "MS" : "MA"}-${pad(date.getFullYear() % 100, 2)}${pad(date.getMonth() + 1, 2)}-${pad(seq, 3)}`;
export const codeClient = seq => `WELJ-${pad(seq, 4)}`;
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
  const base = `${settings.entreprise.nom}: Bonjour ${client?.nom || ""}, votre colis ${c.tracking}`;
  switch (c.statut) {
    case "recu": return `${base} (${c.description}) a été reçu à notre entrepôt de Miami. Poids: ${c.poids} lb.`;
    case "transit": return `${base} est en route vers Haïti.`;
    case "arrive":
    case "pret": return `${base} est arrivé et prêt pour retrait à ${suc?.nom || "notre succursale"}. Montant: ${money(c._solde ?? 0)}. Horaires: ${settings.entreprise.horaires}.`;
    case "livraison": return `${base} est en cours de livraison. Notre livreur vous contactera.`;
    case "livre": return `${base} a été livré. Mèsi paske w chwazi WELJ Express!`;
    default: return `${base} — statut: ${s.label}.`;
  }
}
export const waLink = (tel, msg) => `https://wa.me/${String(tel || "").replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
