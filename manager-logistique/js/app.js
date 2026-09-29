/* =========================================================
   MANAGER LOGISTIQUE — application principale
   Routeur par hash (#/page/id), rendu par chaînes HTML, et un
   seul gestionnaire d'événements délégué (data-act / data-form).
========================================================= */
import * as store from "./store.js";
import {
  STATUTS, statut, nextStatuts, STATUTS_MANIFESTE, statutManifeste, MANIFESTE_TO_COLIS, METHODES_PAIEMENT, methode,
  CATEGORIES, calculerFacture, poidsVolumetrique, round, money, htg, num, fdate, fdatetime,
  nomEntreprise, numeroTracking, numeroManifeste, numeroTransfert, numeroReception, LIVREURS_USA, codeClient, numeroRecu, barcodeSvg, messageStatut, waLink, STATUT_ORDER,
  TYPES_POINT, typePoint, ACTIONS_ETAPE, actionEtape, itineraireType, retardEtape, ecartEtape,
} from "./logic.js";
import { syncDatesManifeste, bilanManifeste, enregistrerVoyage } from "./seed.js";
import { esc, $, $$, openModal, closeModal, confirmBox, EMBED, toast, formData, opt, printHtml, downloadCsv, download } from "./ui.js";

/* ---------- Rôles & navigation ---------- */
const ROLES = {
  admin:    { label: "Administrateur",      pages: ["dashboard", "acheminement", "reception", "colis", "manifestes", "transferts", "comptoir", "clients", "caisse", "suivi", "rapports", "parametres"] },
  entrepot: { label: "Agent entrepôt Miami", pages: ["dashboard", "acheminement", "reception", "colis", "manifestes", "transferts", "clients", "suivi"] },
  comptoir: { label: "Agent comptoir Haïti", pages: ["dashboard", "acheminement", "colis", "transferts", "comptoir", "clients", "caisse", "suivi"] },
  livreur:  { label: "Livreur",             pages: ["comptoir", "suivi"] },
};
const NAV = [
  { id: "dashboard",  label: "Tableau de bord",      ic: "▦" },
  { id: "acheminement", label: "Acheminement USA → Haïti", ic: "⇄" },
  { id: "reception",  label: "Réception entrepôt",   ic: "⇲" },
  { id: "colis",      label: "Colis",                ic: "▣" },
  { id: "manifestes", label: "Voyages / Manifestes", ic: "✈" },
  { id: "transferts", label: "Transferts bureaux",   ic: "⇆" },
  { id: "comptoir",   label: "Retrait & livraison",  ic: "⇱" },
  { id: "clients",    label: "Clients",              ic: "☺" },
  { id: "caisse",     label: "Caisse & paiements",   ic: "$" },
  { id: "suivi",      label: "Suivi de colis",       ic: "⌖" },
  { id: "rapports",   label: "Rapports",             ic: "▤" },
  { id: "parametres", label: "Paramètres",           ic: "⚙" },
];

let db = store.load();
store.onChange(d => { db = d; });

const S = () => db.settings;
const me = () => db.users.find(u => u.id === db.currentUserId) || db.users[0];
const can = page => ROLES[me().role]?.pages.includes(page);
const isAdmin = () => me().role === "admin";
const clientOf = id => db.clients.find(c => c.id === id);
const colisOf = id => db.colis.find(c => c.id === id);
const manifesteOf = id => db.manifestes.find(m => m.id === id);
const branch = id => S().succursales.find(b => b.id === id);
const userName = id => db.users.find(u => u.id === id)?.nom || "—";
const serviceOf = id => S().services.find(s => s.id === id);
const payeColis = c => round(db.paiements.filter(p => p.colisId === c.id).reduce((s, p) => s + p.montant, 0));
const soldeColis = c => round((c.facture?.total || 0) - payeColis(c));
const soldeClient = cid => round(db.colis.filter(c => c.clientId === cid).reduce((s, c) => s + soldeColis(c), 0));
const daysAgo = iso => (Date.now() - new Date(iso).getTime()) / 86400000;
const lastEventDate = c => c.events.at(-1)?.date || c.createdAt;
/** Jour / mois au fuseau local (et non UTC) : AAAA-MM-JJ / AAAA-MM. */
const dayKey = (d = new Date()) => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const monthKey = d => dayKey(d).slice(0, 7);

/** Options des succursales de destination ; celles pas encore ouvertes sont visibles mais non sélectionnables. */
const destOptions = (selected, { all = false } = {}) => S().succursales.filter(b => b.type === "destination")
  .map(b => b.actif === false && !all ? `<option value="${esc(b.id)}" disabled>${esc(b.nom)} — bientôt</option>` : opt(b.id, b.nom + (b.actif === false ? " (bientôt)" : ""), b.id === selected)).join("");
const pointOf = id => S().pointsTransit.find(p => p.id === id)
  || (branch(id) && { id, nom: branch(id).nom, code: id, ville: branch(id).ville, pays: branch(id).type === "origine" ? "USA" : "Haïti", type: "succursale" })
  || { id, nom: id, code: id, ville: "", pays: "", type: "autre" };
const modeIc = mode => mode === "mer" ? "⛴" : "✈";
const modeLabel = mode => mode === "mer" ? "Maritime" : "Aérien";
const prochaineEtape = m => (m.etapes || []).find(e => !e.reel);
const retardManifeste = m => Math.max(0, ...(m.etapes || []).map(retardEtape));
const derniereEtape = m => [...(m.etapes || [])].reverse().find(e => e.reel);
const enCours = m => (m.etapes || []).some(e => !e.reel);
/** Valeur pour <input type="datetime-local"> au fuseau local. */
const dtLocal = iso => { if (!iso) return ""; const d = new Date(iso); return `${dayKey(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const joursTxt = j => `${num(Math.abs(j), 1)} j`;
const dureeTxt = ms => ms < 86400000 ? `${Math.max(0, Math.round(ms / 3600000))} h` : `${num(ms / 86400000, 1)} j`;
const badge = id => { const s = statut(id); return `<span class="badge tone-${s.tone}">${esc(s.label)}</span>`; };
const badgeM = id => { const s = statutManifeste(id); return `<span class="badge tone-${s.tone}">${esc(s.label)}</span>`; };
const clientLabel = c => c ? `${c.code} — ${c.nom}` : "—";

function log(action, details) {
  db.journal.unshift({ id: store.uid(), date: store.nowIso(), user: me().id, action, details });
  db.journal.length = Math.min(db.journal.length, 500);
}
function addEvent(c, st, note = "", lieu, date) {
  c.statut = st;
  c.events.push({ date: date || store.nowIso(), statut: st, lieu: lieu || (["recu", "consolide", "transit"].includes(st) ? "Fort Lauderdale" : branch(c.destination)?.ville || ""), note, user: me().id });
}

/** Fait avancer un manifeste et propage le nouveau statut à ses colis (jamais de retour en arrière). */
function setManifesteStatut(m, st, { note = "", lieu, date } = {}) {
  const cur = STATUTS_MANIFESTE.findIndex(s => s.id === m.statut), nxt = STATUTS_MANIFESTE.findIndex(s => s.id === st);
  if (nxt <= cur) return [];
  m.statut = st;
  const cst = MANIFESTE_TO_COLIS[st];
  return db.colis.filter(c => c.manifesteId === m.id && cst && c.statut !== "probleme" && STATUT_ORDER[c.statut] < STATUT_ORDER[cst])
    .map(c => { addEvent(c, cst, note || `Manifeste ${m.numero}`, lieu, date); return c.id; });
}

/* ---------- État d'interface (filtres par page) ---------- */
const ui = {
  colis: { q: "", statut: "", dest: "" },
  clients: { q: "" },
  manifestes: { statut: "", mode: "", mois: "" },
  acheminement: { mode: "", vue: "encours" },
  comptoir: { tab: "pret", branche: "" },
  transferts: { statut: "", bureau: "", q: "" },
  transfert: null, // brouillon du nouveau bordereau
  scanMsg: null,
  caisse: { du: dayKey(), au: dayKey() },
  rapports: { mois: monthKey(new Date()) },
  suivi: { q: "" },
  reception: { clientId: "", clear: false, mode: "rapide", lot: null },
  navOpen: false,
};

/* =========================================================
   ROUTEUR
========================================================= */
function parseHash() {
  const [page = "dashboard", id = ""] = location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  return { page, id: decodeURIComponent(id) };
}
export function go(page, id) { location.hash = `#/${page}${id ? "/" + encodeURIComponent(id) : ""}`; }

function render() {
  let { page, id } = parseHash();
  if (!NAV.some(n => n.id === page) || !can(page)) { page = ROLES[me().role].pages[0]; id = ""; }
  const focus = document.activeElement?.dataset?.filter ? { key: document.activeElement.dataset.filter, pos: document.activeElement.selectionStart } : null;
  // Conserve la saisie en cours du formulaire de réception quand la page se redessine
  const draft = {}; const oldForm = $('[data-form="reception"]');
  if (oldForm && !ui.reception.clear) for (const el of oldForm.elements) if (el.name) draft[el.name] = el.type === "checkbox" ? el.checked : el.value;
  ui.reception.clear = false;
  $("#app").innerHTML = `${sidebar(page)}<main class="main">${VIEWS[page](id)}</main>`;
  const newForm = $('[data-form="reception"]');
  if (newForm) for (const el of newForm.elements) {
    if (!(el.name in draft) || (el.name === "clientRef" && ui.reception.clientId)) continue;
    if (el.type === "checkbox") el.checked = draft[el.name]; else el.value = draft[el.name];
  }
  document.body.classList.toggle("nav-open", ui.navOpen);
  if (focus) { const el = $(`[data-filter="${focus.key}"]`); if (el) { el.focus(); try { el.setSelectionRange(focus.pos, focus.pos); } catch { /* select */ } } }
  VIEW_MOUNT[page]?.(id);
}
window.addEventListener("hashchange", () => { ui.navOpen = false; ui.scanMsg = null; closeModal(); render(); window.scrollTo(0, 0); });
store.onChange(() => render());

function sidebar(active) {
  const u = me();
  const counts = {
    reception: db.colis.filter(c => c.statut === "recu").length,
    comptoir: db.colis.filter(c => ["arrive", "pret", "livraison"].includes(c.statut)).length,
  };
  return `
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-mark" aria-hidden="true">M</div>
      <div><div class="brand-name">Manager Logistique</div><div class="brand-sub">${esc(S().entreprise.nom?.trim() || "Gestion logistique")}</div></div>
      <button class="nav-toggle" data-act="toggle-nav" aria-label="Menu">☰</button>
    </div>
    <nav class="navlinks">
      ${NAV.filter(n => can(n.id)).map(n => `
        <a class="navlink ${n.id === active ? "active" : ""}" href="#/${n.id}">
          <span class="ic" aria-hidden="true">${n.ic}</span><span>${n.label}</span>
          ${counts[n.id] ? `<span class="count">${counts[n.id]}</span>` : ""}
        </a>`).join("")}
    </nav>
    <div class="sidebar-foot">
      <label for="user-switch">Connecté en tant que</label>
      <select id="user-switch" data-act-change="switch-user">
        ${db.users.map(x => opt(x.id, `${x.nom} (${ROLES[x.role]?.label || x.role})`, x.id === u.id)).join("")}
      </select>
      <div class="muted small">${esc(branch(u.succursale)?.nom || "")}</div>
    </div>
  </aside>`;
}

const topbar = (title, sub, actions = "") => `
  <div class="topbar">
    <div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>
    <div class="topbar-actions">${actions}</div>
  </div>`;
const kpi = (label, value, sub = "", tone = "") => `<div class="kpi ${tone}"><div class="lbl">${label}</div><div class="val num">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`;
const empty = msg => `<div class="empty">${msg}</div>`;

/* ---------- Mini-graphiques (une seule série, une seule teinte) ---------- */
function hbars(items, fmtv = v => v) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="hbars" role="list">${items.map(i => `
    <div class="hbar" role="listitem" title="${esc(i.label)} : ${esc(fmtv(i.value))}" ${i.href ? `data-href="${i.href}"` : ""}>
      <span class="hbar-lbl">${esc(i.label)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(i.value / max) * 100}%"></span></span>
      <span class="hbar-val num">${esc(fmtv(i.value))}</span>
    </div>`).join("")}</div>`;
}
function vbars(items, fmtv = v => v) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="vbars">${items.map((i, k) => `
    <div class="vbar ${k === items.length - 1 ? "last" : ""}" tabindex="0" aria-label="${esc(i.label)} : ${esc(fmtv(i.value))}">
      <span class="vbar-tip num">${esc(fmtv(i.value))}</span>
      <span class="vbar-fill" style="height:${Math.max(i.value ? 2 : 0, (i.value / max) * 100)}%"></span>
      <span class="vbar-lbl">${esc(i.label)}</span>
    </div>`).join("")}</div>`;
}

/* ---------- Itinéraire visuel d'un envoi ---------- */
function routeStrip(m, { compact = false } = {}) {
  const et = m.etapes || [];
  if (!et.length) return empty("Aucun itinéraire défini.");
  const next = prochaineEtape(m);
  return `<div class="route ${compact ? "compact" : ""}" role="list" aria-label="Itinéraire ${esc(m.numero)}">${et.map((e, i) => {
    const p = pointOf(e.pointId); const a = actionEtape(e.action);
    const late = retardEtape(e); const ecart = ecartEtape(e);
    const cls = e.reel ? "done" : e === next ? (late ? "next late" : "next") : late ? "late" : "";
    const ic = e.reel ? "✓" : e.action === "depart" ? modeIc(m.mode) : i + 1;
    return `<div class="route-node ${cls} ${i > 0 && et[i - 1].reel ? "from-done" : ""}" role="listitem"
      title="${esc(a.label)} — ${esc(p.nom)}${e.note ? " — " + esc(e.note) : ""}">
      <span class="route-dot" aria-hidden="true">${ic}</span>
      <div class="route-code">${esc(p.code || p.id)}</div>
      ${compact ? "" : `<div class="route-name">${esc(p.nom)}</div>`}
      <div class="route-act">${esc(a.short)}</div>
      <div class="route-date">${e.reel ? fdatetime(e.reel) : `<span class="muted">prévu</span> ${fdatetime(e.prevu)}`}</div>
      ${e.reel && ecart > 0.5 ? `<div class="route-flag bad">+${joursTxt(ecart)}</div>` : ""}
      ${late && e === next ? `<div class="route-flag bad">Retard ${joursTxt(late)}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}
function badgeRetard(m) {
  const r = retardManifeste(m);
  return r ? `<span class="badge tone-bad">⚠ Retard ${joursTxt(r)}</span>` : enCours(m) && m.statut !== "ouvert" ? `<span class="badge tone-good">À l'heure</span>` : "";
}
/** Quantités du voyage : figées au départ, sinon calculées sur le chargement en cours. */
const bilanOf = m => m.bilan || bilanManifeste(m, db.colis);
const dateEnvoi = m => m.bilan?.dateEnvoi || m.dateDepart;
/* ---------- Transferts entre bureaux ---------- */
const STATUTS_TRANSFERT = {
  envoye: { label: "En route", tone: "accent" }, partiel: { label: "Réception partielle", tone: "warn" },
  recu: { label: "Tout reçu", tone: "good" }, incomplet: { label: "Incomplet — manquants", tone: "bad" },
};
const transfertOf = id => (db.transferts || []).find(t => t.id === id);
const statutTransfert = t => t.cloture ? (t.lignes.some(l => l.manquant) ? "incomplet" : "recu")
  : t.lignes.length && t.lignes.every(l => l.recu) ? "recu" : t.lignes.some(l => l.recu) ? "partiel" : "envoye";
const badgeT = t => { const s = STATUTS_TRANSFERT[statutTransfert(t)]; return `<span class="badge tone-${s.tone}">${esc(s.label)}</span>`; };
const transfertOuvert = t => !t.cloture && !t.lignes.every(l => l.recu);
/** Retrouve un colis du système par son n° de colis ou n° fournisseur. */
const findColis = code => { const c = String(code || "").trim().toUpperCase(); return c ? db.colis.find(x => x.tracking.toUpperCase() === c || String(x.trackingFournisseur || "").toUpperCase() === c) : null; };
const splitTrackings = txt => String(txt || "").split(/[\s,;]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
const transportInfo = m => [m.mode === "mer" ? m.navire : m.vol, m.conteneur ? "Cont. " + m.conteneur : ""].filter(Boolean).join(" · ");

/* =========================================================
   VUES
========================================================= */
const VIEWS = {};
const VIEW_MOUNT = {};

/* ---------- Tableau de bord ---------- */
VIEWS.dashboard = () => {
  const C = db.colis;
  const by = st => C.filter(c => st.includes(c.statut));
  const entrepot = by(["recu", "consolide"]);
  const route = by(["transit", "douane"]);
  const aRemettre = by(["arrive", "pret", "livraison"]);
  const livres30 = C.filter(c => c.statut === "livre" && daysAgo(lastEventDate(c)) <= 30);
  const enc30 = db.paiements.filter(p => daysAgo(p.date) <= 30).reduce((s, p) => s + p.montant, 0);
  const impayes = C.filter(c => soldeColis(c) > 0.009);
  const totalImpaye = impayes.reduce((s, c) => s + soldeColis(c), 0);
  const exceptions = by(["probleme"]);
  const stockage = C.filter(c => c.statut === "pret" && daysAgo(lastEventDate(c)) > 7);
  const envoisRetard = db.manifestes.filter(m => retardManifeste(m) > 0);
  const nbAPeser = aPeser().length;
  const transfertsLents = (db.transferts || []).filter(t => transfertOuvert(t) && daysAgo(t.dateEnvoi) > 2);

  // Encaissements par semaine (8 semaines)
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const end = Date.now() - w * 7 * 86400000, start = end - 7 * 86400000;
    const v = db.paiements.filter(p => { const t = new Date(p.date).getTime(); return t > start && t <= end; }).reduce((s, p) => s + p.montant, 0);
    weeks.push({ label: w === 0 ? "Cette sem." : `S-${w}`, value: round(v) });
  }
  const actifs = db.manifestes.filter(m => m.statut !== "arrive").sort((a, b) => a.eta.localeCompare(b.eta));

  return `
  ${topbar("Tableau de bord", `${esc(nomEntreprise(S()))} — vue d'ensemble de la chaîne Miami → Haïti`,
    can("reception") ? `<a class="btn btn-primary" href="#/reception">+ Réceptionner un colis</a>` : "")}
  <div class="kpi-row">
    ${kpi("À l'entrepôt Miami", entrepot.length, `${num(entrepot.reduce((s, c) => s + +c.poids, 0))} lb à expédier`)}
    ${kpi("En route / douane", route.length, `${db.manifestes.filter(m => ["transit", "douane"].includes(m.statut)).length} envoi(s), ${envoisRetard.length} en retard`, envoisRetard.length ? "bad" : "")}
    ${kpi("À remettre en Haïti", aRemettre.length, `${stockage.length} en attente > 7 jours`, stockage.length ? "warn" : "")}
    ${kpi("Livrés (30 j)", livres30.length)}
    ${kpi("Encaissé (30 j)", money(enc30), htg(enc30 * S().tauxChange), "good")}
    ${kpi("Soldes impayés", money(totalImpaye), `${impayes.length} colis`, totalImpaye > 0 ? "bad" : "")}
  </div>
  <div class="grid-2">
    <section class="panel">
      <h3>Pipeline des colis</h3>
      <p class="muted small">Nombre de colis par étape — cliquez pour filtrer.</p>
      ${hbars(STATUTS.map(s => ({ label: s.label, value: C.filter(c => c.statut === s.id).length, href: `colis?statut=${s.id}` })))}
    </section>
    <section class="panel">
      <h3>Encaissements hebdomadaires (USD)</h3>
      <p class="muted small">8 dernières semaines — survolez une barre pour le montant.</p>
      ${vbars(weeks, money)}
    </section>
  </div>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h3>Manifestes actifs</h3><a href="#/manifestes" class="link">Tout voir →</a></div>
      ${actifs.length ? `<table class="tbl"><thead><tr><th>N°</th><th>Mode</th><th>Colis</th><th>ETA</th><th>Statut</th></tr></thead><tbody>
        ${actifs.map(m => `<tr class="click" data-href="manifestes/${m.id}"><td class="mono">${esc(m.numero)}</td><td>${m.mode === "mer" ? "Maritime" : "Aérien"}</td>
        <td class="num">${db.colis.filter(c => c.manifesteId === m.id).length}</td><td>${fdate(m.eta)}</td><td>${badgeM(m.statut)} ${retardManifeste(m) ? badgeRetard(m) : ""}</td></tr>`).join("")}
      </tbody></table>` : empty("Aucun manifeste actif.")}
    </section>
    <section class="panel">
      <h3>Alertes</h3>
      ${exceptions.length || stockage.length || envoisRetard.length || transfertsLents.length || nbAPeser ? `<ul class="alerts">
        ${nbAPeser ? `<li class="alert warn" data-href="reception"><b>Pesée</b> ${nbAPeser} colis reçu(s) à l'entrepôt sans poids : à peser avant facturation</li>` : ""}
        ${transfertsLents.map(t => `<li class="alert warn" data-href="transferts/${t.id}"><b>Transfert</b> ${esc(t.numero)} ${esc(t.origine)} → ${esc(t.destination)} envoyé il y a ${Math.floor(daysAgo(t.dateEnvoi))} jours : ${t.lignes.filter(l => !l.recu).length} colis pas encore confirmés reçus</li>`).join("")}
        ${envoisRetard.map(m => { const e = (m.etapes || []).find(x => retardEtape(x)); return `<li class="alert bad" data-href="manifestes/${m.id}"><b>Retard ${modeIc(m.mode)}</b> ${esc(m.numero)} — ${esc(actionEtape(e.action).short)} à ${esc(pointOf(e.pointId).nom)} prévu le ${fdate(e.prevu)} (${joursTxt(retardEtape(e))})</li>`; }).join("")}
        ${exceptions.map(c => `<li class="alert bad" data-href="colis/${c.id}"><b>Exception</b> ${esc(c.tracking)} — ${esc(c.notes || "à vérifier")}</li>`).join("")}
        ${stockage.map(c => `<li class="alert warn" data-href="colis/${c.id}"><b>Stockage</b> ${esc(c.tracking)} prêt depuis ${Math.floor(daysAgo(lastEventDate(c)))} jours — ${esc(clientOf(c.clientId)?.nom || "")}</li>`).join("")}
      </ul>` : empty("Aucune alerte. Tout roule !")}
    </section>
  </div>`;
};

