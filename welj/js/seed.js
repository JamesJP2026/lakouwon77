/* =========================================================
   DONNÉES INITIALES
   Informations publiques de WELJ Express Services (adresse,
   téléphone, horaires, succursales). Les TARIFS sont des
   valeurs d'exemple : à remplacer dans Paramètres par la
   grille officielle de la compagnie.
========================================================= */
import { numeroTracking, numeroManifeste, codeClient, numeroRecu, calculerFacture, DEFAULT_POINTS, itineraireType, etapesPourStatut } from "./logic.js";

// Succursales ajoutées au réseau (Gonaïves et Saint-Marc : ouverture prochaine)
const NOUVELLES_SUCCURSALES = [
  { id: "TAB", nom: "Succursale Tabarre", ville: "Tabarre", type: "destination", telephone: "" },
  { id: "CAY", nom: "Succursale Les Cayes", ville: "Les Cayes", type: "destination", telephone: "" },
  { id: "GON", nom: "Succursale Gonaïves", ville: "Gonaïves", type: "destination", telephone: "", actif: false },
  { id: "STM", nom: "Succursale Saint-Marc", ville: "Saint-Marc", type: "destination", telephone: "", actif: false },
];

export function defaultSettings() {
  return {
    entreprise: {
      nom: "WELJ Express Services",
      slogan: "Express shipping to Haiti",
      telephone: "+509 38 34 7343",
      telephoneUS: "+1 786 350 7565",
      email: "info@welj-ht.com",
      site: "welj-ht.com",
      adresse: "#7, Route de Jacquet, Delmas 95, Port-au-Prince, Haïti",
      adresseUS: "6600 NW 12th Ave Ste 215, Fort Lauderdale, FL 33309",
      horaires: "Lun–Ven 8h–16h, Sam 8h–13h",
    },
    tauxChange: 132,
    // Transporteurs par défaut proposés à la création d'un envoi
    transporteurs: { air: "Amerijet", mer: "Solution Cargo" },
    diviseurVolumetrique: 166,
    services: [
      { id: "air_express", nom: "Aérien Express", mode: "air", unite: "lb", prix: 4.5, minimum: 15, delai: "2–4 jours" },
      { id: "air_standard", nom: "Aérien Standard", mode: "air", unite: "lb", prix: 3.25, minimum: 10, delai: "5–7 jours" },
      { id: "maritime", nom: "Maritime", mode: "mer", unite: "pi3", prix: 14, minimum: 35, delai: "3–4 semaines" },
    ],
    frais: { manutention: 2, assurancePct: 3, seuilDouane: 200, douanePct: 10, livraison: 7 },
    pointsTransit: DEFAULT_POINTS.map(p => ({ ...p })),
    succursales: [
      { id: "FLL", nom: "Entrepôt Fort Lauderdale", ville: "Fort Lauderdale, FL", type: "origine", telephone: "+1 786 350 7565" },
      { id: "PAP", nom: "Delmas 95 (siège)", ville: "Port-au-Prince", type: "destination", telephone: "+509 38 34 7343" },
      { id: "JER", nom: "Succursale Jérémie", ville: "Jérémie", type: "destination", telephone: "" },
      { id: "CAP", nom: "Succursale Cap-Haïtien", ville: "Cap-Haïtien", type: "destination", telephone: "" },
      { id: "RFT", nom: "Route Frères (Technozi)", ville: "Port-au-Prince", type: "destination", telephone: "" },
      ...NOUVELLES_SUCCURSALES.map(b => ({ ...b })),
    ],
  };
}

const USERS = [
  { id: "u-admin", nom: "Administrateur", role: "admin", succursale: "PAP" },
  { id: "u-miami", nom: "Agent Entrepôt Miami", role: "entrepot", succursale: "FLL" },
  { id: "u-pap", nom: "Agent Comptoir Delmas", role: "comptoir", succursale: "PAP" },
  { id: "u-liv", nom: "Livreur PAP", role: "livreur", succursale: "PAP" },
];

export function seedData({ empty = false } = {}) {
  const settings = defaultSettings();
  const db = {
    version: 7, settings, users: USERS.map(u => ({ ...u })), currentUserId: "u-admin",
    seq: { client: 0, colis: 0, manifeste: 0, recu: 0 },
    clients: [], colis: [], manifestes: [], paiements: [], notifications: [], journal: [],
  };
  if (empty) return db;

  // PRNG déterministe pour des données de démo stables
  let s = 20260929;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const day = 86400000; const now = Date.now();
  const ago = d => new Date(now - d * day).toISOString();

  const prenoms = ["Jean", "Marie", "Pierre", "Rose", "Jacques", "Nadège", "Wilner", "Fabienne", "Ricardo", "Guerline", "Stanley", "Mirlande", "Frantz", "Esther", "Kervens", "Judith", "Evens", "Sabine"];
  const noms = ["Joseph", "Pierre-Louis", "Charles", "Jean-Baptiste", "Etienne", "Augustin", "Dorsainvil", "Célestin", "Toussaint", "Désir", "Michel", "Lafortune"];
  const dests = ["PAP", "PAP", "TAB", "RFT", "JER", "CAY", "CAP", "CAP"];
  for (let i = 0; i < 18; i++) {
    const seq = ++db.seq.client;
    const entreprise = i % 7 === 3;
    db.clients.push({
      id: "c" + seq, code: codeClient(seq),
      nom: entreprise ? pick(["Boutik", "Dépôt", "Pharmacie", "Quincaillerie"]) + " " + pick(noms) : pick(prenoms) + " " + pick(noms),
      type: entreprise ? "entreprise" : "particulier",
      telephone: "+509 3" + Math.floor(rnd() * 9 + 1) + " " + String(Math.floor(rnd() * 90 + 10)) + " " + String(Math.floor(rnd() * 9000 + 1000)),
      email: "", succursale: pick(dests), adresse: pick(["Delmas 33", "Pétion-Ville", "Tabarre", "Carrefour", "Croix-des-Bouquets", "Centre-ville"]),
      notes: "", createdAt: ago(90 - i * 3),
    });
  }

  const articles = [
    ["Vêtements", "Carton de vêtements"], ["Électronique", "Téléphone Samsung"], ["Électronique", "Laptop HP"],
    ["Alimentaire", "Provisions (riz, huile)"], ["Pièces auto", "Pièces Toyota"], ["Documents", "Enveloppe documents"],
    ["Médicaments", "Médicaments / vitamines"], ["Cosmétiques", "Produits de beauté"], ["Électroménager", "Micro-ondes"],
    ["Divers", "Colis Amazon"], ["Divers", "Colis Shein"], ["Électronique", "Télévision 43\""],
  ];
  const fournisseurs = ["TBA", "1Z", "9400", "SHEIN", "7849"];

  // Manifestes : arrivé, en douane (maritime), en transit, ouvert, et un maritime en retard vers le Cap
  const manifs = [
    { mode: "air", statut: "arrive", dep: 20, transporteur: "Amerijet", vol: "M6 1403", dest: "PAP" },
    { mode: "mer", statut: "douane", dep: 5.5, transporteur: "Solution Cargo", navire: "Voyage SC-2536", conteneur: "481220-7", dest: "PAP" },
    { mode: "air", statut: "transit", dep: 0.1, transporteur: "Amerijet", vol: "M6 1411", dest: "PAP" },
    { mode: "air", statut: "ouvert", dep: -3, transporteur: "Amerijet", vol: "M6 1419", dest: "PAP" },
    { mode: "mer", statut: "transit", dep: 7, transporteur: "Solution Cargo", navire: "Voyage SC-2541", conteneur: "772031-4", dest: "CAP", retard: true },
  ];
  for (const m of manifs) {
    const seq = ++db.seq.manifeste;
    const depart = ago(m.dep);
    const etapes = etapesPourStatut(itineraireType(m.mode, m.dest, depart), m.statut);
    // Écarts réalistes sur les étapes réalisées (quelques heures d'avance / de retard)
    etapes.forEach(e => { if (e.reel) e.reel = new Date(new Date(e.reel).getTime() + (rnd() - .4) * 8 * 3600000).toISOString(); });
    // Envoi en retard : déchargé en RD et passé à Dajabón, mais bloqué avant Ouanaminthe
    if (m.retard) etapes.slice(0, etapes.findIndex(e => e.action === "arrivee")).forEach(e => { e.reel = e.reel || e.prevu; });
    if (m.retard) etapes.find(e => e.action === "arrivee").note = "Camion en attente au passage frontière Dajabón / Ouanaminthe";
    const man = {
      id: "m" + seq, numero: numeroManifeste(seq, m.mode, new Date(depart)), mode: m.mode,
      transporteur: m.transporteur, reference: (m.mode === "mer" ? "BL-" : "AWB 810-") + Math.floor(rnd() * 9e7 + 1e7),
      vol: m.vol || "", navire: m.navire || "", conteneur: m.conteneur || "",
      origine: "FLL", destination: m.dest, statut: m.statut, etapes, notes: "", createdAt: ago(m.dep + 4),
    };
    syncDatesManifeste(man);
    db.manifestes.push(man);
  }

  const plan = [
    ...Array(8).fill({ st: "livre", m: 0 }), ...Array(5).fill({ st: "pret", m: 0 }), ...Array(2).fill({ st: "livraison", m: 0 }),
    ...Array(5).fill({ st: "douane", m: 1 }), ...Array(7).fill({ st: "transit", m: 2 }), ...Array(4).fill({ st: "consolide", m: 3 }),
    ...Array(3).fill({ st: "transit", m: 4 }),
    ...Array(9).fill({ st: "recu", m: null }), { st: "probleme", m: null },
  ];
  const chain = ["recu", "consolide", "transit", "douane", "arrive", "pret", "livraison", "livre"];
  plan.forEach((p, i) => {
    const seq = ++db.seq.colis;
    const client = pick(db.clients);
    const man = p.m === null ? null : db.manifestes[p.m];
    const svc = man ? (man.mode === "mer" ? "maritime" : pick(["air_express", "air_standard", "air_standard"])) : pick(["air_express", "air_standard", "maritime"]);
    const [cat, desc] = pick(articles);
    const recuLe = man ? new Date(new Date(man.dateDepart).getTime() - (2 + rnd() * 4) * day) : new Date(now - rnd() * 6 * day);
    const c = {
      id: "p" + seq, tracking: numeroTracking(seq, recuLe), trackingFournisseur: pick(fournisseurs) + Math.floor(rnd() * 1e10),
      clientId: client.id, description: desc, categorie: cat, pieces: rnd() < .8 ? 1 : 2,
      poids: Math.round((cat === "Documents" ? 1 : 2 + rnd() * (cat === "Électroménager" ? 40 : 25)) * 10) / 10,
      longueur: Math.round(10 + rnd() * 14), largeur: Math.round(8 + rnd() * 10), hauteur: Math.round(4 + rnd() * 10),
      valeur: Math.round(20 + rnd() * (cat === "Électronique" ? 600 : 180)), service: svc,
      destination: p.st === "recu" ? client.succursale : (man?.destination || client.succursale),
      assurance: rnd() < .3, livraisonDomicile: p.st === "livraison" || (p.st === "livre" && rnd() < .3), remise: 0,
      statut: p.st, manifesteId: man?.id || null, emplacement: p.st === "recu" ? "Rayon " + pick(["A", "B", "C"]) + Math.floor(rnd() * 9 + 1) : "",
      livreur: p.st === "livraison" ? "u-liv" : null, livraison: null, notes: p.st === "probleme" ? "Adresse du destinataire à confirmer" : "",
      createdAt: recuLe.toISOString(), events: [],
    };
    // Historique cohérent avec le statut actuel
    const target = p.st === "probleme" ? 0 : chain.indexOf(p.st);
    let t = recuLe.getTime();
    for (let k = 0; k <= target; k++) {
      const st = chain[k];
      if (st === "livraison" && p.st === "livre" && !c.livraisonDomicile) continue;
      if (k > 0) t = Math.min(t + (0.5 + rnd() * 3) * day, now - (target - k) * 3600000);
      c.events.push({ date: new Date(t).toISOString(), statut: st, lieu: k < 3 ? "Fort Lauderdale" : settings.succursales.find(b => b.id === c.destination).ville, note: "", user: k < 2 ? "u-miami" : "u-pap" });
    }
    if (p.st === "probleme") c.events.push({ date: ago(0.2), statut: "probleme", lieu: "Fort Lauderdale", note: c.notes, user: "u-miami" });
    if (p.st === "livre") c.livraison = { recuPar: client.nom, date: c.events.at(-1).date, piece: "CIN" };
    c.facture = calculerFacture(c, settings);
    db.colis.push(c);

    // Paiements : livrés = soldés ; prêts = parfois acompte ; en amont = certains prépayés
    const total = c.facture.total;
    const paye = p.st === "livre" ? total : p.st === "pret" && rnd() < .4 ? Math.round(total / 2) : rnd() < .25 ? total : 0;
    if (paye > 0) {
      db.paiements.push({
        id: "pay" + seq, numero: numeroRecu(++db.seq.recu), colisId: c.id, clientId: client.id, montant: paye,
        methode: pick(["cash_usd", "cash_htg", "moncash", "moncash", "carte"]), date: p.st === "livre" ? c.events.at(-1).date : c.createdAt,
        reference: "", user: "u-pap",
      });
    }
  });
  db.manifestes.forEach(m => { const dep = m.etapes.find(e => e.action === "depart"); if (dep?.reel) enregistrerVoyage(m, db.colis, dep.reel); });
  db.journal.push({ id: "j0", date: new Date().toISOString(), user: "u-admin", action: "Initialisation", details: "Données de démonstration chargées" });
  return db;
}