/* ---------- Acheminement USA → Haïti (tour de contrôle) ---------- */
VIEWS.acheminement = () => {
  const f = ui.acheminement;
  const tous = db.manifestes.filter(m => !f.mode || m.mode === f.mode);
  const actifs = tous.filter(m => enCours(m));
  const list = (f.vue === "encours" ? actifs : f.vue === "termines" ? tous.filter(m => !enCours(m)) : tous)
    .sort((a, b) => (retardManifeste(b) - retardManifeste(a)) || String(prochaineEtape(a)?.prevu || a.eta).localeCompare(String(prochaineEtape(b)?.prevu || b.eta)));
  const colisDe = m => db.colis.filter(c => c.manifesteId === m.id);
  const enRoute = actifs.filter(m => m.statut !== "ouvert");
  const retards = actifs.filter(m => retardManifeste(m) > 0);
  const semaine = Date.now() + 7 * 86400000;
  const arriveesSemaine = actifs.filter(m => { const a = m.etapes.find(e => e.action === "arrivee"); return a && !a.reel && new Date(a.prevu).getTime() < semaine; });
  // Ponctualité : étapes réalisées ces 60 derniers jours avec moins de 12 h d'écart
  const faites = tous.flatMap(m => m.etapes.filter(e => e.reel && daysAgo(e.reel) <= 60));
  const ponctu = faites.length ? Math.round(faites.filter(e => ecartEtape(e) <= 0.5).length / faites.length * 100) : null;

  // Calendrier des mouvements à venir (et en retard)
  const mouvements = actifs.flatMap(m => m.etapes.filter(e => !e.reel).map(e => ({ m, e })))
    .filter(x => new Date(x.e.prevu).getTime() < Date.now() + 21 * 86400000)
    .sort((a, b) => a.e.prevu.localeCompare(b.e.prevu));
  const parJour = new Map();
  mouvements.forEach(x => { const k = dayKey(x.e.prevu); if (!parJour.has(k)) parJour.set(k, []); parJour.get(k).push(x); });

  // Où se trouvent les envois en ce moment : dernier point validé
  const presence = new Map();
  actifs.forEach(m => {
    const d = derniereEtape(m); const key = d ? d.pointId : "WH-FLL";
    const g = presence.get(key) || { envois: [], colis: 0, lb: 0 };
    const cs = colisDe(m); g.envois.push(m); g.colis += cs.length; g.lb += cs.reduce((s, c) => s + +c.poids, 0);
    presence.set(key, g);
  });
  const entrepotSeul = db.colis.filter(c => c.statut === "recu" && !c.manifesteId);

  const seg = (key, items) => `<div class="seg">${items.map(([id, label]) => `<button class="${f[key] === id ? "active" : ""}" data-act="ach-${key}" data-id="${id}">${label}</button>`).join("")}</div>`;
  return `
  ${topbar("Acheminement USA → Haïti", "Contrôle global des envois par avion et par bateau : dates prévues et réelles à chaque point de transit",
    can("manifestes") ? `<button class="btn btn-primary" data-act="new-manifeste">+ Nouvel envoi</button>` : "")}
  <div class="filters">
    ${seg("mode", [["", "Tous"], ["air", "✈ Aérien"], ["mer", "⛴ Maritime"]])}
    ${seg("vue", [["encours", "En cours"], ["termines", "Terminés"], ["tous", "Tous"]])}
  </div>
  <div class="kpi-row">
    ${kpi("Envois en cours", actifs.length, `✈ ${actifs.filter(m => m.mode === "air").length} · ⛴ ${actifs.filter(m => m.mode === "mer").length}`)}
    ${kpi("Colis en route", enRoute.reduce((s, m) => s + colisDe(m).length, 0), `${num(enRoute.reduce((s, m) => s + colisDe(m).reduce((t, c) => t + +c.poids, 0), 0))} lb`)}
    ${kpi("Envois en retard", retards.length, retards.length ? "à traiter en priorité" : "aucun retard", retards.length ? "bad" : "good")}
    ${kpi("Arrivées en Haïti (7 j)", arriveesSemaine.length, `${arriveesSemaine.reduce((s, m) => s + colisDe(m).length, 0)} colis attendus`)}
    ${kpi("Ponctualité (60 j)", ponctu === null ? "—" : ponctu + " %", `${faites.length} étapes réalisées`, ponctu !== null && ponctu < 80 ? "warn" : "")}
    ${kpi("En attente à l'entrepôt", entrepotSeul.length, "colis sans manifeste")}
  </div>

  <h2 class="section-title">Envois ${f.vue === "encours" ? "en cours" : f.vue === "termines" ? "terminés" : ""} (${list.length})</h2>
  ${list.length ? list.map(m => { const cs = colisDe(m); const nx = prochaineEtape(m); return `
    <section class="panel envoi ${retardManifeste(m) ? "is-late" : ""}">
      <div class="panel-head">
        <div><span class="mode-ic" aria-hidden="true">${modeIc(m.mode)}</span> <a class="mono big-link" href="#/manifestes/${m.id}">${esc(m.numero)}</a>
          <span class="muted"> ${esc(m.transporteur)}${transportInfo(m) ? " · " + esc(transportInfo(m)) : ""} · ${esc(m.reference)}</span></div>
        <div class="row-inline">${badgeM(m.statut)} ${badgeRetard(m)}</div>
      </div>
      ${routeStrip(m)}
      <div class="row-between envoi-foot">
        <span class="muted small">${cs.length} colis · ${num(cs.reduce((s, c) => s + +c.poids, 0))} lb · destination ${esc(branch(m.destination)?.nom || m.destination)}${nx ? ` · prochaine étape : <b>${esc(actionEtape(nx.action).short)}</b> à ${esc(pointOf(nx.pointId).nom)}, ${fdatetime(nx.prevu)}` : " · itinéraire terminé"}</span>
        ${nx && can("manifestes") ? `<button class="btn btn-sm btn-primary" data-act="etape-valider" data-id="${m.id}" data-etape="${nx.id}" ${!cs.length ? "disabled title='Aucun colis dans cet envoi'" : ""}>Valider : ${esc(actionEtape(nx.action).short)}</button>` : ""}
      </div>
    </section>`; }).join("") : empty("Aucun envoi.")}

  <div class="grid-2">
    <section class="panel">
      <h3>Calendrier des mouvements (3 semaines)</h3>
      <p class="muted small">Départs, arrivées, dédouanements et réceptions prévus — les retards apparaissent en premier.</p>
      ${parJour.size ? [...parJour.entries()].map(([k, xs]) => `
        <div class="cal-day ${k < dayKey() ? "past" : k === dayKey() ? "today" : ""}">
          <div class="cal-date">${k === dayKey() ? "Aujourd'hui" : new Date(k + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</div>
          <ul class="plain">${xs.map(({ m, e }) => `<li class="click" data-href="manifestes/${m.id}">
            <span class="mono small">${new Date(e.prevu).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
            ${modeIc(m.mode)} <b>${esc(actionEtape(e.action).short)}</b> — ${esc(pointOf(e.pointId).nom)} <span class="mono muted">${esc(m.numero)}</span>
            ${retardEtape(e) ? `<span class="badge tone-bad">Retard ${joursTxt(retardEtape(e))}</span>` : ""}</li>`).join("")}</ul>
        </div>`).join("") : empty("Aucun mouvement prévu.")}
    </section>
    <section class="panel">
      <h3>Où sont les envois en ce moment ?</h3>
      <p class="muted small">Dernier point de transit validé pour chaque envoi en cours.</p>
      <table class="tbl"><thead><tr><th>Point de transit</th><th>Pays</th><th class="r">Envois</th><th class="r">Colis</th><th class="r">Poids</th></tr></thead><tbody>
        ${entrepotSeul.length ? `<tr><td>Entrepôt — colis non consolidés</td><td>USA</td><td class="r">—</td><td class="num r">${entrepotSeul.length}</td><td class="num r">${num(entrepotSeul.reduce((s, c) => s + +c.poids, 0))} lb</td></tr>` : ""}
        ${[...presence.entries()].map(([pid, g]) => { const p = pointOf(pid); return `<tr><td><b>${esc(p.nom)}</b> <span class="mono muted">${esc(p.code || "")}</span><div class="small">${g.envois.map(m => `<a class="mono" href="#/manifestes/${m.id}">${modeIc(m.mode)} ${esc(m.numero)}</a>`).join(" · ")}</div></td>
          <td>${esc(p.pays || "")}</td><td class="num r">${g.envois.length}</td><td class="num r">${g.colis}</td><td class="num r">${num(g.lb)} lb</td></tr>`; }).join("")}
      </tbody></table>
    </section>
  </div>`;
};

/* ---------- Réception entrepôt (Warehouse Receipt) ---------- */
VIEWS.reception = id => id ? receptionDetail(id) : ui.reception.mode === "detail" ? receptionDetaillee() : receptionRapide();

const receptionTabs = () => `<div class="seg">
  <button class="${ui.reception.mode !== "detail" ? "active" : ""}" data-act="rc-mode" data-id="rapide">Réception rapide (scan)</button>
  <button class="${ui.reception.mode === "detail" ? "active" : ""}" data-act="rc-mode" data-id="detail">Saisie détaillée</button></div>`;
const aPeser = () => db.colis.filter(c => c.aPeser && c.statut === "recu");

function lotBrouillon() {
  if (!ui.reception.lot) ui.reception.lot = { livreur: "Amazon", nombreAnnonce: "", clientDefaut: "", service: "air_standard", note: "", lignes: [] };
  return ui.reception.lot;
}

function receptionRapide() {
  const L = lotBrouillon();
  const n = L.lignes.length; const annonce = +L.nombreAnnonce || 0;
  const pieces = L.lignes.reduce((s, l) => s + (+l.pieces || 1), 0);
  const tone = !annonce ? "" : n === annonce ? "good" : n < annonce ? "warn" : "bad";
  const ecartTxt = !annonce ? "Saisissez le nombre annoncé par le livreur pour contrôler l'écart."
    : n === annonce ? "✓ Le compte est bon." : n < annonce ? `Il manque ${annonce - n} colis par rapport au bordereau du livreur.` : `${n - annonce} colis de plus que le nombre annoncé.`;
  const historique = [...(db.receptions || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  const peser = aPeser();
  return `
  ${topbar("Réception entrepôt", "Comptez les colis livrés et scannez leur numéro de suivi : chaque lot est enregistré avec sa date", receptionTabs())}
  <div class="grid-2 wide-left">
    <section class="panel">
      <h3>Scanner les colis reçus</h3>
      <form data-form="rc-scan" class="row-inline">
        <input name="code" class="scan-input" placeholder="Scannez le numéro de suivi (Amazon, UPS, FedEx…)" aria-label="Numéro de suivi" autocomplete="off">
        <button class="btn btn-primary">Ajouter</button>
      </form>
      ${ui.scanMsg ? `<div class="alert ${ui.scanMsg.tone} mt-s">${esc(ui.scanMsg.text)}</div>` : ""}
      <details class="mt-s"><summary class="link">Coller plusieurs numéros d'un coup</summary>
        <form data-form="rc-bulk"><textarea name="bulk" rows="4" placeholder="Un numéro de suivi par ligne"></textarea><button class="btn btn-sm mt-s">Ajouter la liste</button></form>
      </details>
      <datalist id="clients-list">${db.clients.map(x => `<option value="${esc(clientLabel(x))}">`).join("")}</datalist>
      <div class="table-wrap mt">${n ? `<table class="tbl"><thead><tr><th>#</th><th>N° de suivi</th><th>Client</th><th>Pièces</th><th>Poids (lb)</th><th></th></tr></thead><tbody>
        ${L.lignes.map((l, i) => `<tr><td>${n - i}</td><td class="mono nowrap">${esc(l.tracking)} <button type="button" class="btn-fix" data-act="fix-tracking" data-scope="rc-draft" data-i="${i}" title="Corriger le numéro" aria-label="Corriger le numéro">✎</button></td>
          <td><input class="cell-input" list="clients-list" data-line="${i}" data-field="clientRef" value="${esc(l.clientRef)}" placeholder="${L.clientDefaut ? "par défaut" : "Code ou nom"}" aria-label="Client du colis ${esc(l.tracking)}"></td>
          <td><input class="cell-input narrow" type="number" min="1" step="1" data-line="${i}" data-field="pieces" value="${esc(l.pieces)}" aria-label="Pièces"></td>
          <td><input class="cell-input narrow" type="number" min="0" step="0.1" data-line="${i}" data-field="poids" value="${esc(l.poids)}" placeholder="à peser" aria-label="Poids"></td>
          <td><button class="btn btn-sm btn-danger" data-act="rc-remove" data-id="${i}" aria-label="Retirer ${esc(l.tracking)}">✕</button></td></tr>`).join("")}
      </tbody></table>` : empty("Scannez le premier colis. Le compteur avance à chaque numéro.")}</div>
    </section>
    <aside>
      <form class="panel sticky" data-form="rc-save">
        <h3>Lot de réception</h3>
        <div class="form-grid">
          <div class="field"><label for="rc-livreur">Livré par</label><select id="rc-livreur" name="livreur" data-lot="livreur">${LIVREURS_USA.map(x => opt(x, x, x === L.livreur)).join("")}</select></div>
          <div class="field"><label for="rc-annonce">Nombre annoncé</label><input id="rc-annonce" type="number" min="0" step="1" name="nombreAnnonce" data-lot="nombreAnnonce" value="${esc(L.nombreAnnonce)}" placeholder="ex. 12"></div>
        </div>
        <div class="field"><label for="rc-client">Client par défaut</label><input id="rc-client" name="clientDefaut" list="clients-list" data-lot="clientDefaut" value="${esc(L.clientDefaut)}" placeholder="Appliqué aux colis sans client"></div>
        <div class="field"><label for="rc-service">Service</label><select id="rc-service" name="service" data-lot="service">${S().services.map(x => opt(x.id, x.nom, x.id === L.service)).join("")}</select></div>
        <div class="field"><label for="rc-note">Note</label><input id="rc-note" name="note" data-lot="note" value="${esc(L.note)}"></div>
        <div class="counter ${tone}">
          <div><span class="num big-n">${n}</span> colis scannés${annonce ? ` / <b class="num">${annonce}</b> annoncés` : ""} · ${pieces} pièce(s)</div>
          <div class="small">${esc(ecartTxt)}</div>
        </div>
        <p class="muted small">Sans client, le colis est rangé dans « Colis non identifié » (à réattribuer). Sans poids, il est marqué « à peser » et facturé après la pesée.</p>
        <div class="form-actions"><button type="button" class="btn" data-act="rc-reset">Vider</button>
          <button class="btn btn-primary" ${n ? "" : "disabled"}>Enregistrer la réception (${n})</button></div>
      </form>
    </aside>
  </div>
  <div class="grid-2 wide-left">
    <section class="panel"><h3>Historique des réceptions</h3>
      ${historique.length ? `<table class="tbl"><thead><tr><th>N°</th><th>Date</th><th>Livré par</th><th class="r">Annoncés</th><th class="r">Reçus</th><th class="r">Écart</th><th>Reçu par</th></tr></thead><tbody>
        ${historique.map(r => { const e = r.colisIds.length - (r.nombreAnnonce || r.colisIds.length); return `<tr class="click" data-href="reception/${r.id}">
          <td class="mono">${esc(r.numero)}</td><td class="nowrap">${fdatetime(r.date)}</td><td>${esc(r.livreur)}</td><td class="num r">${r.nombreAnnonce || "—"}</td><td class="num r"><b>${r.colisIds.length}</b></td>
          <td class="num r ${e ? "text-bad" : "text-good"}">${!r.nombreAnnonce ? "—" : e ? (e > 0 ? "+" : "") + e : "✓"}</td><td>${esc(userName(r.user))}</td></tr>`; }).join("")}
      </tbody></table>` : empty("Aucune réception enregistrée.")}
    </section>
    <section class="panel"><h3>Colis à peser (${peser.length})</h3>
      ${peser.length ? `<table class="tbl"><tbody>${peser.map(c => `<tr><td class="mono">${esc(c.trackingFournisseur || c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "")}</td>
        <td><button class="btn btn-sm btn-primary" data-act="edit-colis" data-id="${c.id}">Peser</button></td></tr>`).join("")}</tbody></table>` : empty("Tous les colis sont pesés.")}
    </section>
  </div>`;
}

function receptionDetaillee() {
  const today = db.colis.filter(c => daysAgo(c.createdAt) < 1).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
  ${topbar("Réception entrepôt", "Saisie complète d'un colis : poids, dimensions, valeur et devis immédiat", receptionTabs())}
  <div class="grid-2 wide-left">
    <form class="panel" data-form="reception" autocomplete="off">
      <h3>Nouveau colis</h3>
      ${colisFields({ clientId: ui.reception.clientId, pieces: 1, service: "air_standard", destination: clientOf(ui.reception.clientId)?.succursale || "PAP" })}
      <div class="form-actions">
        <label class="check"><input type="checkbox" name="imprimer" checked> Imprimer l'étiquette</label>
        <button class="btn btn-primary" type="submit">Enregistrer la réception</button>
      </div>
    </form>
    <aside>
      <section class="panel sticky" id="devis">${devisHtml(null)}</section>
      <section class="panel">
        <h3>Reçus aujourd'hui (${today.length})</h3>
        ${today.length ? `<table class="tbl"><tbody>${today.map(c => `<tr class="click" data-href="colis/${c.id}">
          <td class="mono">${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "")}</td><td class="num">${c.aPeser ? '<span class="badge tone-warn">à peser</span>' : num(c.poids) + " lb"}</td></tr>`).join("")}</tbody></table>` : empty("Aucun colis reçu aujourd'hui.")}
      </section>
    </aside>
  </div>`;
}

function receptionDetail(id) {
  const r = (db.receptions || []).find(x => x.id === id);
  if (!r) return topbar("Réception introuvable") + empty(`<a href="#/reception">← Retour</a>`);
  const cs = r.colisIds.map(colisOf).filter(Boolean);
  const ecart = r.nombreAnnonce ? cs.length - r.nombreAnnonce : 0;
  return `
  ${topbar(`Réception <span class="mono">${esc(r.numero)}</span>`, `${fdatetime(r.date)} · livré par <b>${esc(r.livreur)}</b> · reçu par ${esc(userName(r.user))}`, `
    <a class="btn" href="#/reception">← Réception</a>
    <button class="btn btn-primary" data-act="print-labels" data-id="${r.id}">Imprimer les étiquettes</button>`)}
  <div class="kpi-row">
    ${kpi("Annoncés par le livreur", r.nombreAnnonce || "—")}
    ${kpi("Colis reçus", cs.length, "", "good")}
    ${kpi("Écart", !r.nombreAnnonce ? "—" : ecart ? (ecart > 0 ? "+" : "") + ecart : "0", !r.nombreAnnonce ? "" : ecart < 0 ? "colis manquants" : ecart > 0 ? "colis en trop" : "le compte est bon", ecart ? "bad" : "")}
    ${kpi("Pièces", cs.reduce((s, c) => s + (+c.pieces || 1), 0))}
    ${kpi("À peser", cs.filter(c => c.aPeser).length, "", cs.some(c => c.aPeser) ? "warn" : "")}
  </div>
  ${r.note ? `<div class="alert warn">${esc(r.note)}</div>` : ""}
  <section class="panel"><h3>Colis du lot</h3>${colisTable(cs)}</section>`;
}

VIEW_MOUNT.reception = () => {
  const form = $('[data-form="reception"]');
  if (!form) { $("[data-form=rc-scan] input")?.focus(); return; }
  const upd = () => { $("#devis").innerHTML = devisHtml(readColisForm(form)); };
  form.addEventListener("input", upd); form.addEventListener("change", upd); upd();
};

function colisFields(c = {}) {
  const S_ = S();
  return `
  <div class="field"><label>Client *</label>
    <div class="row-inline">
      <input name="clientRef" list="clients-list" required placeholder="Code ou nom du client (ex. CL-0001)" value="${esc(c.clientId ? clientLabel(clientOf(c.clientId)) : "")}">
      <button type="button" class="btn" data-act="new-client-inline" title="Créer un client">+ Client</button>
    </div>
    <datalist id="clients-list">${db.clients.map(x => `<option value="${esc(clientLabel(x))}">`).join("")}</datalist>
  </div>
  <div class="form-grid">
    <div class="field"><label>N° suivi fournisseur</label><input name="trackingFournisseur" value="${esc(c.trackingFournisseur || "")}" placeholder="TBA…, 1Z…, 9400…"></div>
    <div class="field"><label>Catégorie</label><select name="categorie">${CATEGORIES.map(x => opt(x, x, x === c.categorie)).join("")}</select></div>
  </div>
  <div class="field"><label>Description du contenu *</label><input name="description" required value="${esc(c.description || "")}"></div>
  <div class="form-grid g4">
    <div class="field"><label>Pièces</label><input type="number" name="pieces" min="1" step="1" value="${esc(c.pieces ?? 1)}"></div>
    <div class="field"><label>Poids (lb) *</label><input type="number" name="poids" min="0.1" step="0.1" required value="${esc(c.poids ?? "")}"></div>
    <div class="field"><label>Valeur déclarée ($)</label><input type="number" name="valeur" min="0" step="1" value="${esc(c.valeur ?? "")}"></div>
    <div class="field"><label>Emplacement</label><input name="emplacement" value="${esc(c.emplacement || "")}" placeholder="Rayon A3"></div>
  </div>
  <div class="form-grid g3">
    <div class="field"><label>Longueur (po)</label><input type="number" name="longueur" min="0" step="0.5" value="${esc(c.longueur ?? "")}"></div>
    <div class="field"><label>Largeur (po)</label><input type="number" name="largeur" min="0" step="0.5" value="${esc(c.largeur ?? "")}"></div>
    <div class="field"><label>Hauteur (po)</label><input type="number" name="hauteur" min="0" step="0.5" value="${esc(c.hauteur ?? "")}"></div>
  </div>
  <div class="form-grid">
    <div class="field"><label>Service</label><select name="service">${S_.services.map(s => opt(s.id, `${s.nom} (${s.delai})`, s.id === c.service)).join("")}</select></div>
    <div class="field"><label>Destination</label><select name="destination">${destOptions(c.destination)}</select></div>
  </div>
  <div class="form-grid">
    <label class="check"><input type="checkbox" name="assurance" ${c.assurance ? "checked" : ""}> Assurance (${S_.frais.assurancePct} % de la valeur)</label>
    <label class="check"><input type="checkbox" name="livraisonDomicile" ${c.livraisonDomicile ? "checked" : ""}> Livraison à domicile (+${money(S_.frais.livraison)})</label>
  </div>
  <div class="form-grid">
    <div class="field"><label>Remise ($)</label><input type="number" name="remise" min="0" step="0.5" value="${esc(c.remise || "")}"></div>
    <div class="field"><label>Notes internes</label><input name="notes" value="${esc(c.notes || "")}"></div>
  </div>`;
}
function resolveClient(ref) {
  const r = String(ref || "").trim().toLowerCase();
  if (!r) return null;
  return db.clients.find(c => clientLabel(c).toLowerCase() === r) || db.clients.find(c => c.code.toLowerCase() === r.split(" ")[0])
    || db.clients.find(c => c.nom.toLowerCase() === r) || db.clients.find(c => c.telephone.replace(/\D/g, "") && c.telephone.replace(/\D/g, "") === r.replace(/\D/g, ""));
}
function readColisForm(form) {
  const d = formData(form);
  const cl = resolveClient(d.clientRef);
  return { ...d, clientId: cl?.id || "", poids: +d.poids || 0, pieces: +d.pieces || 1, valeur: +d.valeur || 0, longueur: +d.longueur || 0, largeur: +d.largeur || 0, hauteur: +d.hauteur || 0, remise: +d.remise || 0 };
}
function devisHtml(c) {
  if (!c || !c.poids) return `<h3>Devis automatique</h3>${empty("Saisissez le poids pour calculer le prix.")}`;
  const f = calculerFacture(c, S());
  const vol = poidsVolumetrique(c, S().diviseurVolumetrique);
  const cl = clientOf(c.clientId);
  return `<h3>Devis automatique</h3>
    <div class="muted small">${cl ? esc(clientLabel(cl)) : '<span class="text-bad">Client non reconnu</span>'}</div>
    <div class="facts"><span>Poids réel <b>${num(c.poids)} lb</b></span><span>Volumétrique <b>${num(vol)} lb</b></span></div>
    <table class="tbl lines">${f.lignes.map(l => `<tr><td>${esc(l.label)}</td><td class="num r">${money(l.montant)}</td></tr>`).join("")}
    <tr class="total"><td>Total</td><td class="num r">${money(f.total)}</td></tr>
    <tr><td class="muted">Équivalent gourdes</td><td class="num r muted">${htg(f.total * S().tauxChange)}</td></tr></table>
    <div class="muted small">Délai estimé : ${esc(f.service.delai)}</div>`;
}

/* ---------- Liste des colis ---------- */
VIEWS.colis = id => {
  if (id) return colisDetail(id);
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  if (params.get("statut") !== null) { ui.colis.statut = params.get("statut"); history.replaceState(null, "", "#/colis"); }
  const f = ui.colis; const q = f.q.toLowerCase();
  const list = db.colis.filter(c => (!f.statut || c.statut === f.statut) && (!f.dest || c.destination === f.dest) &&
    (!q || [c.tracking, c.trackingFournisseur, c.description, clientOf(c.clientId)?.nom, clientOf(c.clientId)?.code].join(" ").toLowerCase().includes(q)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
  ${topbar("Colis", `${list.length} colis affiché(s) sur ${db.colis.length}`,
    `<button class="btn" data-act="export-colis">Exporter CSV</button>${can("reception") ? `<a class="btn btn-primary" href="#/reception">+ Réceptionner</a>` : ""}`)}
  <div class="filters">
    <input class="search" type="search" placeholder="Rechercher : n° de colis, n° fournisseur, client, contenu…" data-filter="colis.q" value="${esc(f.q)}">
    <select data-filter="colis.statut">${opt("", "Tous les statuts")}${STATUTS.map(s => opt(s.id, s.label, s.id === f.statut)).join("")}</select>
    <select data-filter="colis.dest">${opt("", "Toutes destinations")}${destOptions(f.dest, { all: true })}</select>
  </div>
  ${colisTable(list)}`;
};
function colisTable(list, { select = false, removable = false } = {}) {
  if (!list.length) return empty("Aucun colis.");
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr>${select ? `<th><input type="checkbox" data-act-change="select-all" aria-label="Tout sélectionner"></th>` : ""}<th>N° colis</th><th>Client</th><th>Contenu</th><th class="r">Poids</th><th>Service</th><th>Dest.</th><th>Statut</th><th class="r">Solde</th><th>Reçu le</th>${removable ? "<th></th>" : ""}</tr></thead>
    <tbody>${list.map(c => { const sol = soldeColis(c); return `<tr class="${select ? "" : "click"}" ${select ? "" : `data-href="colis/${c.id}"`}>
      ${select ? `<td><input type="checkbox" name="sel" value="${c.id}" aria-label="Sélectionner ${esc(c.tracking)}"></td>` : ""}
      <td class="mono">${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "—")}</td><td>${esc(c.description)}</td>
      <td class="num r">${c.aPeser ? '<span class="badge tone-warn">à peser</span>' : num(c.poids) + " lb"}</td><td>${esc(serviceOf(c.service)?.nom || c.service)}</td><td>${esc(c.destination)}</td>
      <td>${badge(c.statut)}</td><td class="num r ${sol > 0.009 ? "text-bad" : "text-good"}">${sol > 0.009 ? money(sol) : "Payé"}</td><td>${fdate(c.createdAt)}</td>
      ${removable ? `<td><button class="btn btn-sm btn-danger" data-act="manif-remove" data-id="${c.id}">Retirer</button></td>` : ""}
    </tr>`; }).join("")}</tbody></table></div>`;
}

function colisDetail(id) {
  const c = colisOf(id);
  if (!c) return topbar("Colis introuvable") + empty(`<a href="#/colis">← Retour à la liste</a>`);
  const cl = clientOf(c.clientId); const m = manifesteOf(c.manifesteId);
  const pays = db.paiements.filter(p => p.colisId === c.id);
  const sol = soldeColis(c);
  const nexts = nextStatuts(c.statut);
  const notifs = db.notifications.filter(n => n.colisId === c.id);
  const trs = (db.transferts || []).filter(t => t.lignes.some(l => l.colisId === c.id || l.tracking === c.tracking.toUpperCase()));
  return `
  ${topbar(`Colis <span class="mono">${esc(c.tracking)}</span>`, `${badge(c.statut)} &nbsp; ${esc(c.description)} — ${esc(cl?.nom || "")}`, `
    <a class="btn" href="#/colis">← Liste</a>
    <button class="btn" data-act="print-label" data-id="${c.id}">Étiquette</button>
    <button class="btn" data-act="print-invoice" data-id="${c.id}">Facture</button>
    <button class="btn" data-act="notify" data-id="${c.id}">Notifier le client</button>
    ${nexts.length ? `<button class="btn btn-primary" data-act="change-status" data-id="${c.id}">Changer le statut</button>` : ""}`)}
  <div class="barcode-box">${barcodeSvg(c.tracking, { height: 44, narrow: 1.6 })}</div>
  ${m ? `<section class="panel"><div class="panel-head"><h3>Acheminement ${modeIc(m.mode)} <a class="mono" href="#/manifestes/${m.id}">${esc(m.numero)}</a></h3>${badgeRetard(m)}</div>${routeStrip(m, { compact: true })}</section>` : ""}
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h3>Détails</h3>${c.statut === "recu" || isAdmin() ? `<button class="btn btn-sm" data-act="edit-colis" data-id="${c.id}">Modifier</button>` : ""}</div>
      <dl class="dl">
        <dt>Client</dt><dd>${cl ? `<a href="#/clients/${cl.id}">${esc(clientLabel(cl))}</a><br><span class="muted small">${esc(cl.telephone)}</span>` : "—"}</dd>
        <dt>N° fournisseur</dt><dd class="mono">${esc(c.trackingFournisseur || "—")} <button type="button" class="btn-fix" data-act="fix-tracking" data-scope="colis" data-id="${c.id}" title="Corriger le numéro" aria-label="Corriger le numéro">✎</button>
          ${c.corrections?.length ? `<div class="muted small">corrigé ${c.corrections.length} fois · ancien : ${esc(c.corrections[0].ancien || "—")}</div>` : ""}</dd>
        ${c.receptionId && (db.receptions || []).some(r => r.id === c.receptionId) ? `<dt>Lot de réception</dt><dd><a class="mono" href="#/reception/${c.receptionId}">${esc(db.receptions.find(r => r.id === c.receptionId).numero)}</a></dd>` : ""}
        <dt>Contenu</dt><dd>${esc(c.description)} <span class="muted">(${esc(c.categorie)})</span></dd>
        <dt>Pièces / poids</dt><dd>${c.pieces} pièce(s) — ${c.aPeser ? '<span class="badge tone-warn">à peser</span>' : num(c.poids) + " lb"} ${c.longueur ? `— ${c.longueur}×${c.largeur}×${c.hauteur} po (vol. ${num(poidsVolumetrique(c, S().diviseurVolumetrique))} lb)` : ""}</dd>
        <dt>Valeur déclarée</dt><dd>${money(c.valeur)} ${c.assurance ? '<span class="badge tone-good">Assuré</span>' : ""}</dd>
        <dt>Service</dt><dd>${esc(serviceOf(c.service)?.nom || c.service)}</dd>
        <dt>Destination</dt><dd>${esc(branch(c.destination)?.nom || c.destination)} ${c.livraisonDomicile ? `<span class="badge tone-accent">Livraison domicile</span><br><span class="muted small">${esc(cl?.adresse || "")}</span>` : ""}</dd>
        <dt>Manifeste</dt><dd>${m ? `<a href="#/manifestes/${m.id}" class="mono">${esc(m.numero)}</a> — ${esc(m.transporteur)}` : "—"}</dd>
        ${c.emplacement ? `<dt>Emplacement</dt><dd>${esc(c.emplacement)}</dd>` : ""}
        ${c.livreur ? `<dt>Livreur</dt><dd>${esc(userName(c.livreur))}</dd>` : ""}
        ${c.livraison ? `<dt>Remis à</dt><dd>${esc(c.livraison.recuPar)} (${esc(c.livraison.piece || "")}) — ${fdatetime(c.livraison.date)}</dd>` : ""}
        ${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}
      </dl>
      ${isAdmin() && c.statut === "recu" && !pays.length ? `<button class="btn btn-sm btn-danger" data-act="delete-colis" data-id="${c.id}">Supprimer ce colis</button>` : ""}
    </section>
    <section class="panel">
      <h3>Historique de suivi</h3>
      ${timeline(c)}
    </section>
  </div>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h3>Facturation</h3>${sol > 0.009 && can("caisse") ? `<button class="btn btn-sm btn-primary" data-act="pay" data-id="${c.id}">Encaisser</button>` : ""}</div>
      <table class="tbl lines">${c.facture.lignes.map(l => `<tr><td>${esc(l.label)}</td><td class="num r">${money(l.montant)}</td></tr>`).join("")}
        <tr class="total"><td>Total facturé</td><td class="num r">${money(c.facture.total)}</td></tr>
        ${pays.map(p => `<tr><td>Paiement ${esc(p.numero)} — ${esc(methode(p.methode))} — ${fdate(p.date)}</td><td class="num r text-good">−${money(p.montant)}</td></tr>`).join("")}
        <tr class="total"><td>Solde</td><td class="num r ${sol > 0.009 ? "text-bad" : "text-good"}">${money(sol)}<div class="muted small">${htg(sol * S().tauxChange)}</div></td></tr>
      </table>
    </section>
    <section class="panel">
      ${trs.length ? `<h3>Transferts entre bureaux</h3><ul class="plain">${trs.map(t => { const l = t.lignes.find(x => x.colisId === c.id || x.tracking === c.tracking.toUpperCase()); return `<li><a class="mono" href="#/transferts/${t.id}">${esc(t.numero)}</a> ${esc(t.origine)} → ${esc(t.destination)} · envoyé ${fdatetime(t.dateEnvoi)} · ${l.recu ? `<span class="text-good">reçu ${fdatetime(l.dateReception)}</span>` : l.manquant ? '<span class="text-bad">manquant</span>' : "en route"}</li>`; }).join("")}</ul>` : ""}
      <h3>Notifications envoyées</h3>
      ${notifs.length ? `<ul class="plain">${notifs.map(n => `<li><span class="muted small">${fdatetime(n.date)} · ${esc(n.canal)}</span><br>${esc(n.message)}</li>`).join("")}</ul>` : empty("Aucune notification pour ce colis.")}
    </section>
  </div>`;
}
function timeline(c) {
  return `<ol class="timeline">${[...c.events].reverse().map((e, i) => `
    <li class="${i === 0 ? "current" : ""}"><span class="dot tone-${statut(e.statut).tone}"></span>
      <div><b>${esc(statut(e.statut).label)}</b> <span class="muted small">— ${esc(e.lieu || "")}</span></div>
      <div class="muted small">${fdatetime(e.date)}${e.user ? ` · ${esc(userName(e.user))}` : ""}</div>
      ${e.note ? `<div class="small">${esc(e.note)}</div>` : ""}
    </li>`).join("")}</ol>`;
}

/* ---------- Manifestes (consolidation) ---------- */
VIEWS.manifestes = id => {
  if (id) return manifesteDetail(id);
  const f = ui.manifestes;
  const list = db.manifestes.filter(m => (!f.statut || m.statut === f.statut) && (!f.mode || m.mode === f.mode) && (!f.mois || monthKey(dateEnvoi(m)) === f.mois))
    .sort((a, b) => String(dateEnvoi(b)).localeCompare(String(dateEnvoi(a))));
  const mois = [...new Set(db.manifestes.map(m => monthKey(dateEnvoi(m))))].sort().reverse();
  const B = list.map(m => bilanOf(m));
  const tot = k => B.reduce((s, b) => s + b[k], 0);
  // Récapitulatif mensuel (voyages partis uniquement)
  const recap = new Map();
  db.manifestes.filter(m => m.bilan && (!f.mode || m.mode === f.mode)).forEach(m => {
    const k = monthKey(m.bilan.dateEnvoi); const g = recap.get(k) || { air: 0, mer: 0, colis: 0, poids: 0, fret: 0 };
    g[m.mode]++; g.colis += m.bilan.colis; g.poids += m.bilan.poids; g.fret += m.bilan.fret; recap.set(k, g);
  });
  const seg = items => `<div class="seg">${items.map(([v, l]) => `<button class="${f.mode === v ? "active" : ""}" data-act="man-mode" data-id="${v}">${l}</button>`).join("")}</div>`;
  return `
  ${topbar("Registre des voyages", "Chaque voyage (vol ou bateau) avec sa date d'envoi et les quantités chargées — enregistrées au départ",
    `<button class="btn" data-act="export-voyages">Exporter CSV</button><button class="btn" data-act="print-voyages">Imprimer le registre</button>${can("reception") || isAdmin() ? `<button class="btn btn-primary" data-act="new-manifeste">+ Nouveau voyage</button>` : ""}`)}
  <div class="filters">
    ${seg([["", "Tous"], ["air", "✈ Avion"], ["mer", "⛴ Bateau"]])}
    <select data-filter="manifestes.mois" aria-label="Mois d'envoi">${opt("", "Toutes les dates")}${mois.map(k => opt(k, new Date(k + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }), k === f.mois)).join("")}</select>
    <select data-filter="manifestes.statut">${opt("", "Tous les statuts")}${STATUTS_MANIFESTE.map(x => opt(x.id, x.label, x.id === f.statut)).join("")}</select>
  </div>
  <div class="kpi-row">
    ${kpi("Voyages", list.length, `✈ ${list.filter(m => m.mode === "air").length} · ⛴ ${list.filter(m => m.mode === "mer").length}`)}
    ${kpi("Colis", tot("colis"), `${tot("pieces")} pièce(s)`)}
    ${kpi("Poids total", num(tot("poids")) + " lb")}
    ${kpi("Valeur déclarée", money(tot("valeur")))}
    ${kpi("Fret facturé", money(tot("fret")), "", "good")}
  </div>
  ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date d'envoi</th><th>N° voyage</th><th>Mode</th><th>Transporteur / vol / navire</th><th>Destination</th>
    <th class="r">Colis</th><th class="r">Pièces</th><th class="r">Poids</th><th class="r">Valeur</th><th class="r">Fret</th><th>Arrivée Haïti</th><th>Statut</th></tr></thead><tbody>
    ${list.map((m, i) => { const b = B[i]; return `<tr class="click" data-href="manifestes/${m.id}">
      <td class="nowrap">${fdatetime(dateEnvoi(m))}${m.bilan ? "" : `<div class="muted small">prévu — non parti</div>`}</td>
      <td class="mono">${esc(m.numero)}</td><td class="nowrap">${modeIc(m.mode)} ${m.mode === "mer" ? "Bateau" : "Avion"}</td>
      <td>${esc(m.transporteur)}<div class="muted small">${esc(transportInfo(m))}</div></td><td>${esc(branch(m.destination)?.nom || m.destination)}</td>
      <td class="num r"><b>${b.colis}</b></td><td class="num r">${b.pieces}</td><td class="num r">${num(b.poids)} lb</td><td class="num r">${money(b.valeur)}</td><td class="num r">${money(b.fret)}</td>
      <td class="nowrap">${fdate(m.eta)}</td><td>${badgeM(m.statut)} ${retardManifeste(m) ? badgeRetard(m) : ""}</td></tr>`; }).join("")}
    <tr class="total"><td colspan="5">Total — ${list.length} voyage(s)</td><td class="num r">${tot("colis")}</td><td class="num r">${tot("pieces")}</td><td class="num r">${num(tot("poids"))} lb</td><td class="num r">${money(tot("valeur"))}</td><td class="num r">${money(tot("fret"))}</td><td colspan="2"></td></tr>
  </tbody></table></div>` : empty("Aucun voyage pour ces critères.")}
  <section class="panel mt"><h3>Récapitulatif mensuel des envois</h3>
    <p class="muted small">Voyages partis, par mois de départ.</p>
    ${recap.size ? `<table class="tbl"><thead><tr><th>Mois</th><th class="r">Voyages ✈</th><th class="r">Voyages ⛴</th><th class="r">Colis envoyés</th><th class="r">Poids</th><th class="r">Fret</th></tr></thead><tbody>
      ${[...recap.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, g]) => `<tr><td>${new Date(k + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</td>
        <td class="num r">${g.air}</td><td class="num r">${g.mer}</td><td class="num r"><b>${g.colis}</b></td><td class="num r">${num(g.poids)} lb</td><td class="num r">${money(g.fret)}</td></tr>`).join("")}
    </tbody></table>` : empty("Aucun voyage parti.")}
  </section>`;
};
function manifesteDetail(id) {
  const m = manifesteOf(id);
  if (!m) return topbar("Manifeste introuvable") + empty(`<a href="#/manifestes">← Retour</a>`);
  const cs = db.colis.filter(c => c.manifesteId === m.id);
  const ouvert = m.statut === "ouvert";
  const dispo = db.colis.filter(c => c.statut === "recu" && !c.manifesteId && (serviceOf(c.service)?.mode || "air") === m.mode && c.destination === m.destination);
  const autres = db.colis.filter(c => c.statut === "recu" && !c.manifesteId && (serviceOf(c.service)?.mode || "air") === m.mode && c.destination !== m.destination);
  const next = prochaineEtape(m);
  const et = m.etapes || [];
  return `
  ${topbar(`Manifeste <span class="mono">${esc(m.numero)}</span>`, `${badgeM(m.statut)} ${badgeRetard(m)} &nbsp; ${modeIc(m.mode)} ${modeLabel(m.mode)} · ${esc(m.transporteur)} · ${esc(m.reference)}${transportInfo(m) ? " · " + esc(transportInfo(m)) : ""}`, `
    <a class="btn" href="#/manifestes">← Liste</a>
    <button class="btn" data-act="edit-manifeste" data-id="${m.id}">Modifier</button>
    <button class="btn" data-act="print-manifeste" data-id="${m.id}">Imprimer le manifeste</button>
    ${next ? `<button class="btn btn-primary" data-act="etape-valider" data-id="${m.id}" data-etape="${next.id}" ${!cs.length ? "disabled title='Ajoutez d’abord des colis'" : ""}>Valider : ${esc(actionEtape(next.action).short)} — ${esc(pointOf(next.pointId).code)}</button>` : ""}`)}
  <div class="kpi-row">
    ${kpi("Colis", cs.length, `${cs.reduce((s, c) => s + +c.pieces, 0)} pièce(s)`)}
    ${kpi("Poids total", num(cs.reduce((s, c) => s + +c.poids, 0)) + " lb")}
    ${kpi("Valeur déclarée", money(cs.reduce((s, c) => s + +c.valeur, 0)))}
    ${kpi("Fret facturé", money(cs.reduce((s, c) => s + c.facture.total, 0)), "", "good")}
    ${kpi("Départ → arrivée", fdate(m.dateDepart), "Arrivée Haïti " + fdate(m.eta))}
  </div>
  ${m.bilan ? `<div class="alert good">📋 Voyage enregistré : envoyé le <b>${fdatetime(m.bilan.dateEnvoi)}</b> avec <b>${m.bilan.colis} colis</b> (${m.bilan.pieces} pièces, ${num(m.bilan.poids)} lb, fret ${money(m.bilan.fret)}).</div>`
    : `<div class="alert warn">Voyage pas encore parti : la date d'envoi et le nombre de colis seront enregistrés à la validation de l'étape « Départ ».</div>`}
  <section class="panel">
    <div class="panel-head"><h3>Itinéraire & points de transit</h3>
      <div class="row-inline">
        <button class="btn btn-sm" data-act="etape-new" data-id="${m.id}">+ Étape / escale</button>
        ${!et.some(e => e.reel) ? `<button class="btn btn-sm" data-act="etapes-reset" data-id="${m.id}">Itinéraire type</button>` : ""}
      </div></div>
    ${routeStrip(m)}
    <div class="table-wrap mt"><table class="tbl"><thead><tr><th>#</th><th>Étape</th><th>Point de transit</th><th>Prévu</th><th>Réalisé</th><th>Écart</th><th>Note</th><th></th></tr></thead><tbody>
      ${et.map((e, i) => { const p = pointOf(e.pointId); const late = retardEtape(e); const ec = ecartEtape(e); return `<tr>
        <td>${i + 1}</td><td><b>${esc(actionEtape(e.action).label)}</b></td>
        <td>${esc(p.nom)} <span class="mono muted">${esc(p.code || "")}</span><div class="muted small">${esc([p.ville, p.pays].filter(Boolean).join(", "))}</div></td>
        <td>${fdatetime(e.prevu)}</td><td>${e.reel ? fdatetime(e.reel) : "—"}</td>
        <td>${late ? `<span class="text-bad"><b>Retard ${joursTxt(late)}</b></span>` : e.reel ? (ec > 0.5 ? `<span class="text-bad">+${joursTxt(ec)}</span>` : `<span class="text-good">À l'heure</span>`) : "—"}</td>
        <td class="small">${esc(e.note || "")}</td>
        <td class="nowrap">${e === next ? `<button class="btn btn-sm btn-primary" data-act="etape-valider" data-id="${m.id}" data-etape="${e.id}" ${!cs.length ? "disabled" : ""}>Valider</button>` : ""}
          <button class="btn btn-sm" data-act="etape-edit" data-id="${m.id}" data-etape="${e.id}">Modifier</button></td>
      </tr>`; }).join("")}
    </tbody></table></div>
    <p class="muted small">Valider une étape enregistre sa date réelle, fait avancer le manifeste et ajoute le point de transit à l'historique de <b>tous ses colis</b> (visible par le client dans le suivi).</p>
  </section>
  <section class="panel"><h3>Colis du manifeste</h3>${colisTable(cs, { removable: ouvert })}</section>
  ${ouvert ? `<form class="panel" data-form="manif-add" data-id="${m.id}">
    <div class="panel-head"><h3>Colis disponibles à l'entrepôt (${dispo.length}) — ${m.mode === "mer" ? "maritime" : "aérien"} → ${esc(m.destination)}</h3>
    <button class="btn btn-primary" type="submit" ${!dispo.length ? "disabled" : ""}>Ajouter la sélection</button></div>
    ${colisTable(dispo, { select: true })}
    ${autres.length ? `<p class="muted small">${autres.length} autre(s) colis du même mode attendent pour d'autres destinations.</p>` : ""}
  </form>` : ""}`;
}

/* ---------- Retrait & livraison (dernier kilomètre) ---------- */
VIEWS.comptoir = () => {
  const u = me();
  const br = ui.comptoir.branche || (u.succursale !== "FLL" ? u.succursale : "PAP");
  const tabs = [
    { id: "arrive", label: "À trier (arrivés)", st: ["arrive"] },
    { id: "pret", label: "Prêts pour retrait", st: ["pret"] },
    { id: "livraison", label: "En livraison", st: ["livraison"] },
    { id: "livre", label: "Remis aujourd'hui", st: ["livre"] },
  ];
  let tab = tabs.find(t => t.id === ui.comptoir.tab) || tabs[1];
  if (u.role === "livreur") tab = tabs[2];
  let list = db.colis.filter(c => c.destination === br && tab.st.includes(c.statut));
  if (tab.id === "livre") list = list.filter(c => daysAgo(lastEventDate(c)) < 1);
  if (u.role === "livreur") list = list.filter(c => c.livreur === u.id);
  list.sort((a, b) => lastEventDate(a).localeCompare(lastEventDate(b)));
  return `
  ${topbar("Retrait & livraison", "Remise des colis aux clients en succursale ou à domicile")}
  <div class="scan panel">
    <form data-form="scan" class="row-inline">
      <input name="code" placeholder="Scanner ou saisir un n° de colis (douchette code-barres)" aria-label="Numéro de colis" autofocus>
      <button class="btn btn-primary">Ouvrir</button>
    </form>
    ${u.role !== "livreur" ? `<select data-filter="comptoir.branche" aria-label="Succursale">${destOptions(br, { all: true })}</select>` : ""}
  </div>
  ${u.role !== "livreur" ? `<div class="tabs">${tabs.map(t => `<button class="tab ${t.id === tab.id ? "active" : ""}" data-act="comptoir-tab" data-id="${t.id}">${t.label} <span class="count">${db.colis.filter(c => c.destination === br && t.st.includes(c.statut) && (t.id !== "livre" || daysAgo(lastEventDate(c)) < 1)).length}</span></button>`).join("")}</div>` : ""}
  ${list.length ? `<div class="cards">${list.map(c => { const cl = clientOf(c.clientId); const sol = soldeColis(c); return `
    <div class="card-colis">
      <div class="row-between"><a class="mono" href="#/colis/${c.id}">${esc(c.tracking)}</a>${badge(c.statut)}</div>
      <div class="big">${esc(cl?.nom || "—")}</div>
      <div class="muted small">${esc(cl?.telephone || "")} · ${esc(c.description)} · ${num(c.poids)} lb</div>
      ${c.livraisonDomicile ? `<div class="small">📍 ${esc(cl?.adresse || "")}</div>` : ""}
      <div class="row-between"><span class="${sol > 0.009 ? "text-bad" : "text-good"} num"><b>${sol > 0.009 ? "À payer " + money(sol) : "Payé"}</b></span>
      <span class="muted small">depuis ${Math.max(0, Math.floor(daysAgo(lastEventDate(c))))} j</span></div>
      <div class="card-actions">
        ${c.statut === "arrive" ? `<button class="btn btn-sm btn-primary" data-act="quick-status" data-id="${c.id}" data-st="pret">Prêt + notifier</button>` : ""}
        ${["arrive", "pret"].includes(c.statut) && c.livraisonDomicile ? `<button class="btn btn-sm" data-act="assign-livreur" data-id="${c.id}">Envoyer en livraison</button>` : ""}
        ${sol > 0.009 && can("caisse") ? `<button class="btn btn-sm" data-act="pay" data-id="${c.id}">Encaisser</button>` : ""}
        ${["pret", "livraison"].includes(c.statut) ? `<button class="btn btn-sm btn-gold" data-act="deliver" data-id="${c.id}">Remettre au client</button>` : ""}
        ${cl?.telephone ? `<a class="btn btn-sm" href="tel:${esc(cl.telephone.replace(/\s/g, ""))}">Appeler</a>` : ""}
      </div>
    </div>`; }).join("")}</div>` : empty("Aucun colis dans cette file.")}`;
};