/** Quantités d'un voyage (figées au départ dans m.bilan pour le registre des voyages). */
export function bilanManifeste(m, colis) {
  const cs = colis.filter(c => c.manifesteId === m.id);
  const parDest = {};
  cs.forEach(c => { parDest[c.destination] = (parDest[c.destination] || 0) + 1; });
  const r2 = n => Math.round(n * 100) / 100;
  return {
    colis: cs.length, pieces: cs.reduce((s, c) => s + (+c.pieces || 1), 0), poids: r2(cs.reduce((s, c) => s + (+c.poids || 0), 0)),
    valeur: r2(cs.reduce((s, c) => s + (+c.valeur || 0), 0)), fret: r2(cs.reduce((s, c) => s + (c.facture?.total || 0), 0)), parDest,
  };
}
/** Enregistre le voyage au moment du départ : date d'envoi réelle + quantités chargées. */
export function enregistrerVoyage(m, colis, dateEnvoi) {
  m.bilan = { ...bilanManifeste(m, colis), dateEnvoi, enregistreLe: new Date().toISOString() };
  return m.bilan;
}

/** Départ et ETA d'un manifeste déduits de son itinéraire (étapes « départ » et « arrivée »). */
export function syncDatesManifeste(m) {
  const e = m.etapes || [];
  const dep = e.find(x => x.action === "depart"), arr = e.find(x => x.action === "arrivee") || e.at(-1);
  if (dep) m.dateDepart = dep.reel || dep.prevu;
  if (arr) m.eta = arr.reel || arr.prevu;
  return m;
}