/* ---------- Transferts entre bureaux (bordereaux) ---------- */
VIEWS.transferts = id => id === "nouveau" ? transfertNouveau() : id ? transfertDetail(id) : transfertsListe();

function transfertsListe() {
  const f = ui.transferts; const q = f.q.trim().toUpperCase();
  const all = db.transferts || [];
  const list = all.filter(t => (!f.statut || statutTransfert(t) === f.statut) && (!f.bureau || t.origine === f.bureau || t.destination === f.bureau)
    && (!q || t.numero.toUpperCase().includes(q) || t.lignes.some(l => l.tracking.includes(q))))
    .sort((a, b) => b.dateEnvoi.localeCompare(a.dateEnvoi));
  const ouverts = all.filter(transfertOuvert);
  const attente = ouverts.reduce((s, t) => s + t.lignes.filter(l => !l.recu).length, 0);
  const manquants = all.reduce((s, t) => s + t.lignes.filter(l => l.manquant).length, 0);
  return `
  ${topbar("Transferts entre bureaux", "Entrez les numéros de tracking envoyés à un autre bureau, puis vérifiez à l'arrivée que tout est bien reçu",
    `<button class="btn" data-act="export-transferts">Exporter CSV</button><a class="btn btn-primary" href="#/transferts/nouveau">+ Nouveau transfert</a>`)}
  <div class="kpi-row">
    ${kpi("Transferts en route", ouverts.length, `${ouverts.filter(t => daysAgo(t.dateEnvoi) > 2).length} depuis plus de 2 jours`, ouverts.some(t => daysAgo(t.dateEnvoi) > 2) ? "warn" : "")}
    ${kpi("Colis en attente de confirmation", attente)}
    ${kpi("Transferts complets", all.filter(t => statutTransfert(t) === "recu").length, "", "good")}
    ${kpi("Colis manquants", manquants, `${all.filter(t => statutTransfert(t) === "incomplet").length} transfert(s) incomplet(s)`, manquants ? "bad" : "")}
  </div>
  <div class="filters">
    <input class="search" type="search" placeholder="Retrouver un tracking ou un n° de transfert…" data-filter="transferts.q" value="${esc(f.q)}">
    <select data-filter="transferts.bureau" aria-label="Bureau">${opt("", "Tous les bureaux")}${S().succursales.map(b => opt(b.id, b.nom, b.id === f.bureau)).join("")}</select>
    <select data-filter="transferts.statut" aria-label="Statut">${opt("", "Tous les statuts")}${Object.entries(STATUTS_TRANSFERT).map(([k, v]) => opt(k, v.label, k === f.statut)).join("")}</select>
  </div>
  ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Date d'envoi</th><th>De → vers</th><th>Chauffeur / véhicule</th><th class="r">Colis</th><th class="r">Reçus</th><th class="r">Manquants</th><th>Dernière réception</th><th>Statut</th></tr></thead><tbody>
    ${list.map(t => { const r = t.lignes.filter(l => l.recu); const last = r.map(l => l.dateReception).sort().at(-1); return `<tr class="click" data-href="transferts/${t.id}">
      <td class="mono">${esc(t.numero)}</td><td class="nowrap">${fdatetime(t.dateEnvoi)}</td>
      <td><b>${esc(branch(t.origine)?.nom || t.origine)}</b> → <b>${esc(branch(t.destination)?.nom || t.destination)}</b></td>
      <td>${esc(t.chauffeur || "")}<div class="muted small">${esc(t.vehicule || "")}</div></td>
      <td class="num r">${t.lignes.length}</td><td class="num r">${r.length}</td><td class="num r ${t.lignes.some(l => l.manquant) ? "text-bad" : ""}">${t.lignes.filter(l => l.manquant).length || "—"}</td>
      <td class="nowrap">${last ? fdatetime(last) : "—"}</td><td>${badgeT(t)}${transfertOuvert(t) && daysAgo(t.dateEnvoi) > 2 ? ' <span class="badge tone-bad">⚠ ' + Math.floor(daysAgo(t.dateEnvoi)) + " j</span>" : ""}</td></tr>`; }).join("")}
  </tbody></table></div>` : empty("Aucun transfert.")}`;
}

function transfertNouveau() {
  const u = me();
  if (!ui.transfert) ui.transfert = { origine: u.succursale || "PAP", destination: "", dateEnvoi: dtLocal(store.nowIso()), chauffeur: "", vehicule: "", note: "", lignes: [] };
  const d = ui.transfert;
  const bureaux = sel => S().succursales.map(b => opt(b.id, b.nom + (b.actif === false ? " (bientôt)" : ""), b.id === sel)).join("");
  return `
  ${topbar("Nouveau transfert", "Bordereau d'envoi vers un autre bureau", `<a class="btn" href="#/transferts">← Transferts</a>`)}
  <div class="grid-2 wide-left">
    <section class="panel">
      <h3>1. Numéros de tracking envoyés</h3>
      <form data-form="tf-scan" class="row-inline">
        <input name="code" class="scan-input" placeholder="Scannez le colis (ou tapez le numéro puis Entrée)" aria-label="Tracking" autocomplete="off">
        <button class="btn btn-primary">Ajouter</button>
      </form>
      ${ui.scanMsg ? `<div class="alert ${ui.scanMsg.tone} mt-s">${esc(ui.scanMsg.text)}</div>` : ""}
      <details class="mt-s"><summary class="link">Coller plusieurs numéros d'un coup</summary>
        <form data-form="tf-bulk"><textarea name="bulk" rows="4" placeholder="Un numéro par ligne (ou séparés par des espaces / virgules)"></textarea>
        <button class="btn btn-sm mt-s">Ajouter la liste</button></form>
      </details>
      <div class="table-wrap mt">${d.lignes.length ? `<table class="tbl"><thead><tr><th>#</th><th>Tracking</th><th>Colis dans le système</th><th></th></tr></thead><tbody>
        ${d.lignes.map((l, i) => { const c = colisOf(l.colisId); return `<tr><td>${d.lignes.length - i}</td><td class="mono nowrap">${esc(l.tracking)} <button type="button" class="btn-fix" data-act="fix-tracking" data-scope="tf-draft" data-i="${i}" title="Corriger le numéro" aria-label="Corriger le numéro">✎</button></td>
          <td>${c ? `${esc(clientOf(c.clientId)?.nom || "")} — ${esc(c.description)} <span class="muted small">(${esc(c.destination)})</span> ${badge(c.statut)}` : '<span class="muted">Non enregistré — sera suivi par son numéro</span>'}</td>
          <td><button class="btn btn-sm btn-danger" data-act="tf-remove" data-id="${esc(l.tracking)}" aria-label="Retirer ${esc(l.tracking)}">✕</button></td></tr>`; }).join("")}
      </tbody></table>` : empty("Aucun tracking ajouté. Scannez les colis un par un.")}</div>
    </section>
    <aside>
      <form class="panel sticky" data-form="tf-save">
        <h3>2. Envoi</h3>
        <div class="form-grid">
          <div class="field"><label>Bureau d'envoi</label><select name="origine" data-draft="origine">${bureaux(d.origine)}</select></div>
          <div class="field"><label>Bureau destinataire *</label><select name="destination" data-draft="destination" required>${opt("", "— Choisir —")}${bureaux(d.destination)}</select></div>
        </div>
        <div class="field"><label>Date et heure d'envoi</label><input type="datetime-local" name="dateEnvoi" data-draft="dateEnvoi" value="${esc(d.dateEnvoi)}" required></div>
        <div class="form-grid">
          <div class="field"><label>Chauffeur / coursier</label><input name="chauffeur" data-draft="chauffeur" value="${esc(d.chauffeur)}"></div>
          <div class="field"><label>Véhicule / plaque</label><input name="vehicule" data-draft="vehicule" value="${esc(d.vehicule)}"></div>
        </div>
        <div class="field"><label>Note</label><input name="note" data-draft="note" value="${esc(d.note)}"></div>
        <div class="big-count"><span class="num">${d.lignes.length}</span> colis sur ce bordereau</div>
        <div class="form-actions">
          <button type="button" class="btn" data-act="tf-reset">Vider</button>
          <button class="btn btn-primary" ${d.lignes.length ? "" : "disabled"}>Enregistrer l'envoi</button>
        </div>
      </form>
    </aside>
  </div>`;
}
VIEW_MOUNT.transferts = id => { $("[data-form=tf-scan] input, [data-form=tf-recv] input")?.focus(); };

function transfertDetail(id) {
  const t = transfertOf(id);
  if (!t) return topbar("Transfert introuvable") + empty(`<a href="#/transferts">← Retour</a>`);
  const recus = t.lignes.filter(l => l.recu);
  const last = recus.map(l => l.dateReception).sort().at(-1);
  const ouvert = !t.cloture;
  const etat = l => l.horsListe ? '<span class="badge tone-warn">Reçu hors bordereau</span>' : l.recu ? '<span class="badge tone-good">✓ Reçu</span>' : l.manquant ? '<span class="badge tone-bad">Manquant</span>' : '<span class="badge tone-accent">En attente</span>';
  return `
  ${topbar(`Transfert <span class="mono">${esc(t.numero)}</span>`, `${badgeT(t)} &nbsp; <b>${esc(branch(t.origine)?.nom || t.origine)}</b> → <b>${esc(branch(t.destination)?.nom || t.destination)}</b> · envoyé le ${fdatetime(t.dateEnvoi)}${t.chauffeur ? " · " + esc(t.chauffeur) : ""}${t.vehicule ? " · " + esc(t.vehicule) : ""}`, `
    <a class="btn" href="#/transferts">← Transferts</a>
    <button class="btn" data-act="print-transfert" data-id="${t.id}">Imprimer le bordereau</button>
    ${ouvert && t.lignes.some(l => !l.recu) ? `<button class="btn" data-act="tf-all" data-id="${t.id}">Tout marquer reçu</button>` : ""}
    ${ouvert ? `<button class="btn btn-primary" data-act="tf-close" data-id="${t.id}">Clôturer la réception</button>` : ""}
    ${isAdmin() && !recus.length ? `<button class="btn btn-danger" data-act="tf-delete" data-id="${t.id}">Supprimer</button>` : ""}`)}
  <div class="kpi-row">
    ${kpi("Colis envoyés", t.lignes.filter(l => !l.horsListe).length)}
    ${kpi("Reçus", recus.length, "", "good")}
    ${kpi("En attente", t.lignes.filter(l => !l.recu && !l.manquant).length, ouvert ? `envoyé il y a ${num(daysAgo(t.dateEnvoi))} j` : "", ouvert && daysAgo(t.dateEnvoi) > 2 && t.lignes.some(l => !l.recu) ? "warn" : "")}
    ${kpi("Manquants", t.lignes.filter(l => l.manquant).length, "", t.lignes.some(l => l.manquant) ? "bad" : "")}
    ${kpi("Délai d'acheminement", last ? dureeTxt(new Date(last) - new Date(t.dateEnvoi)) : "—", last ? "dernière réception " + fdatetime(last) : "")}
  </div>
  ${ouvert ? `<section class="panel scan">
    <form data-form="tf-recv" data-id="${t.id}" class="row-inline">
      <input name="code" class="scan-input" placeholder="Réception à ${esc(branch(t.destination)?.nom || t.destination)} : scanner chaque colis reçu" aria-label="Tracking reçu" autocomplete="off">
      <button class="btn btn-primary">Confirmer reçu</button>
    </form>
    ${ui.scanMsg ? `<div class="alert ${ui.scanMsg.tone}" style="margin:0">${esc(ui.scanMsg.text)}</div>` : ""}
  </section>` : `<div class="alert ${statutTransfert(t) === "recu" ? "good" : "bad"}">Réception clôturée le ${fdatetime(t.cloture)}${t.lignes.some(l => l.manquant) ? ` — ${t.lignes.filter(l => l.manquant).length} colis manquant(s)` : " — tout est arrivé"}.</div>`}
  <div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>Tracking</th><th>Client / contenu</th><th>État</th><th>Date de réception</th><th>Reçu par</th><th></th></tr></thead><tbody>
    ${t.lignes.map((l, i) => { const c = colisOf(l.colisId); return `<tr>
      <td>${i + 1}</td><td class="mono"><span class="nowrap">${c ? `<a href="#/colis/${c.id}">${esc(l.tracking)}</a>` : esc(l.tracking)} <button type="button" class="btn-fix" data-act="fix-tracking" data-scope="tf" data-id="${t.id}" data-i="${i}" title="Corriger le numéro" aria-label="Corriger le numéro">✎</button></span>${l.corrections?.length ? `<div class="muted small" title="${esc(l.corrections.map(x => `${fdatetime(x.date)} : ${x.ancien} → ${x.nouveau} (${x.motif})`).join("\n"))}">corrigé · ancien : ${esc(l.corrections[0].ancien)}</div>` : ""}</td>
      <td>${c ? `${esc(clientOf(c.clientId)?.nom || "")} — ${esc(c.description)}` : '<span class="muted">—</span>'}</td>
      <td>${etat(l)}</td><td class="nowrap">${l.recu ? fdatetime(l.dateReception) : "—"}</td><td>${l.recuPar ? esc(userName(l.recuPar)) : ""}</td>
      <td class="nowrap">${ouvert ? (l.recu ? `<button class="btn btn-sm" data-act="tf-unmark" data-id="${t.id}" data-i="${i}">Annuler</button>` : `<button class="btn btn-sm btn-primary" data-act="tf-mark" data-id="${t.id}" data-i="${i}">Reçu</button>`)
        : l.manquant ? `<button class="btn btn-sm" data-act="tf-mark" data-id="${t.id}" data-i="${i}" title="Le colis est finalement arrivé">Arrivé finalement</button>` : ""}</td></tr>`; }).join("")}
  </tbody></table></div>
  ${t.note ? `<p class="muted">Note : ${esc(t.note)}</p>` : ""}`;
}

/* ---------- Clients ---------- */
VIEWS.clients = id => {
  if (id) return clientDetail(id);
  const q = ui.clients.q.toLowerCase();
  const list = db.clients.filter(c => !q || [c.code, c.nom, c.telephone, c.email].join(" ").toLowerCase().includes(q)).sort((a, b) => a.nom.localeCompare(b.nom));
  return `
  ${topbar("Clients", `${db.clients.length} client(s) — chaque client reçoit un code et une adresse de réception à Miami`,
    `<button class="btn" data-act="export-clients">Exporter CSV</button><button class="btn btn-primary" data-act="new-client">+ Nouveau client</button>`)}
  <div class="filters"><input class="search" type="search" placeholder="Rechercher par code, nom, téléphone…" data-filter="clients.q" value="${esc(ui.clients.q)}"></div>
  ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Nom</th><th>Type</th><th>Téléphone</th><th>Succursale</th><th class="r">Colis</th><th class="r">En cours</th><th class="r">Solde</th></tr></thead><tbody>
    ${list.map(c => { const cs = db.colis.filter(x => x.clientId === c.id); const sol = soldeClient(c.id); return `<tr class="click" data-href="clients/${c.id}">
      <td class="mono">${esc(c.code)}</td><td>${esc(c.nom)}</td><td>${c.type === "entreprise" ? "Entreprise" : "Particulier"}</td><td>${esc(c.telephone)}</td>
      <td>${esc(branch(c.succursale)?.nom || "")}</td><td class="num r">${cs.length}</td><td class="num r">${cs.filter(x => x.statut !== "livre").length}</td>
      <td class="num r ${sol > 0.009 ? "text-bad" : ""}">${sol > 0.009 ? money(sol) : "—"}</td></tr>`; }).join("")}
  </tbody></table></div>` : empty("Aucun client trouvé.")}`;
};
function clientDetail(id) {
  const c = clientOf(id);
  if (!c) return topbar("Client introuvable") + empty(`<a href="#/clients">← Retour</a>`);
  const cs = db.colis.filter(x => x.clientId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pays = db.paiements.filter(p => p.clientId === c.id);
  const fact = cs.reduce((s, x) => s + x.facture.total, 0);
  const E = S().entreprise;
  return `
  ${topbar(esc(c.nom), `<span class="mono">${esc(c.code)}</span> · ${esc(c.telephone)} ${c.email ? "· " + esc(c.email) : ""}`, `
    <a class="btn" href="#/clients">← Liste</a>
    <button class="btn" data-act="print-statement" data-id="${c.id}">Relevé de compte</button>
    <button class="btn" data-act="edit-client" data-id="${c.id}">Modifier</button>
    ${can("reception") ? `<button class="btn btn-primary" data-act="receive-for" data-id="${c.id}">+ Réceptionner un colis</button>` : ""}`)}
  <div class="kpi-row">
    ${kpi("Colis total", cs.length, `${cs.filter(x => x.statut !== "livre").length} en cours`)}
    ${kpi("Poids expédié", num(cs.reduce((s, x) => s + +x.poids, 0)) + " lb")}
    ${kpi("Total facturé", money(fact))}
    ${kpi("Total payé", money(pays.reduce((s, p) => s + p.montant, 0)), "", "good")}
    ${kpi("Solde", money(soldeClient(c.id)), "", soldeClient(c.id) > 0.009 ? "bad" : "")}
  </div>
  <div class="grid-2 wide-left">
    <section class="panel"><h3>Colis</h3>${colisTable(cs)}</section>
    <section class="panel">
      <h3>Adresse de réception à Miami</h3>
      <p class="muted small">À communiquer au client pour ses achats en ligne (Amazon, Shein, eBay…).</p>
      ${E.adresseUS ? `<div class="address-box" id="us-address">${esc(c.nom)}<br><b>${esc(c.code)}</b><br>${esc(E.adresseUS)}${E.telephoneUS ? `<br>Tél. ${esc(E.telephoneUS)}` : ""}</div>`
        : `<div class="alert warn">Adresse de l'entrepôt aux USA non renseignée : ajoutez-la dans Paramètres → Entreprise.</div>`}
      ${E.adresseUS ? `<button class="btn btn-sm" data-act="copy-address" data-id="${c.id}">Copier l'adresse</button>` : ""}
      <h3 class="mt">Informations</h3>
      <dl class="dl">
        <dt>Type</dt><dd>${c.type === "entreprise" ? "Entreprise" : "Particulier"}</dd>
        <dt>Succursale</dt><dd>${esc(branch(c.succursale)?.nom || "")}</dd>
        <dt>Adresse (Haïti)</dt><dd>${esc(c.adresse || "—")}</dd>
        <dt>Client depuis</dt><dd>${fdate(c.createdAt)}</dd>
        ${c.notes ? `<dt>Notes</dt><dd>${esc(c.notes)}</dd>` : ""}
      </dl>
    </section>
  </div>`;
}
function clientForm(c = {}) {
  return `<form data-form="client" data-id="${esc(c.id || "")}">
    <h2>${c.id ? "Modifier le client" : "Nouveau client"}</h2>
    <div class="field"><label>Nom complet / raison sociale *</label><input name="nom" required value="${esc(c.nom || "")}"></div>
    <div class="form-grid">
      <div class="field"><label>Téléphone (WhatsApp) *</label><input name="telephone" required value="${esc(c.telephone || "+509 ")}"></div>
      <div class="field"><label>Email</label><input type="email" name="email" value="${esc(c.email || "")}"></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Type</label><select name="type">${opt("particulier", "Particulier", c.type !== "entreprise")}${opt("entreprise", "Entreprise", c.type === "entreprise")}</select></div>
      <div class="field"><label>Succursale de retrait</label><select name="succursale">${destOptions(c.succursale)}</select></div>
    </div>
    <div class="field"><label>Adresse en Haïti (livraison)</label><input name="adresse" value="${esc(c.adresse || "")}"></div>
    <div class="field"><label>Notes</label><input name="notes" value="${esc(c.notes || "")}"></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
  </form>`;
}

/* ---------- Caisse ---------- */
VIEWS.caisse = () => {
  const { du, au } = ui.caisse;
  const list = db.paiements.filter(p => { const d = dayKey(p.date); return d >= du && d <= au; }).sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, p) => s + p.montant, 0);
  const parMethode = METHODES_PAIEMENT.map(m => ({ label: m.label, value: round(list.filter(p => p.methode === m.id).reduce((s, p) => s + p.montant, 0)) }));
  const debiteurs = db.clients.map(c => ({ c, sol: soldeClient(c.id) })).filter(x => x.sol > 0.009).sort((a, b) => b.sol - a.sol);
  return `
  ${topbar("Caisse & paiements", "Encaissements (USD, HTG, MonCash, NatCash…) et soldes à recouvrer", `<button class="btn" data-act="export-paiements">Exporter CSV</button>`)}
  <div class="filters">
    <label class="inline">Du <input type="date" data-filter="caisse.du" value="${du}"></label>
    <label class="inline">au <input type="date" data-filter="caisse.au" value="${au}"></label>
    <button class="btn btn-sm" data-act="period" data-id="today">Aujourd'hui</button>
    <button class="btn btn-sm" data-act="period" data-id="7">7 jours</button>
    <button class="btn btn-sm" data-act="period" data-id="month">Ce mois</button>
  </div>
  <div class="kpi-row">
    ${kpi("Total encaissé", money(total), htg(total * S().tauxChange), "good")}
    ${kpi("Transactions", list.length)}
    ${kpi("Taux du jour", `1 $ = ${num(S().tauxChange, 2)} HTG`)}
    ${kpi("À recouvrer", money(debiteurs.reduce((s, x) => s + x.sol, 0)), `${debiteurs.length} client(s)`, "bad")}
  </div>
  <div class="grid-2 wide-left">
    <section class="panel"><h3>Encaissements de la période</h3>
      ${list.length ? `<table class="tbl"><thead><tr><th>Reçu</th><th>Date</th><th>Client</th><th>Colis</th><th>Méthode</th><th class="r">Montant</th></tr></thead><tbody>
      ${list.map(p => `<tr><td class="mono">${esc(p.numero)}</td><td>${fdatetime(p.date)}</td><td>${esc(clientOf(p.clientId)?.nom || "")}</td>
        <td><a class="mono" href="#/colis/${p.colisId}">${esc(colisOf(p.colisId)?.tracking || "")}</a></td><td>${esc(methode(p.methode))}</td>
        <td class="num r">${money(p.montant)}${p.montantHTG ? `<div class="muted small">${htg(p.montantHTG)}</div>` : ""}</td></tr>`).join("")}
      </tbody></table>` : empty("Aucun encaissement sur la période.")}
    </section>
    <aside>
      <section class="panel"><h3>Par méthode de paiement</h3>${hbars(parMethode, money)}</section>
      <section class="panel"><h3>Soldes à recouvrer</h3>
        ${debiteurs.length ? `<table class="tbl"><tbody>${debiteurs.slice(0, 12).map(x => `<tr class="click" data-href="clients/${x.c.id}"><td>${esc(x.c.nom)}</td><td class="num r text-bad">${money(x.sol)}</td></tr>`).join("")}</tbody></table>` : empty("Aucun solde impayé.")}
      </section>
    </aside>
  </div>`;
};

/* ---------- Suivi (vue client) ---------- */
VIEWS.suivi = () => {
  const q = ui.suivi.q.trim().toUpperCase();
  const c = q && db.colis.find(x => x.tracking.toUpperCase() === q || String(x.trackingFournisseur).toUpperCase() === q);
  const idx = c ? STATUTS.findIndex(s => s.id === c.statut) : -1;
  const steps = ["recu", "transit", "arrive", "livre"];
  return `
  ${topbar("Suivi de colis", "Ce que voit le client : saisissez le n° de colis ou le n° de suivi du fournisseur")}
  <form class="panel track-form" data-form="suivi"><input name="q" value="${esc(ui.suivi.q)}" placeholder="Ex. ${esc(db.colis[0]?.tracking || "WX2609000001")}" aria-label="Numéro de suivi"><button class="btn btn-primary">Suivre</button></form>
  ${q && !c ? empty("Aucun colis ne correspond à ce numéro.") : ""}
  ${c ? `<section class="panel track">
    <div class="row-between"><div><div class="muted small">Colis</div><div class="big mono">${esc(c.tracking)}</div></div>${badge(c.statut)}</div>
    <div class="progress">${steps.map(s => `<div class="step ${STATUTS.findIndex(x => x.id === s) <= idx && c.statut !== "probleme" ? "done" : ""}"><span></span>${esc(statut(s).short)}</div>`).join("")}</div>
    <div class="facts"><span>Destination <b>${esc(branch(c.destination)?.nom || "")}</b></span><span>Service <b>${esc(serviceOf(c.service)?.nom || "")}</b></span><span>Poids <b>${num(c.poids)} lb</b></span>
    ${manifesteOf(c.manifesteId) ? `<span>${modeIc(manifesteOf(c.manifesteId).mode)} Arrivée en Haïti <b>${fdate(manifesteOf(c.manifesteId).eta)}</b></span>` : ""}</div>
    ${manifesteOf(c.manifesteId) ? `<h3 class="mt">Itinéraire</h3>${routeStrip(manifesteOf(c.manifesteId), { compact: true })}<h3 class="mt">Historique</h3>` : ""}
    ${timeline(c)}
  </section>` : ""}`;
};

/* ---------- Rapports ---------- */
VIEWS.rapports = () => {
  const mois = ui.rapports.mois;
  const cs = db.colis.filter(c => monthKey(c.createdAt) === mois);
  const pays = db.paiements.filter(p => monthKey(p.date) === mois);
  const fact = cs.reduce((s, c) => s + c.facture.total, 0);
  const groupe = (key, labelFn) => {
    const m = new Map();
    cs.forEach(c => { const k = c[key]; const g = m.get(k) || { n: 0, lb: 0, ca: 0 }; g.n++; g.lb += +c.poids; g.ca += c.facture.total; m.set(k, g); });
    return [...m.entries()].map(([k, g]) => ({ k, label: labelFn(k), ...g })).sort((a, b) => b.ca - a.ca);
  };
  const table = rows => `<table class="tbl"><thead><tr><th></th><th class="r">Colis</th><th class="r">Poids</th><th class="r">Facturé</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num r">${r.n}</td><td class="num r">${num(r.lb)} lb</td><td class="num r">${money(r.ca)}</td></tr>`).join("")}</tbody></table>`;
  const months = [];
  const d0 = new Date(mois + "-01T12:00:00");
  for (let i = 5; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1); const k = monthKey(d);
    months.push({ label: d.toLocaleDateString("fr-FR", { month: "short" }), value: round(db.colis.filter(c => monthKey(c.createdAt) === k).reduce((s, c) => s + c.facture.total, 0)) });
  }
  const transit = cs.filter(c => c.statut === "livre" && c.events.length > 1).map(c => (new Date(c.events.at(-1).date) - new Date(c.events[0].date)) / 86400000);
  return `
  ${topbar("Rapports", "Performance mensuelle : volumes, chiffre d'affaires, délais", `
    <input type="month" data-filter="rapports.mois" value="${mois}" aria-label="Mois">
    <button class="btn" data-act="export-colis-mois">Exporter le mois (CSV)</button>`)}
  <div class="kpi-row">
    ${kpi("Colis reçus", cs.length, `${cs.reduce((s, c) => s + +c.pieces, 0)} pièce(s)`)}
    ${kpi("Poids total", num(cs.reduce((s, c) => s + +c.poids, 0)) + " lb")}
    ${kpi("Chiffre d'affaires facturé", money(fact), htg(fact * S().tauxChange))}
    ${kpi("Encaissé", money(pays.reduce((s, p) => s + p.montant, 0)), "", "good")}
    ${kpi("Délai moyen porte-à-porte", transit.length ? num(transit.reduce((a, b) => a + b, 0) / transit.length) + " j" : "—", `${transit.length} colis livrés`)}
  </div>
  <div class="grid-2">
    <section class="panel"><h3>Chiffre d'affaires facturé — 6 derniers mois (USD)</h3>${vbars(months, money)}</section>
    <section class="panel"><h3>Par service</h3>${cs.length ? table(groupe("service", k => serviceOf(k)?.nom || k)) : empty("Aucune donnée.")}</section>
  </div>
  <div class="grid-2">
    <section class="panel"><h3>Par destination</h3>${cs.length ? table(groupe("destination", k => branch(k)?.nom || k)) : empty("Aucune donnée.")}</section>
    <section class="panel"><h3>Par catégorie de marchandise</h3>${cs.length ? table(groupe("categorie", k => k)) : empty("Aucune donnée.")}</section>
  </div>
  <section class="panel"><h3>Journal d'activité</h3>
    <table class="tbl"><tbody>${db.journal.slice(0, 25).map(j => `<tr><td class="muted small">${fdatetime(j.date)}</td><td>${esc(userName(j.user))}</td><td><b>${esc(j.action)}</b></td><td>${esc(j.details)}</td></tr>`).join("")}</tbody></table>
  </section>`;
};

/* ---------- Paramètres ---------- */
VIEWS.parametres = () => {
  const s = S(); const E = s.entreprise;
  return `
  ${topbar("Paramètres", "Entreprise, grille tarifaire, succursales, utilisateurs et sauvegardes")}
  <form class="panel" data-form="settings">
    <h3>Entreprise</h3>
    <div class="form-grid">
      ${[["nom", "Nom"], ["slogan", "Slogan"], ["telephone", "Téléphone Haïti"], ["telephoneUS", "Téléphone USA"], ["email", "Email"], ["site", "Site web"], ["adresse", "Adresse Haïti"], ["adresseUS", "Adresse entrepôt USA"], ["horaires", "Horaires"]]
        .map(([k, l]) => `<div class="field"><label>${l}</label><input name="e.${k}" value="${esc(E[k] || "")}"></div>`).join("")}
    </div>
    <h3 class="mt">Grille tarifaire <span class="muted small">(valeurs d'exemple — à remplacer par les tarifs officiels)</span></h3>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Service</th><th>Mode</th><th>Unité</th><th>Prix ($)</th><th>Minimum ($)</th><th>Délai</th></tr></thead><tbody>
      ${s.services.map((v, i) => `<tr><td><input name="s.${i}.nom" value="${esc(v.nom)}"></td><td>${v.mode === "mer" ? "Maritime" : "Aérien"}</td><td>${v.unite === "pi3" ? "pied cube" : "livre"}</td>
        <td><input type="number" step="0.01" min="0" name="s.${i}.prix" value="${v.prix}"></td><td><input type="number" step="0.01" min="0" name="s.${i}.minimum" value="${v.minimum}"></td>
        <td><input name="s.${i}.delai" value="${esc(v.delai)}"></td></tr>`).join("")}
    </tbody></table></div>
    <div class="form-grid g4 mt">
      <div class="field"><label>Transporteur maritime (bateau)</label><input name="t.mer" value="${esc(s.transporteurs.mer)}"></div>
      <div class="field"><label>Transporteur aérien (avion)</label><input name="t.air" value="${esc(s.transporteurs.air)}"></div>
      <div class="field"><label>Taux USD → HTG</label><input type="number" step="0.01" min="1" name="tauxChange" value="${s.tauxChange}"></div>
      <div class="field"><label>Diviseur volumétrique (po³/lb)</label><input type="number" step="1" min="1" name="diviseurVolumetrique" value="${s.diviseurVolumetrique}"></div>
      <div class="field"><label>Manutention / pièce ($)</label><input type="number" step="0.01" min="0" name="f.manutention" value="${s.frais.manutention}"></div>
      <div class="field"><label>Livraison domicile ($)</label><input type="number" step="0.01" min="0" name="f.livraison" value="${s.frais.livraison}"></div>
      <div class="field"><label>Assurance (% valeur)</label><input type="number" step="0.1" min="0" name="f.assurancePct" value="${s.frais.assurancePct}"></div>
      <div class="field"><label>Seuil douane ($)</label><input type="number" step="1" min="0" name="f.seuilDouane" value="${s.frais.seuilDouane}"></div>
      <div class="field"><label>Douane (% au-delà du seuil)</label><input type="number" step="0.1" min="0" name="f.douanePct" value="${s.frais.douanePct}"></div>
    </div>
    <p class="muted small">Les nouveaux tarifs s'appliquent aux colis reçus ensuite ; les factures déjà émises ne changent pas.</p>
    <h3 class="mt">Succursales</h3>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Nom</th><th>Ville</th><th>Téléphone</th><th>Rôle</th><th>Ouverte</th></tr></thead><tbody>
      ${s.succursales.map((b, i) => `<tr><td class="mono">${esc(b.id)}</td><td><input name="b.${i}.nom" value="${esc(b.nom)}"></td><td><input name="b.${i}.ville" value="${esc(b.ville)}"></td><td><input name="b.${i}.telephone" value="${esc(b.telephone || "")}"></td><td>${b.type === "origine" ? "Entrepôt d'origine" : "Destination"}</td>
        <td>${b.type === "origine" ? "" : `<input type="checkbox" name="b.${i}.actif" ${b.actif === false ? "" : "checked"} aria-label="${esc(b.nom)} ouverte" style="width:auto;min-width:0">`}</td></tr>`).join("")}
    </tbody></table></div>
    <h3 class="mt">Points de transit (aéroports, ports, entrepôts)</h3>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Nom</th><th>Code (IATA / port)</th><th>Ville</th><th>Pays</th><th>Type</th></tr></thead><tbody>
      ${s.pointsTransit.map((p, i) => `<tr><td><input name="pt.${i}.nom" value="${esc(p.nom)}"></td><td><input name="pt.${i}.code" value="${esc(p.code || "")}"></td>
        <td><input name="pt.${i}.ville" value="${esc(p.ville || "")}"></td><td><input name="pt.${i}.pays" value="${esc(p.pays || "")}"></td>
        <td><select name="pt.${i}.type">${TYPES_POINT.map(t => opt(t.id, t.label, t.id === p.type)).join("")}</select></td></tr>`).join("")}
    </tbody></table></div>
    <div class="form-actions"><div class="row-inline"><button type="button" class="btn" data-act="add-branch">+ Succursale</button><button type="button" class="btn" data-act="add-point">+ Point de transit</button></div><button class="btn btn-primary">Enregistrer les paramètres</button></div>
  </form>
  <section class="panel">
    <div class="panel-head"><h3>Utilisateurs & rôles</h3><button class="btn btn-sm" data-act="new-user">+ Utilisateur</button></div>
    <table class="tbl"><thead><tr><th>Nom</th><th>Rôle</th><th>Succursale</th><th>Accès</th><th></th></tr></thead><tbody>
      ${db.users.map(u => `<tr><td>${esc(u.nom)}</td><td>${esc(ROLES[u.role]?.label || u.role)}</td><td>${esc(branch(u.succursale)?.nom || "")}</td>
        <td class="muted small">${(ROLES[u.role]?.pages || []).map(p => NAV.find(n => n.id === p)?.label).join(", ")}</td>
        <td><button class="btn btn-sm" data-act="edit-user" data-id="${u.id}">Modifier</button></td></tr>`).join("")}
    </tbody></table>
  </section>
  <section class="panel">
    <h3>Sauvegarde des données</h3>
    <p class="muted small">Les données sont enregistrées dans ce navigateur. Exportez régulièrement une sauvegarde JSON.</p>
    <div class="row-inline wrap">
      <button class="btn" data-act="backup">Télécharger une sauvegarde</button>
      <label class="btn">Restaurer une sauvegarde<input type="file" accept="application/json" data-act-change="restore" hidden></label>
      <button class="btn" data-act="reset-demo">Recharger les données de démo</button>
      <button class="btn btn-danger" data-act="wipe">Tout effacer (démarrer à vide)</button>
    </div>
  </section>`;
};