/** Met à niveau une base créée par une version précédente de l'application. */
export function migrate(db) {
  if ((db.version || 1) < 2) {
    db.settings.pointsTransit = db.settings.pointsTransit || DEFAULT_POINTS.map(p => ({ ...p }));
    for (const m of db.manifestes) {
      m.vol = m.vol || ""; m.navire = m.navire || ""; m.conteneur = m.conteneur || "";
      if (!m.etapes) { m.etapes = etapesPourStatut(itineraireType(m.mode, m.destination, m.dateDepart), m.statut); syncDatesManifeste(m); }
    }
    db.version = 2;
  }
  if (db.version < 3) {
    // Le transport par bateau est assuré par Solution Cargo
    db.settings.transporteurs = db.settings.transporteurs || { air: "Amerijet", mer: "Solution Cargo" };
    for (const m of db.manifestes) {
      if (m.mode !== "mer" || !["", "Crowley", "Seaboard Marine"].includes(m.transporteur || "")) continue;
      m.transporteur = "Solution Cargo";
      if (/^(Crowley|Seaboard)/.test(m.navire || "")) m.navire = "";
    }
    db.version = 3;
  }
  if (db.version < 4) {
    // Nouveaux points : ports dominicains et frontière Dajabón / Ouanaminthe
    for (const p of DEFAULT_POINTS) if (!db.settings.pointsTransit.some(x => x.id === p.id)) db.settings.pointsTransit.push({ ...p });
    // Les envois maritimes pas encore partis prennent le nouvel itinéraire via la République dominicaine
    for (const m of db.manifestes) {
      if (m.mode === "mer" && !(m.etapes || []).some(e => e.reel)) { m.etapes = itineraireType("mer", m.destination, m.dateDepart); syncDatesManifeste(m); }
    }
    db.version = 4;
  }
  if (db.version < 5) {
    // Nouvelle destination : Route Frères (Technozi), Port-au-Prince
    if (!db.settings.succursales.some(b => b.id === "RFT")) db.settings.succursales.push({ id: "RFT", nom: "Route Frères (Technozi)", ville: "Port-au-Prince", type: "destination", telephone: "" });
    db.version = 5;
  }
  if (db.version < 6) {
    for (const b of NOUVELLES_SUCCURSALES) if (!db.settings.succursales.some(x => x.id === b.id)) db.settings.succursales.push({ ...b });
    db.version = 6;
  }
  if (db.version < 7) {
    // Registre des voyages : enregistre les envois déjà partis
    db.manifestes.forEach(m => { const dep = (m.etapes || []).find(e => e.action === "depart"); if (dep?.reel && !m.bilan) enregistrerVoyage(m, db.colis, dep.reel); });
    db.version = 7;
  }
  return db;
}