/* =========================================================
   ACTIONS (clics)
========================================================= */
const ACTIONS = {
  "toggle-nav": () => { ui.navOpen = !ui.navOpen; document.body.classList.toggle("nav-open", ui.navOpen); },
  close: () => closeModal(),

  "new-client": () => openModal(clientForm({ succursale: me().succursale !== "FLL" ? me().succursale : "PAP" })),
  "new-client-inline": () => openModal(clientForm({ succursale: "PAP" }).replace('data-form="client"', 'data-form="client" data-inline="1"')),
  "edit-client": el => openModal(clientForm(clientOf(el.dataset.id))),
  "receive-for": el => { ui.reception.clientId = el.dataset.id; go("reception"); },
  "copy-address": el => {
    const c = clientOf(el.dataset.id); const E = S().entreprise;
    navigator.clipboard?.writeText(`${[c.nom, c.code, E.adresseUS, E.telephoneUS ? "Tél. " + E.telephoneUS : ""].filter(Boolean).join("\n")}`).then(() => toast("Adresse copiée"), () => toast("Copie impossible", "bad"));
  },

  "change-status": el => {
    const c = colisOf(el.dataset.id);
    openModal(`<form data-form="status" data-id="${c.id}">
      <h2>Changer le statut — <span class="mono">${esc(c.tracking)}</span></h2>
      <p class="muted">Statut actuel : ${badge(c.statut)}</p>
      <div class="field"><label>Nouveau statut</label><select name="statut">${nextStatuts(c.statut).map(s => opt(s, statut(s).label)).join("")}</select></div>
      <div class="field"><label>Note (visible dans l'historique)</label><input name="note"></div>
      <label class="check"><input type="checkbox" name="notifier" checked> Préparer la notification au client</label>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Valider</button></div>
    </form>`);
  },
  "quick-status": el => {
    const c = colisOf(el.dataset.id);
    store.mutate(() => { addEvent(c, el.dataset.st); log("Statut colis", `${c.tracking} → ${statut(el.dataset.st).label}`); });
    toast(`${c.tracking} : ${statut(el.dataset.st).label}`);
    ACTIONS.notify({ dataset: { id: c.id } });
  },
  "edit-colis": el => {
    const c = colisOf(el.dataset.id);
    openModal(`<form data-form="edit-colis" data-id="${c.id}"><h2>Modifier le colis <span class="mono">${esc(c.tracking)}</span></h2>
      ${colisFields(c)}
      ${c.statut !== "recu" ? `<p class="muted small">Le colis a déjà quitté l'entrepôt : la facture ne sera recalculée que si vous cochez la case.</p><label class="check"><input type="checkbox" name="recalculer"> Recalculer la facture</label>` : ""}
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>`, { wide: true });
  },
  "delete-colis": async el => {
    const c = colisOf(el.dataset.id);
    if (!await confirmBox(`Supprimer définitivement le colis ${c.tracking} ?`)) return;
    store.mutate(d => { d.colis = d.colis.filter(x => x.id !== c.id); log("Suppression colis", c.tracking); });
    go("colis");
  },
  pay: el => {
    const c = colisOf(el.dataset.id); const sol = soldeColis(c);
    openModal(`<form data-form="pay" data-id="${c.id}">
      <h2>Encaisser — <span class="mono">${esc(c.tracking)}</span></h2>
      <p>Solde dû : <b class="num">${money(sol)}</b> <span class="muted">(${htg(sol * S().tauxChange)})</span></p>
      <div class="pay-modes">${METHODES_PAIEMENT.map((m, i) => `<label class="pay-mode"><input type="radio" name="methode" value="${m.id}" ${i === 0 ? "checked" : ""}><span>${esc(m.label)}</span></label>`).join("")}</div>
      <div class="form-grid">
        <div class="field"><label>Montant (USD)</label><input type="number" name="montant" step="0.01" min="0.01" max="${sol}" value="${sol}" required></div>
        <div class="field"><label>Équivalent HTG (taux ${num(S().tauxChange, 2)})</label><input type="number" name="montantHTG" step="1" min="0" value="${Math.round(sol * S().tauxChange)}"></div>
      </div>
      <div class="field"><label>Référence (n° transaction MonCash, etc.)</label><input name="reference"></div>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Encaisser</button></div>
    </form>`, {
      onMount: m => {
        const usd = m.querySelector("[name=montant]"), h = m.querySelector("[name=montantHTG]");
        usd.addEventListener("input", () => { h.value = Math.round((+usd.value || 0) * S().tauxChange); });
        h.addEventListener("input", () => { usd.value = round((+h.value || 0) / S().tauxChange); });
      },
    });
  },
  deliver: el => {
    const c = colisOf(el.dataset.id); const sol = soldeColis(c); const cl = clientOf(c.clientId);
    openModal(`<form data-form="deliver" data-id="${c.id}">
      <h2>Remise du colis <span class="mono">${esc(c.tracking)}</span></h2>
      ${sol > 0.009 ? `<div class="alert bad">Solde impayé de <b>${money(sol)}</b>. Encaissez avant la remise${isAdmin() ? " (l'administrateur peut forcer)" : ""}.</div>` : `<div class="alert good">Colis entièrement payé.</div>`}
      <div class="field"><label>Remis à (nom de la personne) *</label><input name="recuPar" required value="${esc(cl?.nom || "")}"></div>
      <div class="field"><label>Pièce d'identité</label><select name="piece">${["CIN", "NIF", "Passeport", "Permis", "Autre"].map(x => opt(x, x)).join("")}</select></div>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button>
      ${sol > 0.009 && can("caisse") ? `<button type="button" class="btn" data-act="pay" data-id="${c.id}">Encaisser d'abord</button>` : ""}
      <button class="btn btn-gold" ${sol > 0.009 && !isAdmin() ? "disabled" : ""}>Confirmer la remise</button></div>
    </form>`);
  },
  "assign-livreur": el => {
    const c = colisOf(el.dataset.id);
    const livreurs = db.users.filter(u => u.role === "livreur");
    if (!livreurs.length) { toast("Ajoutez d'abord un utilisateur « Livreur » dans Paramètres", "bad"); return; }
    openModal(`<form data-form="assign" data-id="${c.id}"><h2>Envoyer en livraison</h2>
      <div class="field"><label>Livreur</label><select name="livreur">${livreurs.map(u => opt(u.id, u.nom)).join("")}</select></div>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Confirmer</button></div></form>`);
  },
  "comptoir-tab": el => { ui.comptoir.tab = el.dataset.id; render(); },

  notify: el => {
    const c = colisOf(el.dataset.id); const cl = clientOf(c.clientId);
    const msg = messageStatut({ ...c, _solde: soldeColis(c) }, cl, S());
    openModal(`<form data-form="notify" data-id="${c.id}"><h2>Notifier ${esc(cl?.nom || "le client")}</h2>
      <p class="muted small">${esc(cl?.telephone || "Pas de téléphone")}</p>
      <div class="field"><label>Message</label><textarea name="message" rows="5">${esc(msg)}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn" data-act="close">Fermer</button>
        <button type="button" class="btn" data-act="notify-send" data-canal="SMS" data-id="${c.id}">Copier (SMS)</button>
        ${cl?.telephone ? `<a class="btn btn-primary" id="wa-link" href="${esc(waLink(cl.telephone, msg))}" target="_blank" rel="noopener" data-act="notify-send" data-canal="WhatsApp" data-id="${c.id}">Ouvrir WhatsApp</a>` : ""}
      </div></form>`, {
      // Le lien WhatsApp suit les modifications du message
      onMount: f => { const ta = f.querySelector("textarea"), a = f.querySelector("#wa-link"); ta.addEventListener("input", () => { if (a) a.href = waLink(cl.telephone, ta.value); }); },
    });
  },
  "notify-send": el => {
    const c = colisOf(el.dataset.id); const cl = clientOf(c.clientId);
    const message = $("#modal-bg textarea[name=message]").value;
    const noter = () => store.mutate(d => { d.notifications.unshift({ id: store.uid(), date: store.nowIso(), colisId: c.id, clientId: c.clientId, canal: el.dataset.canal, message }); });
    if (el.dataset.canal === "WhatsApp") { noter(); closeModal(); toast("Message préparé dans WhatsApp : envoyez-le depuis WhatsApp"); return; }
    const ta = $("#modal-bg textarea[name=message]");
    const copie = navigator.clipboard?.writeText(message) || Promise.reject();
    copie.then(() => { noter(); closeModal(); toast("Message copié : collez-le dans votre SMS"); },
      () => { ta.focus(); ta.select(); toast("Copie automatique refusée : le message est sélectionné, copiez-le (Ctrl+C)", "bad"); });
  },

  "new-manifeste": () => openModal(manifesteForm({ mode: "air", transporteur: S().transporteurs.air, origine: "FLL", destination: "PAP", dateDepart: dayKey(Date.now() + 86400000) }), {
    // Le transporteur par défaut suit le mode : bateau → transporteur maritime (Solution Cargo)
    onMount: f => {
      const mode = f.querySelector("[name=mode]"), tr = f.querySelector("[name=transporteur]");
      mode.addEventListener("change", () => { if (!tr.value || Object.values(S().transporteurs).includes(tr.value)) tr.value = S().transporteurs[mode.value] || ""; });
    },
  }),
  "edit-manifeste": el => openModal(manifesteForm(manifesteOf(el.dataset.id))),
  "manif-remove": (el, e) => {
    e.stopPropagation();
    const c = colisOf(el.dataset.id);
    store.mutate(() => { c.manifesteId = null; if (c.statut === "consolide") addEvent(c, "recu", "Retiré du manifeste"); log("Manifeste", `${c.tracking} retiré`); });
  },
  "etape-valider": el => {
    const m = manifesteOf(el.dataset.id); const e = m.etapes.find(x => x.id === el.dataset.etape);
    const p = pointOf(e.pointId); const a = actionEtape(e.action);
    const n = db.colis.filter(c => c.manifesteId === m.id).length;
    openModal(`<form data-form="etape-valider" data-id="${m.id}" data-etape="${e.id}">
      <h2>${modeIc(m.mode)} ${esc(a.label)}</h2>
      <p><b>${esc(p.nom)}</b> <span class="mono muted">${esc(p.code || "")}</span> — ${esc(m.numero)}<br><span class="muted small">Prévu : ${fdatetime(e.prevu)}</span></p>
      <div class="field"><label>Date et heure réelles</label><input type="datetime-local" name="reel" required value="${dtLocal(store.nowIso())}"></div>
      <div class="field"><label>Note (ex. n° de vol, observation douane)</label><input name="note" value="${esc(e.note || "")}"></div>
      <p class="muted small">${a.statut ? `Le manifeste passera à « ${esc(statutManifeste(a.statut).label)} » et ` : ""}${n} colis recevront cette étape dans leur historique.</p>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Valider l'étape</button></div>
    </form>`);
  },
  "etape-edit": el => openModal(etapeForm(manifesteOf(el.dataset.id), manifesteOf(el.dataset.id).etapes.find(x => x.id === el.dataset.etape))),
  "etape-new": el => {
    const m = manifesteOf(el.dataset.id);
    // Date proposée : 2 h après l'étape choisie dans « Insérer après »
    const apres = id => new Date(new Date(m.etapes.find(x => x.id === id)?.prevu || Date.now()).getTime() + 2 * 3600000).toISOString();
    openModal(etapeForm(m, { action: "escale", prevu: store.nowIso() }), {
      onMount: f => { const sel = f.querySelector("[name=apres]"), pv = f.querySelector("[name=prevu]"); const upd = () => { pv.value = dtLocal(apres(sel.value)); }; sel.addEventListener("change", upd); upd(); },
    });
  },
  "etape-delete": async el => {
    const m = manifesteOf(el.dataset.id);
    if (!await confirmBox("Supprimer cette étape de l'itinéraire ?")) return;
    store.mutate(() => { m.etapes = m.etapes.filter(x => x.id !== el.dataset.etape); syncDatesManifeste(m); });
    closeModal();
  },
  "etapes-reset": async el => {
    const m = manifesteOf(el.dataset.id);
    if (!await confirmBox("Remplacer l'itinéraire par l'itinéraire type ?")) return;
    store.mutate(() => { m.etapes = itineraireType(m.mode, m.destination, m.dateDepart); syncDatesManifeste(m); });
  },
  "fix-tracking": el => {
    const { scope, id, i } = el.dataset;
    const actuel = scope === "colis" ? colisOf(id).trackingFournisseur : scope === "tf" ? transfertOf(id).lignes[+i].tracking
      : scope === "tf-draft" ? ui.transfert.lignes[+i].tracking : ui.reception.lot.lignes[+i].tracking;
    openModal(`<form data-form="fix-tracking" data-scope="${esc(scope)}" data-id="${esc(id || "")}" data-i="${esc(i ?? "")}">
      <h2>Corriger le numéro de suivi</h2>
      <p>Numéro actuel : <b class="mono">${esc(actuel || "—")}</b></p>
      <div class="field"><label for="fix-nouveau">Bon numéro (tapez-le ou scannez l'étiquette)</label>
        <input id="fix-nouveau" name="nouveau" class="fix-input" required autocomplete="off" value="${esc(actuel || "")}"></div>
      <div class="field"><label for="fix-motif">Motif</label><select id="fix-motif" name="motif">
        ${["Faute de frappe", "Mauvais code-barres scanné", "Étiquette abîmée ou illisible", "Numéro changé par le transporteur", "Autre"].map(x => opt(x, x)).join("")}</select></div>
      <p class="muted small">L'ancien numéro reste dans l'historique avec la date et votre nom.</p>
      <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Corriger</button></div>
    </form>`, { onMount: f => { const x = f.querySelector("#fix-nouveau"); x.focus(); x.select(); } });
  },
  "rc-mode": el => { ui.reception.mode = el.dataset.id; ui.scanMsg = null; render(); },
  "rc-remove": el => { ui.reception.lot.lignes.splice(+el.dataset.id, 1); ui.scanMsg = null; render(); },
  "rc-reset": async () => { if (!ui.reception.lot?.lignes.length || await confirmBox("Vider ce lot de réception ?")) { ui.reception.lot = null; ui.scanMsg = null; render(); } },
  "print-labels": el => { const r = db.receptions.find(x => x.id === el.dataset.id); printLabels(r.colisIds.map(colisOf).filter(Boolean)); },
  "tf-remove": el => { ui.transfert.lignes = ui.transfert.lignes.filter(l => l.tracking !== el.dataset.id); ui.scanMsg = null; render(); },
  "tf-reset": async () => { if (!ui.transfert?.lignes.length || await confirmBox("Vider ce bordereau ?")) { ui.transfert = null; ui.scanMsg = null; render(); } },
  "tf-mark": el => {
    const t = transfertOf(el.dataset.id); const l = t.lignes[+el.dataset.i];
    store.mutate(() => { recevoirLigne(t, l); if (t.cloture) log("Transfert", `${t.numero} : ${l.tracking} finalement reçu`); });
  },
  "tf-unmark": el => {
    const t = transfertOf(el.dataset.id); const l = t.lignes[+el.dataset.i];
    store.mutate(() => { if (l.horsListe) t.lignes.splice(+el.dataset.i, 1); else Object.assign(l, { recu: false, dateReception: null, recuPar: null }); });
  },
  "tf-all": async el => {
    const t = transfertOf(el.dataset.id); const n = t.lignes.filter(l => !l.recu).length;
    if (!await confirmBox(`Confirmer la réception des ${n} colis restants sans les scanner ?`)) return;
    store.mutate(() => { t.lignes.filter(l => !l.recu).forEach(l => recevoirLigne(t, l)); log("Transfert", `${t.numero} : ${n} colis marqués reçus`); });
  },
  "tf-close": async el => {
    const t = transfertOf(el.dataset.id); const n = t.lignes.filter(l => !l.recu).length;
    if (!await confirmBox(n ? `${n} colis n'ont pas été reçus : ils seront marqués MANQUANTS. Clôturer ?` : "Clôturer la réception de ce transfert ?")) return;
    store.mutate(() => {
      t.lignes.forEach(l => { if (!l.recu) l.manquant = true; });
      t.cloture = store.nowIso();
      log("Transfert", `${t.numero} clôturé — ${t.lignes.filter(l => l.recu).length} reçus, ${n} manquants`);
    });
    ui.scanMsg = null; toast(n ? `${n} colis manquant(s) signalé(s)` : "Transfert complet", n ? "bad" : "good");
  },
  "tf-delete": async el => {
    const t = transfertOf(el.dataset.id);
    if (!await confirmBox(`Supprimer le transfert ${t.numero} ?`)) return;
    store.mutate(d => { d.transferts = d.transferts.filter(x => x.id !== t.id); log("Transfert", `${t.numero} supprimé`); });
    go("transferts");
  },
  "print-transfert": el => printTransfert(transfertOf(el.dataset.id)),
  "export-transferts": () => downloadCsv("transferts.csv", [["N° transfert", "Date d'envoi", "Bureau d'envoi", "Bureau destinataire", "Chauffeur", "Véhicule", "Tracking", "Client", "Contenu", "État", "Date de réception"],
    ...(db.transferts || []).flatMap(t => t.lignes.map(l => { const c = colisOf(l.colisId); return [t.numero, t.dateEnvoi, branch(t.origine)?.nom || t.origine, branch(t.destination)?.nom || t.destination, t.chauffeur, t.vehicule,
      l.tracking, c ? clientOf(c.clientId)?.nom : "", c?.description || "", l.horsListe ? "Reçu hors bordereau" : l.recu ? "Reçu" : l.manquant ? "Manquant" : "En attente", l.dateReception || ""]; }))]),
  "man-mode": el => { ui.manifestes.mode = el.dataset.id; render(); },
  "export-voyages": () => downloadCsv("registre-voyages.csv", [["Date d'envoi", "Parti", "N° voyage", "Mode", "Transporteur", "Vol / navire", "Conteneur", "Référence", "Destination", "Colis", "Pièces", "Poids lb", "Valeur $", "Fret $", "Arrivée Haïti", "Statut"],
    ...[...db.manifestes].sort((a, b) => String(dateEnvoi(a)).localeCompare(String(dateEnvoi(b)))).map(m => { const b = bilanOf(m); return [dayKey(dateEnvoi(m)), m.bilan ? "oui" : "non", m.numero, m.mode === "mer" ? "Bateau" : "Avion", m.transporteur, m.mode === "mer" ? m.navire : m.vol, m.conteneur, m.reference,
      branch(m.destination)?.nom || m.destination, b.colis, b.pieces, b.poids, b.valeur, b.fret, dayKey(m.eta), statutManifeste(m.statut).label]; })]),
  "print-voyages": () => {
    const f = ui.manifestes;
    const list = db.manifestes.filter(m => (!f.mode || m.mode === f.mode) && (!f.mois || monthKey(dateEnvoi(m)) === f.mois)).sort((a, b) => String(dateEnvoi(a)).localeCompare(String(dateEnvoi(b))));
    const B = list.map(bilanOf); const tot = k => B.reduce((s, b) => s + b[k], 0);
    printHtml(`${docHeader()}<h2>Registre des voyages${f.mois ? " — " + new Date(f.mois + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : ""}${f.mode ? (f.mode === "mer" ? " — bateau" : " — avion") : ""}</h2>
      <table class="doc-table"><thead><tr><th>Date d'envoi</th><th>N°</th><th>Mode</th><th>Transporteur / vol / navire</th><th>Destination</th><th class="r">Colis</th><th class="r">Pièces</th><th class="r">Poids (lb)</th><th class="r">Fret ($)</th></tr></thead><tbody>
      ${list.map((m, i) => `<tr><td>${fdatetime(dateEnvoi(m))}${m.bilan ? "" : " (prévu)"}</td><td>${esc(m.numero)}</td><td>${m.mode === "mer" ? "Bateau" : "Avion"}</td><td>${esc(m.transporteur)} ${esc(transportInfo(m))}</td><td>${esc(branch(m.destination)?.nom || m.destination)}</td>
        <td class="r">${B[i].colis}</td><td class="r">${B[i].pieces}</td><td class="r">${num(B[i].poids)}</td><td class="r">${num(B[i].fret, 2)}</td></tr>`).join("")}
      <tr class="total"><td colspan="5">Total : ${list.length} voyage(s)</td><td class="r">${tot("colis")}</td><td class="r">${tot("pieces")}</td><td class="r">${num(tot("poids"))}</td><td class="r">${num(tot("fret"), 2)}</td></tr></tbody></table>`);
  },
  "ach-mode": el => { ui.acheminement.mode = el.dataset.id; render(); },
  "ach-vue": el => { ui.acheminement.vue = el.dataset.id; render(); },
  "add-point": () => {
    store.mutate(d => { d.settings.pointsTransit.push({ id: "PT-" + store.uid().slice(0, 5).toUpperCase(), nom: "Nouveau point", code: "", ville: "", pays: "USA", type: "aeroport" }); });
    toast("Point ajouté : complétez la ligne puis enregistrez");
  },

  "print-label": el => printLabel(colisOf(el.dataset.id)),
  "print-invoice": el => printInvoice(colisOf(el.dataset.id)),
  "print-manifeste": el => printManifeste(manifesteOf(el.dataset.id)),
  "print-statement": el => printStatement(clientOf(el.dataset.id)),

  period: el => {
    const t = new Date();
    ui.caisse.au = dayKey(t);
    ui.caisse.du = el.dataset.id === "today" ? dayKey(t) : el.dataset.id === "7" ? dayKey(Date.now() - 6 * 86400000) : monthKey(t) + "-01";
    render();
  },
  "export-colis": () => exportColis(db.colis, "colis.csv"),
  "export-colis-mois": () => exportColis(db.colis.filter(c => monthKey(c.createdAt) === ui.rapports.mois), `colis-${ui.rapports.mois}.csv`),
  "export-clients": () => downloadCsv("clients.csv", [["Code", "Nom", "Type", "Téléphone", "Email", "Succursale", "Adresse", "Solde USD"],
    ...db.clients.map(c => [c.code, c.nom, c.type, c.telephone, c.email, c.succursale, c.adresse, soldeClient(c.id)])]),
  "export-paiements": () => downloadCsv("paiements.csv", [["Reçu", "Date", "Client", "Colis", "Méthode", "Montant USD", "Montant HTG", "Référence"],
    ...db.paiements.map(p => [p.numero, p.date, clientOf(p.clientId)?.nom, colisOf(p.colisId)?.tracking, methode(p.methode), p.montant, p.montantHTG || "", p.reference])]),

  "add-branch": () => openModal(`<form data-form="branch-new"><h2>Nouvelle succursale</h2>
    <div class="form-grid">
      <div class="field"><label for="br-code">Code (2 à 5 lettres)</label><input id="br-code" name="code" required maxlength="5" placeholder="GON"></div>
      <div class="field"><label for="br-ville">Ville</label><input id="br-ville" name="ville" required placeholder="Gonaïves"></div>
    </div>
    <div class="field"><label for="br-nom">Nom affiché</label><input id="br-nom" name="nom" placeholder="Succursale Gonaïves"></div>
    <label class="check"><input type="checkbox" name="actif" checked> Ouverte (sélectionnable comme destination)</label>
    <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Ajouter</button></div></form>`),
  "new-user": () => openModal(userForm({ role: "comptoir", succursale: "PAP" })),
  "edit-user": el => openModal(userForm(db.users.find(u => u.id === el.dataset.id))),
  backup: () => download(`manager-logistique-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson()),
  "reset-demo": async () => { if (await confirmBox("Remplacer toutes les données par les données de démonstration ?")) { store.resetDemo(); toast("Données de démo rechargées"); } },
  wipe: async () => { if (await confirmBox("Effacer TOUS les clients, colis, manifestes et paiements ? (les paramètres sont réinitialisés)")) { store.wipeAll(); toast("Base vidée"); } },
};

const CHANGE_ACTIONS = {
  "switch-user": el => { db.currentUserId = el.value; store.save(); toast(`Connecté : ${me().nom}`); },
  "select-all": el => $$('input[name="sel"]', el.closest("form")).forEach(x => { x.checked = el.checked; }),
  restore: el => {
    const f = el.files[0]; if (!f) return;
    f.text().then(t => { store.importJson(t); toast("Sauvegarde restaurée"); }).catch(e => toast("Erreur : " + e.message, "bad"));
  },
};

function manifesteForm(m) {
  return `<form data-form="manifeste" data-id="${esc(m.id || "")}">
    <h2>${m.id ? "Modifier le manifeste" : "Nouveau manifeste"}</h2>
    <div class="form-grid">
      <div class="field"><label>Mode</label><select name="mode" ${m.id ? "disabled" : ""}>${opt("air", "Aérien (AWB)", m.mode === "air")}${opt("mer", "Maritime (conteneur / BL)", m.mode === "mer")}</select></div>
      <div class="field"><label>Transporteur</label><input name="transporteur" value="${esc(m.transporteur || "")}" list="carriers"><datalist id="carriers">${[...new Set([S().transporteurs.mer, S().transporteurs.air, ...db.manifestes.map(x => x.transporteur)])].filter(Boolean).map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Référence (AWB / BL / n° conteneur)</label><input name="reference" value="${esc(m.reference || "")}"></div>
      <div class="field"><label>Destination</label><select name="destination">${destOptions(m.destination)}</select></div>
    </div>
    <div class="form-grid g3">
      <div class="field"><label>N° de vol (aérien)</label><input name="vol" value="${esc(m.vol || "")}" placeholder="M6 1403"></div>
      <div class="field"><label>Navire / voyage (maritime)</label><input name="navire" value="${esc(m.navire || "")}" placeholder="Voyage SC-2536"></div>
      <div class="field"><label>N° conteneur (maritime)</label><input name="conteneur" value="${esc(m.conteneur || "")}" placeholder="481220-7"></div>
    </div>
    ${m.id ? `<p class="muted small">Les dates et points de transit se modifient dans l'itinéraire du manifeste.</p>` : `
    <div class="field"><label>Date de départ prévue (vol / appareillage)</label><input type="date" name="dateDepart" required value="${esc(m.dateDepart ? dayKey(m.dateDepart) : "")}"></div>
    <p class="muted small">L'itinéraire type (entrepôt → aéroport/port de départ → arrivée en Haïti → douane → succursale) est créé avec ses dates prévues ; vous pourrez ajouter des escales ensuite.</p>`}
    <div class="field"><label>Notes</label><input name="notes" value="${esc(m.notes || "")}"></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
  </form>`;
}
function pointsOptions(selected) {
  const grp = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(p => opt(p.id, `${p.nom}${p.code ? " (" + p.code + ")" : ""}`, p.id === selected)).join("")}</optgroup>` : "";
  const pts = S().pointsTransit;
  return grp("États-Unis", pts.filter(p => p.pays === "USA")) + grp("Haïti", pts.filter(p => p.pays === "Haïti"))
    + grp("République dominicaine & autres escales", pts.filter(p => p.pays !== "USA" && p.pays !== "Haïti"))
    + grp("Nos succursales", S().succursales.map(b => pointOf(b.id)));
}
function etapeForm(m, e) {
  const neu = !e.id;
  return `<form data-form="etape" data-id="${m.id}" data-etape="${esc(e.id || "")}">
    <h2>${neu ? "Ajouter une étape / escale" : "Modifier l'étape"} — ${esc(m.numero)}</h2>
    <div class="form-grid">
      <div class="field"><label>Étape</label><select name="action">${ACTIONS_ETAPE.map(a => opt(a.id, a.label, a.id === e.action)).join("")}</select></div>
      <div class="field"><label>Point de transit</label><select name="pointId">${pointsOptions(e.pointId)}</select></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Date prévue</label><input type="datetime-local" name="prevu" required value="${dtLocal(e.prevu)}"></div>
      <div class="field"><label>Date réalisée ${isAdmin() ? "(correction)" : ""}</label><input type="datetime-local" name="reel" value="${dtLocal(e.reel)}" ${isAdmin() || !e.reel ? "" : "disabled"}></div>
    </div>
    ${neu ? `<div class="field"><label>Insérer après</label><select name="apres">${m.etapes.map((x, i) => opt(x.id, `${i + 1}. ${actionEtape(x.action).short} — ${pointOf(x.pointId).code}`, x === (m.etapes.filter(y => y.reel).at(-1) || m.etapes[0]))).join("")}</select></div>` : ""}
    <div class="field"><label>Note</label><input name="note" value="${esc(e.note || "")}"></div>
    ${neu ? "" : `<label class="check"><input type="checkbox" name="decaler" ${e.reel ? "" : "checked"}> Reporter aussi les étapes suivantes non réalisées du même décalage</label>`}
    <div class="modal-actions">${!neu && !e.reel ? `<button type="button" class="btn btn-danger" data-act="etape-delete" data-id="${m.id}" data-etape="${e.id}">Supprimer</button>` : ""}
      <button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
  </form>`;
}
function userForm(u) {
  return `<form data-form="user" data-id="${esc(u.id || "")}"><h2>${u.id ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</h2>
    <div class="field"><label>Nom</label><input name="nom" required value="${esc(u.nom || "")}"></div>
    <div class="form-grid">
      <div class="field"><label>Rôle</label><select name="role">${Object.entries(ROLES).map(([k, r]) => opt(k, r.label, k === u.role)).join("")}</select></div>
      <div class="field"><label>Succursale</label><select name="succursale">${S().succursales.map(b => opt(b.id, b.nom, b.id === u.succursale)).join("")}</select></div>
    </div>
    <div class="modal-actions">${u.id && u.id !== me().id ? `<button type="button" class="btn btn-danger" data-act="delete-user" data-id="${u.id}">Supprimer</button>` : ""}
    <button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div></form>`;
}
ACTIONS["delete-user"] = async el => {
  if (!await confirmBox("Supprimer cet utilisateur ?")) return;
  store.mutate(d => { d.users = d.users.filter(u => u.id !== el.dataset.id); });
  closeModal();
};

function ajouterSuivis(codes) {
  const L = lotBrouillon(); if (!codes.length) return;
  const msgs = [];
  for (const code of codes) {
    if (L.lignes.some(l => l.tracking === code)) { msgs.push({ tone: "warn", text: `${code} est déjà dans ce lot.` }); continue; }
    const deja = findColis(code);
    if (deja) { msgs.push({ tone: "bad", text: `${code} a déjà été reçu le ${fdate(deja.createdAt)} (colis ${deja.tracking}) : non ajouté.` }); continue; }
    L.lignes.unshift({ tracking: code, clientRef: "", pieces: 1, poids: "" });
    msgs.push({ tone: "good", text: `✓ ${code} ajouté — ${L.lignes.length} colis scanné(s).` });
  }
  ui.scanMsg = msgs.length === 1 ? msgs[0] : { tone: msgs.some(m => m.tone === "bad") ? "bad" : msgs.some(m => m.tone === "warn") ? "warn" : "good", text: msgs.map(m => m.text).join(" ") };
  render();
}
/** Client technique qui accueille les colis reçus sans destinataire identifié. */
function clientNonIdentifie(db_) {
  let c = db_.clients.find(x => x.code === "CL-0000");
  if (!c) {
    c = { id: "c-inconnu", code: "CL-0000", nom: "Colis non identifié", type: "particulier", telephone: "", email: "", succursale: "PAP", adresse: "",
      notes: "Colis reçus sans client : ouvrir le colis puis « Modifier » pour l'attribuer au bon client.", createdAt: store.nowIso() };
    db_.clients.push(c);
  }
  return c;
}
function ajouterTrackings(codes) {
  const d = ui.transfert; if (!d || !codes.length) return;
  let ajoutes = 0; const doublons = [];
  for (const code of codes) {
    if (d.lignes.some(l => l.tracking === code)) { doublons.push(code); continue; }
    const c = findColis(code);
    d.lignes.unshift({ tracking: c ? c.tracking : code, colisId: c?.id || null }); ajoutes++;
  }
  ui.scanMsg = doublons.length ? { tone: "warn", text: `Déjà sur le bordereau : ${doublons.join(", ")}` }
    : { tone: "good", text: ajoutes === 1 ? `✓ ${d.lignes[0].tracking} ajouté${d.lignes[0].colisId ? "" : " (non enregistré dans le système)"}` : `✓ ${ajoutes} numéros ajoutés` };
  render();
}
/** Confirme la réception d'une ligne de bordereau (date, agent) et l'inscrit dans l'historique du colis. */
function recevoirLigne(t, l) {
  Object.assign(l, { recu: true, dateReception: store.nowIso(), recuPar: me().id, manquant: false });
  const c = colisOf(l.colisId);
  if (c) {
    // Le colis devient disponible au comptoir du bureau qui l'a reçu
    if (["arrive", "pret"].includes(c.statut)) c.destination = t.destination;
    addEvent(c, c.statut, `Reçu au bureau ${branch(t.destination)?.nom || t.destination} — transfert ${t.numero}`, branch(t.destination)?.nom);
  }
}

/* =========================================================
   FORMULAIRES (soumissions)
========================================================= */
const FORMS = {
  reception: form => {
    const d = readColisForm(form);
    if (!d.clientId) { toast("Client introuvable : choisissez-le dans la liste ou créez-le", "bad"); form.clientRef.focus(); return; }
    if (!(d.poids > 0)) { toast("Le poids est obligatoire", "bad"); return; }
    let c;
    ui.reception.clientId = ""; ui.reception.clear = true;
    store.mutate(db_ => {
      const seq = store.nextSeq("colis");
      c = {
        id: store.uid(), tracking: numeroTracking(seq), trackingFournisseur: d.trackingFournisseur, clientId: d.clientId,
        description: d.description, categorie: d.categorie, pieces: d.pieces, poids: d.poids, longueur: d.longueur, largeur: d.largeur, hauteur: d.hauteur,
        valeur: d.valeur, service: d.service, destination: d.destination, assurance: d.assurance, livraisonDomicile: d.livraisonDomicile, remise: d.remise,
        statut: "recu", manifesteId: null, emplacement: d.emplacement, livreur: null, livraison: null, notes: d.notes, createdAt: store.nowIso(), events: [],
      };
      addEvent(c, "recu", d.emplacement ? `Emplacement ${d.emplacement}` : "", "Fort Lauderdale");
      c.facture = calculerFacture(c, S());
      db_.colis.push(c);
      log("Réception", `${c.tracking} — ${clientOf(c.clientId).nom} — ${c.poids} lb`);
    });
    toast(`Colis ${c.tracking} enregistré — ${money(c.facture.total)}`);
    if (d.imprimer && !EMBED) printLabel(c);
  },
  "edit-colis": form => {
    const c = colisOf(form.dataset.id); const d = readColisForm(form);
    if (!d.clientId) { toast("Client introuvable", "bad"); return; }
    store.mutate(() => {
      Object.assign(c, {
        clientId: d.clientId, trackingFournisseur: d.trackingFournisseur, description: d.description, categorie: d.categorie, pieces: d.pieces, poids: d.poids,
        longueur: d.longueur, largeur: d.largeur, hauteur: d.hauteur, valeur: d.valeur, service: d.service, destination: d.destination,
        assurance: d.assurance, livraisonDomicile: d.livraisonDomicile, remise: d.remise, emplacement: d.emplacement, notes: d.notes,
      });
      c.aPeser = !(c.poids > 0);
      if (c.statut === "recu" || d.recalculer) c.facture = calculerFacture(c, S());
      log("Modification colis", c.tracking);
    });
    closeModal(); toast("Colis mis à jour");
  },
  status: form => {
    const c = colisOf(form.dataset.id); const d = formData(form);
    store.mutate(() => { addEvent(c, d.statut, d.note); if (d.statut === "recu") c.manifesteId = null; if (d.statut === "probleme" && d.note) c.notes = d.note; log("Statut colis", `${c.tracking} → ${statut(d.statut).label}`); });
    closeModal(); toast(`Statut : ${statut(d.statut).label}`);
    if (d.notifier) ACTIONS.notify({ dataset: { id: c.id } });
  },
  pay: form => {
    const c = colisOf(form.dataset.id); const d = formData(form);
    const montant = round(Math.min(+d.montant, soldeColis(c)));
    if (!(montant > 0)) { toast("Montant invalide", "bad"); return; }
    store.mutate(db_ => {
      db_.paiements.push({ id: store.uid(), numero: numeroRecu(store.nextSeq("recu")), colisId: c.id, clientId: c.clientId, montant, methode: d.methode,
        montantHTG: d.methode === "cash_htg" || d.methode === "moncash" || d.methode === "natcash" ? +d.montantHTG || Math.round(montant * S().tauxChange) : 0,
        reference: d.reference, date: store.nowIso(), user: me().id });
      log("Encaissement", `${c.tracking} — ${money(montant)} (${methode(d.methode)})`);
    });
    closeModal(); toast(`Paiement de ${money(montant)} enregistré`);
  },
  deliver: form => {
    const c = colisOf(form.dataset.id); const d = formData(form);
    if (soldeColis(c) > 0.009 && !isAdmin()) { toast("Solde impayé : encaissez d'abord", "bad"); return; }
    store.mutate(() => { c.livraison = { recuPar: d.recuPar, piece: d.piece, date: store.nowIso() }; addEvent(c, "livre", `Remis à ${d.recuPar}`); log("Livraison", `${c.tracking} remis à ${d.recuPar}`); });
    closeModal(); toast(`${c.tracking} livré`);
  },
  assign: form => {
    const c = colisOf(form.dataset.id); const d = formData(form);
    store.mutate(() => { c.livreur = d.livreur; addEvent(c, "livraison", `Livreur : ${userName(d.livreur)}`); log("Livraison", `${c.tracking} confié à ${userName(d.livreur)}`); });
    closeModal(); toast("Colis confié au livreur");
  },
  client: form => {
    const d = formData(form); const id = form.dataset.id;
    let created;
    store.mutate(db_ => {
      if (id) { Object.assign(clientOf(id), d); log("Client modifié", d.nom); return; }
      const seq = store.nextSeq("client");
      created = { id: store.uid(), code: codeClient(seq), ...d, createdAt: store.nowIso() };
      db_.clients.push(created); log("Nouveau client", `${created.code} — ${created.nom}`);
    });
    closeModal();
    if (created) {
      toast(`Client ${created.code} créé`);
      if (form.dataset.inline) { ui.reception.clientId = created.id; render(); }
      else go("clients", created.id);
    } else toast("Client mis à jour");
  },
  manifeste: form => {
    const d = formData(form); const id = form.dataset.id;
    // Midi local : évite qu'une date saisie s'affiche la veille à cause du fuseau horaire
    const toIso = v => v ? new Date(v + "T12:00:00").toISOString() : "";
    const info = { transporteur: d.transporteur, reference: d.reference, vol: d.vol, navire: d.navire, conteneur: d.conteneur, destination: d.destination, notes: d.notes };
    let m;
    store.mutate(db_ => {
      if (id) {
        m = manifesteOf(id); Object.assign(m, info);
        m.etapes.filter(e => e.action === "succursale" && !e.reel).forEach(e => { e.pointId = d.destination; });
        return;
      }
      const seq = store.nextSeq("manifeste");
      m = { id: store.uid(), numero: numeroManifeste(seq, d.mode), mode: d.mode, ...info, origine: "FLL", statut: "ouvert", createdAt: store.nowIso(),
        etapes: itineraireType(d.mode, d.destination, toIso(d.dateDepart)) };
      syncDatesManifeste(m);
      db_.manifestes.push(m); log("Nouveau manifeste", m.numero);
    });
    closeModal(); go("manifestes", m.id);
  },
  "branch-new": form => {
    const d = formData(form); const code = d.code.toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(code)) { toast("Le code doit contenir 2 à 5 lettres", "bad"); return; }
    if (branch(code)) { toast(`Le code ${code} est déjà utilisé`, "bad"); return; }
    store.mutate(db_ => { db_.settings.succursales.push({ id: code, nom: d.nom || "Succursale " + d.ville, ville: d.ville, type: "destination", telephone: "", actif: d.actif }); log("Paramètres", `Succursale ${code} ajoutée`); });
    closeModal(); toast(`Succursale ${code} ajoutée`);
  },
  "fix-tracking": form => {
    const { scope, id } = form.dataset; const i = +form.dataset.i; const d = formData(form);
    const nouveau = d.nouveau.trim().toUpperCase().replace(/\s+/g, "");
    const refus = msg => toast(msg, "bad");
    if (!nouveau) return refus("Saisissez le bon numéro.");
    const trace = ancien => ({ ancien, nouveau, motif: d.motif, date: store.nowIso(), user: me().id });
    if (scope === "tf-draft" || scope === "rc-draft") {
      const lignes = scope === "tf-draft" ? ui.transfert.lignes : ui.reception.lot.lignes; const l = lignes[i];
      if (nouveau === l.tracking) return closeModal();
      if (lignes.some((x, k) => k !== i && x.tracking === nouveau)) return refus(`${nouveau} est déjà dans la liste.`);
      const c = findColis(nouveau);
      if (scope === "rc-draft" && c) return refus(`${nouveau} a déjà été reçu le ${fdate(c.createdAt)} (colis ${c.tracking}).`);
      l.tracking = scope === "tf-draft" && c ? c.tracking : nouveau;
      if (scope === "tf-draft") l.colisId = c?.id || null;
      ui.scanMsg = { tone: "good", text: `✓ Numéro corrigé : ${l.tracking}${scope === "tf-draft" && !c ? " (non enregistré dans le système)" : ""}` };
      closeModal(); render(); return;
    }
    if (scope === "tf") {
      const t = transfertOf(id); const l = t.lignes[i];
      if (nouveau === l.tracking) return closeModal();
      const c = findColis(nouveau); const cible = c ? c.tracking : nouveau;
      const autre = t.lignes.findIndex((x, k) => k !== i && (x.tracking === cible || (c && x.colisId === c.id)));
      if (autre >= 0 && !t.lignes[autre].horsListe) return refus(`${cible} est déjà sur ce bordereau (ligne ${autre + 1}).`);
      store.mutate(() => {
        (l.corrections ||= []).push(trace(l.tracking));
        l.tracking = cible; l.colisId = c?.id || null;
        // Le bon colis avait été scanné « hors bordereau » : on fusionne avec la ligne corrigée
        if (autre >= 0) {
          const h = t.lignes[autre];
          if (h.recu) Object.assign(l, { recu: true, dateReception: h.dateReception, recuPar: h.recuPar, manquant: false });
          t.lignes.splice(autre, 1);
        }
        if (c) addEvent(c, c.statut, `N° corrigé sur le transfert ${t.numero} (${d.motif})`, branch(t.destination)?.nom);
        log("Correction", `${t.numero} : ${l.corrections.at(-1).ancien} → ${cible} (${d.motif})`);
      });
      closeModal(); toast(`Numéro corrigé : ${cible}${autre >= 0 ? " — fusionné avec le colis scanné hors bordereau" : ""}`); return;
    }
    const c = colisOf(id);
    if (nouveau === (c.trackingFournisseur || "").toUpperCase()) return closeModal();
    const doublon = db.colis.find(x => x.id !== c.id && (x.tracking.toUpperCase() === nouveau || String(x.trackingFournisseur || "").toUpperCase() === nouveau));
    if (doublon) return refus(`${nouveau} appartient déjà au colis ${doublon.tracking}.`);
    store.mutate(() => {
      (c.corrections ||= []).push(trace(c.trackingFournisseur || ""));
      c.trackingFournisseur = nouveau;
      addEvent(c, c.statut, `N° de suivi corrigé : ${c.corrections.at(-1).ancien || "—"} → ${nouveau} (${d.motif})`);
      log("Correction", `${c.tracking} : n° fournisseur ${c.corrections.at(-1).ancien || "—"} → ${nouveau} (${d.motif})`);
    });
    closeModal(); toast(`Numéro de suivi corrigé : ${nouveau}`);
  },
  "rc-scan": form => { ajouterSuivis(splitTrackings(form.code.value)); },
  "rc-bulk": form => { ajouterSuivis(splitTrackings(form.bulk.value)); },
  "rc-save": async form => {
    const L = ui.reception.lot; Object.assign(L, formData(form));
    const n = L.lignes.length; const annonce = +L.nombreAnnonce || 0;
    if (!n) return;
    // Client de chaque colis : celui de la ligne, sinon le client par défaut, sinon « non identifié »
    const inconnus = [];
    const clients = L.lignes.map(l => { const ref = (l.clientRef || L.clientDefaut || "").trim(); if (!ref) return null; const c = resolveClient(ref); if (!c) inconnus.push(`${l.tracking} (« ${ref} »)`); return c; });
    if (inconnus.length) { toast(`Client introuvable pour : ${inconnus.join(", ")}. Choisissez-le dans la liste ou créez-le.`, "bad"); return; }
    if (annonce && annonce !== n && !(await confirmBox(`Écart : ${annonce} colis annoncés, ${n} scannés.\nEnregistrer quand même ? L'écart restera visible dans l'historique.`))) return;
    let r;
    store.mutate(db_ => {
      db_.receptions = db_.receptions || [];
      const date = store.nowIso();
      r = { id: store.uid(), numero: numeroReception(store.nextSeq("reception")), date, livreur: L.livreur, nombreAnnonce: annonce, colisIds: [], user: me().id,
        note: [L.note, annonce && annonce !== n ? `Écart : ${annonce} annoncés, ${n} reçus` : ""].filter(Boolean).join(" — ") };
      [...L.lignes].reverse().forEach((l, k) => {
        const cl = clients[n - 1 - k] || clientNonIdentifie(db_);
        const dest = branch(cl.succursale)?.actif === false ? "PAP" : cl.succursale || "PAP";
        const poids = +l.poids || 0;
        const c = {
          id: store.uid(), tracking: numeroTracking(store.nextSeq("colis")), trackingFournisseur: l.tracking, clientId: cl.id,
          description: `Colis ${L.livreur}`, categorie: "Divers", pieces: +l.pieces || 1, poids, longueur: 0, largeur: 0, hauteur: 0, valeur: 0,
          service: L.service, destination: dest, assurance: false, livraisonDomicile: false, remise: 0, statut: "recu", manifesteId: null,
          emplacement: "", livreur: null, livraison: null, notes: "", createdAt: date, events: [], aPeser: !(poids > 0), receptionId: r.id,
        };
        addEvent(c, "recu", `Réception ${r.numero} — livré par ${L.livreur}`, "Fort Lauderdale", date);
        c.facture = calculerFacture(c, S());
        db_.colis.push(c); r.colisIds.push(c.id);
      });
      db_.receptions.push(r);
      log("Réception", `${r.numero} : ${n} colis livrés par ${L.livreur}${annonce ? ` (${annonce} annoncés)` : ""}`);
    });
    ui.reception.lot = null; ui.scanMsg = null;
    toast(`Réception ${r.numero} enregistrée : ${n} colis`);
    go("reception", r.id);
  },
  "tf-scan": form => { ajouterTrackings(splitTrackings(form.code.value)); },
  "tf-bulk": form => { ajouterTrackings(splitTrackings(form.bulk.value)); },
  "tf-save": form => {
    const d = { ...ui.transfert, ...formData(form) };
    if (!d.destination) { toast("Choisissez le bureau destinataire", "bad"); return; }
    if (d.destination === d.origine) { toast("Le bureau destinataire doit être différent du bureau d'envoi", "bad"); return; }
    if (!d.lignes.length) { toast("Ajoutez au moins un tracking", "bad"); return; }
    let t;
    store.mutate(db_ => {
      db_.transferts = db_.transferts || [];
      const dateEnvoi = new Date(d.dateEnvoi).toISOString();
      t = { id: store.uid(), numero: numeroTransfert(store.nextSeq("transfert"), new Date(dateEnvoi)), origine: d.origine, destination: d.destination, dateEnvoi,
        chauffeur: d.chauffeur, vehicule: d.vehicule, note: d.note, user: me().id, createdAt: store.nowIso(), cloture: null,
        lignes: [...d.lignes].reverse().map(l => ({ tracking: l.tracking, colisId: l.colisId, recu: false, dateReception: null, recuPar: null, horsListe: false, manquant: false })) };
      db_.transferts.push(t);
      t.lignes.forEach(l => { const c = colisOf(l.colisId); if (c) addEvent(c, c.statut, `Envoyé vers ${branch(t.destination)?.nom || t.destination} — transfert ${t.numero}`, branch(t.origine)?.nom, dateEnvoi); });
      log("Transfert", `${t.numero} : ${t.lignes.length} colis ${t.origine} → ${t.destination}`);
    });
    ui.transfert = null; ui.scanMsg = null;
    toast(`Transfert ${t.numero} enregistré (${t.lignes.length} colis)`);
    go("transferts", t.id);
  },
  "tf-recv": form => {
    const t = transfertOf(form.dataset.id); const codes = splitTrackings(form.code.value);
    if (!codes.length) return;
    const msgs = [];
    store.mutate(() => {
      for (const code of codes) {
        const c = findColis(code);
        const l = t.lignes.find(x => x.tracking === code || (c && x.colisId === c.id));
        if (l && l.recu) msgs.push({ tone: "warn", text: `${code} déjà confirmé reçu le ${fdatetime(l.dateReception)}.` });
        else if (l) { recevoirLigne(t, l); msgs.push({ tone: "good", text: `✓ ${code} reçu.` }); }
        else {
          const nl = { tracking: code, colisId: c?.id || null, recu: false, dateReception: null, recuPar: null, horsListe: true, manquant: false };
          t.lignes.push(nl); recevoirLigne(t, nl);
          msgs.push({ tone: "bad", text: `⚠ ${code} n'est PAS sur ce bordereau : ajouté comme « reçu hors bordereau ».` });
        }
      }
    });
    ui.scanMsg = msgs.length === 1 ? msgs[0] : { tone: msgs.some(m => m.tone === "bad") ? "bad" : "good", text: msgs.map(m => m.text).join(" ") };
    render();
  },
  etape: form => {
    const m = manifesteOf(form.dataset.id); const d = formData(form);
    const prevu = new Date(d.prevu).toISOString();
    store.mutate(() => {
      if (!form.dataset.etape) {
        const e = { id: store.uid(), pointId: d.pointId, action: d.action, prevu, reel: d.reel ? new Date(d.reel).toISOString() : null, note: d.note };
        const at = m.etapes.findIndex(x => x.id === d.apres);
        m.etapes.splice(at + 1, 0, e);
        log("Itinéraire", `${m.numero} : ${actionEtape(d.action).short} à ${pointOf(d.pointId).nom} ajoutée`);
      } else {
        const i = m.etapes.findIndex(x => x.id === form.dataset.etape); const e = m.etapes[i];
        const delta = new Date(prevu) - new Date(e.prevu);
        Object.assign(e, { pointId: d.pointId, action: d.action, prevu, note: d.note });
        if (form.reel && !form.reel.disabled) e.reel = d.reel ? new Date(d.reel).toISOString() : null;
        if (d.decaler && delta) m.etapes.slice(i + 1).forEach(x => { if (!x.reel) x.prevu = new Date(new Date(x.prevu).getTime() + delta).toISOString(); });
        log("Itinéraire", `${m.numero} : étape ${actionEtape(e.action).short} modifiée${delta ? ` (${delta > 0 ? "+" : ""}${num(delta / 86400000)} j)` : ""}`);
      }
      syncDatesManifeste(m);
    });
    closeModal(); toast("Itinéraire mis à jour");
  },
  "etape-valider": form => {
    const m = manifesteOf(form.dataset.id); const e = m.etapes.find(x => x.id === form.dataset.etape); const d = formData(form);
    const reel = new Date(d.reel).toISOString();
    const p = pointOf(e.pointId); const a = actionEtape(e.action);
    store.mutate(() => {
      e.reel = reel; e.note = d.note;
      if (e.action === "depart") enregistrerVoyage(m, db.colis, reel);
      const note = `${a.label} — ${p.nom}${p.code ? " (" + p.code + ")" : ""}${d.note ? " · " + d.note : ""}`;
      const lieu = [p.nom, p.ville].filter(Boolean).join(", ");
      const avances = a.statut ? setManifesteStatut(m, a.statut, { note, lieu, date: reel }) : [];
      // Les colis dont le statut ne change pas reçoivent quand même le point de passage dans leur historique
      db.colis.filter(c => c.manifesteId === m.id && !avances.includes(c.id) && c.statut !== "probleme" && STATUT_ORDER[c.statut] <= STATUT_ORDER.arrive)
        .forEach(c => addEvent(c, c.statut, note, lieu, reel));
      syncDatesManifeste(m);
      log("Acheminement", `${m.numero} : ${a.short} à ${p.nom} (${fdatetime(reel)})`);
    });
    closeModal(); toast(`${m.numero} : ${a.short} validé(e)`);
  },
  "manif-add": form => {
    const m = manifesteOf(form.dataset.id);
    const ids = $$('input[name="sel"]:checked', form).map(x => x.value);
    if (!ids.length) { toast("Sélectionnez au moins un colis", "bad"); return; }
    store.mutate(() => {
      ids.forEach(id => { const c = colisOf(id); c.manifesteId = m.id; addEvent(c, "consolide", `Manifeste ${m.numero}`); });
      log("Manifeste", `${ids.length} colis ajoutés à ${m.numero}`);
    });
    toast(`${ids.length} colis ajoutés`);
  },
  scan: form => {
    const code = form.code.value.trim().toUpperCase();
    const c = db.colis.find(x => x.tracking.toUpperCase() === code || String(x.trackingFournisseur).toUpperCase() === code);
    if (c) go("colis", c.id); else { toast("Colis introuvable", "bad"); form.code.select(); }
  },
  suivi: form => { ui.suivi.q = form.q.value; render(); },
  settings: form => {
    const d = formData(form);
    store.mutate(db_ => {
      const s = db_.settings;
      for (const [k, v] of Object.entries(d)) {
        const [p, a, b] = k.split(".");
        if (p === "e") s.entreprise[a] = v;
        else if (p === "f") s.frais[a] = +v || 0;
        else if (p === "s") s.services[+a][b] = b === "prix" || b === "minimum" ? +v || 0 : v;
        else if (p === "b") s.succursales[+a][b] = v;
        else if (p === "pt") s.pointsTransit[+a][b] = v;
        else if (p === "t") s.transporteurs[a] = v;
        else if (k === "tauxChange" || k === "diviseurVolumetrique") s[k] = +v || s[k];
      }
      log("Paramètres", "Paramètres mis à jour");
    });
    toast("Paramètres enregistrés");
  },
  user: form => {
    const d = formData(form); const id = form.dataset.id;
    store.mutate(db_ => { if (id) Object.assign(db_.users.find(u => u.id === id), d); else db_.users.push({ id: store.uid(), ...d }); });
    closeModal();
  },
};

/* =========================================================
   IMPRESSIONS
========================================================= */
function docHeader() {
  const E = S().entreprise;
  return `<div class="doc-head"><div><div class="doc-brand">${esc(nomEntreprise(S()))}</div><div class="small">${esc(E.adresse || "")}${E.adresse ? "<br>" : ""}${[E.telephone, E.email, E.site].filter(Boolean).map(esc).join(" · ")}</div></div></div>`;
}
function printLabel(c) { printLabels([c]); }
function printLabels(list) { printHtml(`<style>@page{size:4in 6in;margin:0.15in}.label{break-after:page}</style>${list.map(labelHtml).join("")}`, { format: "label" }); }
function labelHtml(c) {
  const cl = clientOf(c.clientId); const b = branch(c.destination);
  return `<div class="label">
    <div class="label-top"><b>${esc(nomEntreprise(S()))}</b><span>${esc(serviceOf(c.service)?.nom || "")}</span></div>
    <div class="label-dest">${esc(c.destination)}</div>
    <div class="small">${esc(b?.nom || "")}</div>
    <div class="label-client">${esc(cl?.nom || "")}<br><span class="mono">${esc(cl?.code || "")}</span> · ${esc(cl?.telephone || "")}</div>
    <div class="label-bc">${barcodeSvg(c.tracking, { height: 70, narrow: 2 })}<div class="mono big">${esc(c.tracking)}</div></div>
    <div class="label-grid"><span>Poids<b>${c.aPeser ? "à peser" : num(c.poids) + " lb"}</b></span><span>Pièces<b>${c.pieces}</b></span><span>Reçu<b>${fdate(c.createdAt)}</b></span></div>
    <div class="small">${esc(c.description)}${c.trackingFournisseur ? " · " + esc(c.trackingFournisseur) : ""}${c.livraisonDomicile ? " — LIVRAISON DOMICILE" : ""}</div>
  </div>`;
}
function printInvoice(c) {
  const cl = clientOf(c.clientId); const pays = db.paiements.filter(p => p.colisId === c.id); const sol = soldeColis(c);
  printHtml(`${docHeader()}
    <h2>Facture — colis ${esc(c.tracking)}</h2>
    <div class="doc-cols"><div><b>Client</b><br>${esc(cl?.nom || "")}<br>${esc(cl?.code || "")}<br>${esc(cl?.telephone || "")}</div>
    <div><b>Expédition</b><br>${esc(c.description)}<br>${num(c.poids)} lb · ${c.pieces} pièce(s)<br>${esc(serviceOf(c.service)?.nom || "")} → ${esc(branch(c.destination)?.nom || "")}</div>
    <div><b>Date</b><br>${fdate(c.createdAt)}<br>${barcodeSvg(c.tracking, { height: 34, narrow: 1.2 })}</div></div>
    <table class="doc-table"><thead><tr><th>Désignation</th><th class="r">Montant</th></tr></thead><tbody>
      ${c.facture.lignes.map(l => `<tr><td>${esc(l.label)}</td><td class="r">${money(l.montant)}</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="r">${money(c.facture.total)}</td></tr>
      ${pays.map(p => `<tr><td>Paiement ${esc(p.numero)} — ${esc(methode(p.methode))} — ${fdate(p.date)}</td><td class="r">−${money(p.montant)}</td></tr>`).join("")}
      <tr class="total"><td>Solde à payer</td><td class="r">${money(sol)} <small>(${htg(sol * S().tauxChange)})</small></td></tr>
    </tbody></table>
    <p class="small">Merci de votre confiance. Horaires : ${esc(S().entreprise.horaires)}.</p>`);
}
function printManifeste(m) {
  const cs = db.colis.filter(c => c.manifesteId === m.id);
  printHtml(`${docHeader()}
    <h2>Manifeste de chargement ${esc(m.numero)}</h2>
    <div class="doc-cols"><div><b>Mode</b><br>${m.mode === "mer" ? "Maritime" : "Aérien"} — ${esc(m.transporteur)}</div><div><b>Référence</b><br>${esc(m.reference)}</div>
    <div><b>Trajet</b><br>${esc(branch(m.origine)?.ville || m.origine)} → ${esc(branch(m.destination)?.ville || m.destination)}</div><div><b>Départ / ETA</b><br>${fdate(m.dateDepart)} / ${fdate(m.eta)}</div>
    <div><b>${m.mode === "mer" ? "Navire / conteneur" : "Vol"}</b><br>${esc(transportInfo(m) || "—")}</div></div>
    <table class="doc-table"><thead><tr><th>Étape</th><th>Point de transit</th><th>Prévu</th><th>Réalisé</th></tr></thead><tbody>
    ${(m.etapes || []).map(e => `<tr><td>${esc(actionEtape(e.action).label)}</td><td>${esc(pointOf(e.pointId).nom)} ${esc(pointOf(e.pointId).code || "")}</td><td>${fdatetime(e.prevu)}</td><td>${e.reel ? fdatetime(e.reel) : ""}</td></tr>`).join("")}
    </tbody></table><br>
    <table class="doc-table"><thead><tr><th>#</th><th>N° colis</th><th>Destinataire</th><th>Contenu</th><th class="r">Pcs</th><th class="r">Poids (lb)</th><th class="r">Valeur ($)</th></tr></thead><tbody>
    ${cs.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "")}</td><td>${esc(c.description)}</td><td class="r">${c.pieces}</td><td class="r">${num(c.poids)}</td><td class="r">${num(c.valeur, 0)}</td></tr>`).join("")}
    <tr class="total"><td colspan="4">Total : ${cs.length} colis</td><td class="r">${cs.reduce((s, c) => s + +c.pieces, 0)}</td><td class="r">${num(cs.reduce((s, c) => s + +c.poids, 0))}</td><td class="r">${num(cs.reduce((s, c) => s + +c.valeur, 0), 0)}</td></tr>
    </tbody></table>
    <div class="doc-cols sign"><div>Préparé par : ____________________</div><div>Reçu par : ____________________</div></div>`);
}
function printTransfert(t) {
  printHtml(`${docHeader()}
    <h2>Bordereau de transfert ${esc(t.numero)}</h2>
    <div class="doc-cols"><div><b>De</b><br>${esc(branch(t.origine)?.nom || t.origine)}</div><div><b>Vers</b><br>${esc(branch(t.destination)?.nom || t.destination)}</div>
    <div><b>Date d'envoi</b><br>${fdatetime(t.dateEnvoi)}</div><div><b>Chauffeur / véhicule</b><br>${esc(t.chauffeur || "—")} ${esc(t.vehicule || "")}</div></div>
    <div style="margin-bottom:10px">${barcodeSvg(t.numero, { height: 34, narrow: 1.2 })}</div>
    <table class="doc-table"><thead><tr><th>#</th><th>Tracking</th><th>Client</th><th>Contenu</th><th>Reçu ✓</th><th>Date de réception</th></tr></thead><tbody>
    ${t.lignes.map((l, i) => { const c = colisOf(l.colisId); return `<tr><td>${i + 1}</td><td>${esc(l.tracking)}</td><td>${esc(c ? clientOf(c.clientId)?.nom || "" : "")}</td><td>${esc(c?.description || "")}</td>
      <td>${l.recu ? "✓" : "☐"}</td><td>${l.recu ? fdatetime(l.dateReception) : ""}</td></tr>`; }).join("")}
    <tr class="total"><td colspan="6">Total : ${t.lignes.length} colis</td></tr></tbody></table>
    <div class="doc-cols sign"><div>Remis par (${esc(branch(t.origine)?.nom || "")}) : ____________________</div><div>Reçu par (${esc(branch(t.destination)?.nom || "")}) : ____________________<br><br>Date : ____ / ____ / ______</div></div>`);
}
function printStatement(cl) {
  const cs = db.colis.filter(c => c.clientId === cl.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  printHtml(`${docHeader()}
    <h2>Relevé de compte — ${esc(cl.nom)} (${esc(cl.code)})</h2>
    <p class="small">Édité le ${fdate(store.nowIso())}</p>
    <table class="doc-table"><thead><tr><th>Date</th><th>Colis</th><th>Contenu</th><th>Statut</th><th class="r">Facturé</th><th class="r">Payé</th><th class="r">Solde</th></tr></thead><tbody>
    ${cs.map(c => `<tr><td>${fdate(c.createdAt)}</td><td>${esc(c.tracking)}</td><td>${esc(c.description)}</td><td>${esc(statut(c.statut).label)}</td><td class="r">${money(c.facture.total)}</td><td class="r">${money(payeColis(c))}</td><td class="r">${money(soldeColis(c))}</td></tr>`).join("")}
    <tr class="total"><td colspan="4">Total</td><td class="r">${money(cs.reduce((s, c) => s + c.facture.total, 0))}</td><td class="r">${money(cs.reduce((s, c) => s + payeColis(c), 0))}</td><td class="r">${money(soldeClient(cl.id))}</td></tr>
    </tbody></table>`);
}
function exportColis(list, filename) {
  downloadCsv(filename, [["N° colis", "N° fournisseur", "Date réception", "Client", "Code client", "Contenu", "Catégorie", "Pièces", "Poids lb", "Valeur $", "Service", "Destination", "Statut", "Manifeste", "Facturé $", "Payé $", "Solde $"],
    ...list.map(c => [c.tracking, c.trackingFournisseur, c.createdAt.slice(0, 10), clientOf(c.clientId)?.nom, clientOf(c.clientId)?.code, c.description, c.categorie, c.pieces, c.poids, c.valeur,
      serviceOf(c.service)?.nom, c.destination, statut(c.statut).label, manifesteOf(c.manifesteId)?.numero || "", c.facture.total, payeColis(c), soldeColis(c)])]);
}

/* =========================================================
   DÉLÉGATION D'ÉVÉNEMENTS
========================================================= */
document.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (act && ACTIONS[act.dataset.act] && !act.disabled) {
    if (!(act.tagName === "A" && act.target === "_blank")) e.preventDefault(); // un vrai lien externe (WhatsApp) doit s'ouvrir
    ACTIONS[act.dataset.act](act, e); return;
  }
  const row = e.target.closest("[data-href]");
  if (row && !e.target.closest("a,button,input,select,label")) go(...row.dataset.href.split("/"));
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-act-change]");
  if (el && CHANGE_ACTIONS[el.dataset.actChange]) CHANGE_ACTIONS[el.dataset.actChange](el);
  if (e.target.dataset.filter && e.target.tagName !== "INPUT") applyFilter(e.target);
  if (e.target.dataset.filter && ["date", "month"].includes(e.target.type)) applyFilter(e.target);
});
document.addEventListener("input", e => {
  if (e.target.dataset.filter && e.target.type === "search") applyFilter(e.target);
  if (e.target.dataset.draft && ui.transfert) ui.transfert[e.target.dataset.draft] = e.target.value;
  if (e.target.dataset.lot && ui.reception.lot) ui.reception.lot[e.target.dataset.lot] = e.target.value;
  if (e.target.dataset.line !== undefined && ui.reception.lot) ui.reception.lot.lignes[+e.target.dataset.line][e.target.dataset.field] = e.target.value;
});
// Compteurs du lot mis à jour quand on quitte le champ (nombre annoncé, pièces)
document.addEventListener("change", e => {
  if (ui.reception.lot && (e.target.dataset.lot === "nombreAnnonce" || e.target.dataset.field === "pieces")) render();
});
document.addEventListener("change", e => { if (e.target.dataset.draft && ui.transfert) ui.transfert[e.target.dataset.draft] = e.target.value; });
function applyFilter(el) {
  const [page, key] = el.dataset.filter.split(".");
  ui[page][key] = el.value;
  render();
}
/* ---------- Scan automatique ----------
   Une douchette tape tout le numéro en quelques millisecondes : dès que la
   rafale s'arrête, le champ est enregistré sans attendre la touche Entrée.
   Une saisie au clavier (plus lente) attend toujours Entrée, pour ne jamais
   enregistrer un numéro à moitié tapé.                                      */
const SCAN = { dernier: 0, ecarts: [], minuteur: null, RAFALE_MS: 50, PAUSE_MS: 120 };
function envoyerScan(el) {
  if (!document.body.contains(el) || el.value.trim().length < 4 || !el.form) return;
  el.form.requestSubmit();
}
document.addEventListener("input", e => {
  const el = e.target;
  if (!el.classList?.contains("scan-input")) return;
  const maintenant = performance.now();
  const ecart = maintenant - SCAN.dernier; SCAN.dernier = maintenant;
  clearTimeout(SCAN.minuteur);
  // Numéro collé d'un coup : enregistré tout de suite
  if (e.inputType === "insertFromPaste") { if (!/\s/.test(el.value.trim())) envoyerScan(el); return; }
  if (el.value.length <= 1) { SCAN.ecarts = []; return; }
  SCAN.ecarts.push(ecart);
  const recents = SCAN.ecarts.slice(-6);
  const douchette = recents.length >= 3 && recents.reduce((a, b) => a + b, 0) / recents.length < SCAN.RAFALE_MS;
  if (douchette) SCAN.minuteur = setTimeout(() => envoyerScan(el), SCAN.PAUSE_MS);
});
document.addEventListener("submit", e => {
  clearTimeout(SCAN.minuteur); SCAN.ecarts = [];
  const form = e.target.closest("[data-form]");
  if (form && FORMS[form.dataset.form]) { e.preventDefault(); FORMS[form.dataset.form](form); }
});

document.body.classList.toggle("embedded", EMBED);
render();
