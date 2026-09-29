/* =========================================================
   WELJ EXPRESS MANAGER — application principale
   Routeur par hash (#/page/id), rendu par chaînes HTML, et un
   seul gestionnaire d'événements délégué (data-act / data-form).
========================================================= */
import * as store from "./store.js";
import {
  STATUTS, statut, nextStatuts, STATUTS_MANIFESTE, statutManifeste, MANIFESTE_TO_COLIS, METHODES_PAIEMENT, methode,
  CATEGORIES, calculerFacture, poidsVolumetrique, round, money, htg, num, fdate, fdatetime,
  numeroTracking, numeroManifeste, codeClient, numeroRecu, barcodeSvg, messageStatut, waLink,
} from "./logic.js";
import { esc, $, $$, openModal, closeModal, confirmBox, toast, formData, opt, printHtml, downloadCsv, download } from "./ui.js";

/* ---------- Rôles & navigation ---------- */
const ROLES = {
  admin:    { label: "Administrateur",      pages: ["dashboard", "reception", "colis", "manifestes", "comptoir", "clients", "caisse", "suivi", "rapports", "parametres"] },
  entrepot: { label: "Agent entrepôt Miami", pages: ["dashboard", "reception", "colis", "manifestes", "clients", "suivi"] },
  comptoir: { label: "Agent comptoir Haïti", pages: ["dashboard", "colis", "comptoir", "clients", "caisse", "suivi"] },
  livreur:  { label: "Livreur",             pages: ["comptoir", "suivi"] },
};
const NAV = [
  { id: "dashboard",  label: "Tableau de bord",      ic: "▦" },
  { id: "reception",  label: "Réception entrepôt",   ic: "⇲" },
  { id: "colis",      label: "Colis",                ic: "▣" },
  { id: "manifestes", label: "Manifestes / Envois",  ic: "✈" },
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

const badge = id => { const s = statut(id); return `<span class="badge tone-${s.tone}">${esc(s.label)}</span>`; };
const badgeM = id => { const s = statutManifeste(id); return `<span class="badge tone-${s.tone}">${esc(s.label)}</span>`; };
const clientLabel = c => c ? `${c.code} — ${c.nom}` : "—";

function log(action, details) {
  db.journal.unshift({ id: store.uid(), date: store.nowIso(), user: me().id, action, details });
  db.journal.length = Math.min(db.journal.length, 500);
}
function addEvent(c, st, note = "", lieu) {
  c.statut = st;
  c.events.push({ date: store.nowIso(), statut: st, lieu: lieu || (["recu", "consolide", "transit"].includes(st) ? "Fort Lauderdale" : branch(c.destination)?.ville || ""), note, user: me().id });
}

/* ---------- État d'interface (filtres par page) ---------- */
const ui = {
  colis: { q: "", statut: "", dest: "" },
  clients: { q: "" },
  manifestes: { statut: "" },
  comptoir: { tab: "pret", branche: "" },
  caisse: { du: dayKey(), au: dayKey() },
  rapports: { mois: monthKey(new Date()) },
  suivi: { q: "" },
  reception: { clientId: "", clear: false },
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
window.addEventListener("hashchange", () => { ui.navOpen = false; render(); window.scrollTo(0, 0); });
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
      <div class="brand-mark" aria-hidden="true">W</div>
      <div><div class="brand-name">Manager Logistique</div><div class="brand-sub">WELJ Express Services</div></div>
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

  // Encaissements par semaine (8 semaines)
  const weeks = [];
  for (let w = 7; w >= 0; w--) {
    const end = Date.now() - w * 7 * 86400000, start = end - 7 * 86400000;
    const v = db.paiements.filter(p => { const t = new Date(p.date).getTime(); return t > start && t <= end; }).reduce((s, p) => s + p.montant, 0);
    weeks.push({ label: w === 0 ? "Cette sem." : `S-${w}`, value: round(v) });
  }
  const actifs = db.manifestes.filter(m => m.statut !== "arrive").sort((a, b) => a.eta.localeCompare(b.eta));

  return `
  ${topbar("Tableau de bord", `${esc(S().entreprise.nom)} — vue d'ensemble de la chaîne Miami → Haïti`,
    can("reception") ? `<a class="btn btn-primary" href="#/reception">+ Réceptionner un colis</a>` : "")}
  <div class="kpi-row">
    ${kpi("À l'entrepôt Miami", entrepot.length, `${num(entrepot.reduce((s, c) => s + +c.poids, 0))} lb à expédier`)}
    ${kpi("En route / douane", route.length, `${db.manifestes.filter(m => ["transit", "douane"].includes(m.statut)).length} manifeste(s)`)}
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
        <td class="num">${db.colis.filter(c => c.manifesteId === m.id).length}</td><td>${fdate(m.eta)}</td><td>${badgeM(m.statut)}</td></tr>`).join("")}
      </tbody></table>` : empty("Aucun manifeste actif.")}
    </section>
    <section class="panel">
      <h3>Alertes</h3>
      ${exceptions.length || stockage.length ? `<ul class="alerts">
        ${exceptions.map(c => `<li class="alert bad" data-href="colis/${c.id}"><b>Exception</b> ${esc(c.tracking)} — ${esc(c.notes || "à vérifier")}</li>`).join("")}
        ${stockage.map(c => `<li class="alert warn" data-href="colis/${c.id}"><b>Stockage</b> ${esc(c.tracking)} prêt depuis ${Math.floor(daysAgo(lastEventDate(c)))} jours — ${esc(clientOf(c.clientId)?.nom || "")}</li>`).join("")}
      </ul>` : empty("Aucune alerte. Tout roule !")}
    </section>
  </div>`;
};

/* ---------- Réception entrepôt (Warehouse Receipt) ---------- */
VIEWS.reception = () => {
  const today = db.colis.filter(c => daysAgo(c.createdAt) < 1).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
  ${topbar("Réception entrepôt", "Enregistrer un colis arrivé à l'entrepôt de Fort Lauderdale (warehouse receipt)")}
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
          <td class="mono">${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "")}</td><td class="num">${num(c.poids)} lb</td></tr>`).join("")}</tbody></table>` : empty("Aucun colis reçu aujourd'hui.")}
      </section>
    </aside>
  </div>`;
};
VIEW_MOUNT.reception = () => {
  const form = $('[data-form="reception"]');
  const upd = () => { $("#devis").innerHTML = devisHtml(readColisForm(form)); };
  form.addEventListener("input", upd); form.addEventListener("change", upd); upd();
};

function colisFields(c = {}) {
  const S_ = S();
  return `
  <div class="field"><label>Client *</label>
    <div class="row-inline">
      <input name="clientRef" list="clients-list" required placeholder="Code ou nom du client (ex. WELJ-0001)" value="${esc(c.clientId ? clientLabel(clientOf(c.clientId)) : "")}">
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
    <div class="field"><label>Destination</label><select name="destination">${S_.succursales.filter(b => b.type === "destination").map(b => opt(b.id, b.nom, b.id === c.destination)).join("")}</select></div>
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
    <input class="search" type="search" placeholder="Rechercher : n° WELJ, n° fournisseur, client, contenu…" data-filter="colis.q" value="${esc(f.q)}">
    <select data-filter="colis.statut">${opt("", "Tous les statuts")}${STATUTS.map(s => opt(s.id, s.label, s.id === f.statut)).join("")}</select>
    <select data-filter="colis.dest">${opt("", "Toutes destinations")}${S().succursales.filter(b => b.type === "destination").map(b => opt(b.id, b.nom, b.id === f.dest)).join("")}</select>
  </div>
  ${colisTable(list)}`;
};
function colisTable(list, { select = false, removable = false } = {}) {
  if (!list.length) return empty("Aucun colis.");
  return `<div class="table-wrap"><table class="tbl">
    <thead><tr>${select ? `<th><input type="checkbox" data-act-change="select-all" aria-label="Tout sélectionner"></th>` : ""}<th>N° WELJ</th><th>Client</th><th>Contenu</th><th class="r">Poids</th><th>Service</th><th>Dest.</th><th>Statut</th><th class="r">Solde</th><th>Reçu le</th>${removable ? "<th></th>" : ""}</tr></thead>
    <tbody>${list.map(c => { const sol = soldeColis(c); return `<tr class="${select ? "" : "click"}" ${select ? "" : `data-href="colis/${c.id}"`}>
      ${select ? `<td><input type="checkbox" name="sel" value="${c.id}" aria-label="Sélectionner ${esc(c.tracking)}"></td>` : ""}
      <td class="mono">${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "—")}</td><td>${esc(c.description)}</td>
      <td class="num r">${num(c.poids)} lb</td><td>${esc(serviceOf(c.service)?.nom || c.service)}</td><td>${esc(c.destination)}</td>
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
  return `
  ${topbar(`Colis <span class="mono">${esc(c.tracking)}</span>`, `${badge(c.statut)} &nbsp; ${esc(c.description)} — ${esc(cl?.nom || "")}`, `
    <a class="btn" href="#/colis">← Liste</a>
    <button class="btn" data-act="print-label" data-id="${c.id}">Étiquette</button>
    <button class="btn" data-act="print-invoice" data-id="${c.id}">Facture</button>
    <button class="btn" data-act="notify" data-id="${c.id}">Notifier le client</button>
    ${nexts.length ? `<button class="btn btn-primary" data-act="change-status" data-id="${c.id}">Changer le statut</button>` : ""}`)}
  <div class="barcode-box">${barcodeSvg(c.tracking, { height: 44, narrow: 1.6 })}</div>
  <div class="grid-2">
    <section class="panel">
      <div class="panel-head"><h3>Détails</h3>${c.statut === "recu" || isAdmin() ? `<button class="btn btn-sm" data-act="edit-colis" data-id="${c.id}">Modifier</button>` : ""}</div>
      <dl class="dl">
        <dt>Client</dt><dd>${cl ? `<a href="#/clients/${cl.id}">${esc(clientLabel(cl))}</a><br><span class="muted small">${esc(cl.telephone)}</span>` : "—"}</dd>
        <dt>N° fournisseur</dt><dd class="mono">${esc(c.trackingFournisseur || "—")}</dd>
        <dt>Contenu</dt><dd>${esc(c.description)} <span class="muted">(${esc(c.categorie)})</span></dd>
        <dt>Pièces / poids</dt><dd>${c.pieces} pièce(s) — ${num(c.poids)} lb ${c.longueur ? `— ${c.longueur}×${c.largeur}×${c.hauteur} po (vol. ${num(poidsVolumetrique(c, S().diviseurVolumetrique))} lb)` : ""}</dd>
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
  const list = db.manifestes.filter(m => !ui.manifestes.statut || m.statut === ui.manifestes.statut).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
  ${topbar("Manifestes / Envois", "Consolidation des colis par vol (AWB) ou conteneur (BL)", can("reception") || isAdmin() ? `<button class="btn btn-primary" data-act="new-manifeste">+ Nouveau manifeste</button>` : "")}
  <div class="filters"><select data-filter="manifestes.statut">${opt("", "Tous les statuts")}${STATUTS_MANIFESTE.map(s => opt(s.id, s.label, s.id === ui.manifestes.statut)).join("")}</select></div>
  ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Mode</th><th>Transporteur</th><th>Référence</th><th>Trajet</th><th class="r">Colis</th><th class="r">Poids</th><th>Départ</th><th>ETA</th><th>Statut</th></tr></thead><tbody>
    ${list.map(m => { const cs = db.colis.filter(c => c.manifesteId === m.id); return `<tr class="click" data-href="manifestes/${m.id}">
      <td class="mono">${esc(m.numero)}</td><td>${m.mode === "mer" ? "Maritime" : "Aérien"}</td><td>${esc(m.transporteur)}</td><td class="mono">${esc(m.reference)}</td>
      <td>${esc(m.origine)} → ${esc(m.destination)}</td><td class="num r">${cs.length}</td><td class="num r">${num(cs.reduce((s, c) => s + +c.poids, 0))} lb</td>
      <td>${fdate(m.dateDepart)}</td><td>${fdate(m.eta)}</td><td>${badgeM(m.statut)}</td></tr>`; }).join("")}
  </tbody></table></div>` : empty("Aucun manifeste.")}`;
};
function manifesteDetail(id) {
  const m = manifesteOf(id);
  if (!m) return topbar("Manifeste introuvable") + empty(`<a href="#/manifestes">← Retour</a>`);
  const cs = db.colis.filter(c => c.manifesteId === m.id);
  const ouvert = m.statut === "ouvert";
  const dispo = db.colis.filter(c => c.statut === "recu" && !c.manifesteId && (serviceOf(c.service)?.mode || "air") === m.mode && c.destination === m.destination);
  const autres = db.colis.filter(c => c.statut === "recu" && !c.manifesteId && (serviceOf(c.service)?.mode || "air") === m.mode && c.destination !== m.destination);
  const idx = STATUTS_MANIFESTE.findIndex(s => s.id === m.statut);
  const next = STATUTS_MANIFESTE[idx + 1];
  return `
  ${topbar(`Manifeste <span class="mono">${esc(m.numero)}</span>`, `${badgeM(m.statut)} &nbsp; ${m.mode === "mer" ? "Maritime" : "Aérien"} · ${esc(m.transporteur)} · ${esc(m.reference)}`, `
    <a class="btn" href="#/manifestes">← Liste</a>
    <button class="btn" data-act="edit-manifeste" data-id="${m.id}">Modifier</button>
    <button class="btn" data-act="print-manifeste" data-id="${m.id}">Imprimer le manifeste</button>
    ${next ? `<button class="btn btn-primary" data-act="manif-advance" data-id="${m.id}" ${!cs.length ? "disabled" : ""}>Passer à « ${esc(next.label)} »</button>` : ""}`)}
  <div class="kpi-row">
    ${kpi("Colis", cs.length, `${cs.reduce((s, c) => s + +c.pieces, 0)} pièce(s)`)}
    ${kpi("Poids total", num(cs.reduce((s, c) => s + +c.poids, 0)) + " lb")}
    ${kpi("Valeur déclarée", money(cs.reduce((s, c) => s + +c.valeur, 0)))}
    ${kpi("Fret facturé", money(cs.reduce((s, c) => s + c.facture.total, 0)), "", "good")}
    ${kpi("Départ → ETA", fdate(m.dateDepart), "ETA " + fdate(m.eta))}
  </div>
  <p class="muted small">Changer le statut du manifeste met à jour <b>tous ses colis</b> en une seule opération (et ajoute l'étape à leur historique de suivi).</p>
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
      <input name="code" placeholder="Scanner ou saisir un n° WELJ (douchette code-barres)" aria-label="Numéro de colis" autofocus>
      <button class="btn btn-primary">Ouvrir</button>
    </form>
    ${u.role !== "livreur" ? `<select data-filter="comptoir.branche" aria-label="Succursale">${S().succursales.filter(b => b.type === "destination").map(b => opt(b.id, b.nom, b.id === br)).join("")}</select>` : ""}
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
      <div class="address-box" id="us-address">${esc(c.nom)}<br><b>${esc(c.code)}</b><br>${esc(E.adresseUS).replace(", Fort", "<br>Fort")}<br>Tél. ${esc(E.telephoneUS)}</div>
      <button class="btn btn-sm" data-act="copy-address" data-id="${c.id}">Copier l'adresse</button>
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
      <div class="field"><label>Succursale de retrait</label><select name="succursale">${S().succursales.filter(b => b.type === "destination").map(b => opt(b.id, b.nom, b.id === c.succursale)).join("")}</select></div>
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
  ${topbar("Suivi de colis", "Ce que voit le client : saisissez un n° WELJ ou le n° de suivi du fournisseur")}
  <form class="panel track-form" data-form="suivi"><input name="q" value="${esc(ui.suivi.q)}" placeholder="Ex. ${esc(db.colis[0]?.tracking || "WX2609000001")}" aria-label="Numéro de suivi"><button class="btn btn-primary">Suivre</button></form>
  ${q && !c ? empty("Aucun colis ne correspond à ce numéro.") : ""}
  ${c ? `<section class="panel track">
    <div class="row-between"><div><div class="muted small">Colis</div><div class="big mono">${esc(c.tracking)}</div></div>${badge(c.statut)}</div>
    <div class="progress">${steps.map(s => `<div class="step ${STATUTS.findIndex(x => x.id === s) <= idx && c.statut !== "probleme" ? "done" : ""}"><span></span>${esc(statut(s).short)}</div>`).join("")}</div>
    <div class="facts"><span>Destination <b>${esc(branch(c.destination)?.nom || "")}</b></span><span>Service <b>${esc(serviceOf(c.service)?.nom || "")}</b></span><span>Poids <b>${num(c.poids)} lb</b></span>
    ${manifesteOf(c.manifesteId) ? `<span>Arrivée prévue <b>${fdate(manifesteOf(c.manifesteId).eta)}</b></span>` : ""}</div>
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
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Nom</th><th>Ville</th><th>Téléphone</th><th>Rôle</th></tr></thead><tbody>
      ${s.succursales.map((b, i) => `<tr><td class="mono">${esc(b.id)}</td><td><input name="b.${i}.nom" value="${esc(b.nom)}"></td><td><input name="b.${i}.ville" value="${esc(b.ville)}"></td><td><input name="b.${i}.telephone" value="${esc(b.telephone || "")}"></td><td>${b.type === "origine" ? "Entrepôt d'origine" : "Destination"}</td></tr>`).join("")}
    </tbody></table></div>
    <div class="form-actions"><button type="button" class="btn" data-act="add-branch">+ Succursale</button><button class="btn btn-primary">Enregistrer les paramètres</button></div>
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
    navigator.clipboard?.writeText(`${c.nom}\n${c.code}\n${E.adresseUS}\nTél. ${E.telephoneUS}`).then(() => toast("Adresse copiée"), () => toast("Copie impossible", "bad"));
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
  "delete-colis": el => {
    const c = colisOf(el.dataset.id);
    if (!confirmBox(`Supprimer définitivement le colis ${c.tracking} ?`)) return;
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
        <button type="button" class="btn btn-primary" data-act="notify-send" data-canal="WhatsApp" data-id="${c.id}" ${cl?.telephone ? "" : "disabled"}>Ouvrir WhatsApp</button>
      </div></form>`);
  },
  "notify-send": el => {
    const c = colisOf(el.dataset.id); const cl = clientOf(c.clientId);
    const message = $("#modal-bg textarea[name=message]").value;
    if (el.dataset.canal === "WhatsApp") window.open(waLink(cl.telephone, message), "_blank", "noopener");
    else navigator.clipboard?.writeText(message);
    store.mutate(d => { d.notifications.unshift({ id: store.uid(), date: store.nowIso(), colisId: c.id, clientId: c.clientId, canal: el.dataset.canal, message }); });
    closeModal(); toast(el.dataset.canal === "WhatsApp" ? "WhatsApp ouvert" : "Message copié");
  },

  "new-manifeste": () => openModal(manifesteForm({ mode: "air", transporteur: "Amerijet", origine: "FLL", destination: "PAP", dateDepart: dayKey(), eta: dayKey(Date.now() + 3 * 86400000) })),
  "edit-manifeste": el => openModal(manifesteForm(manifesteOf(el.dataset.id))),
  "manif-remove": (el, e) => {
    e.stopPropagation();
    const c = colisOf(el.dataset.id);
    store.mutate(() => { c.manifesteId = null; if (c.statut === "consolide") addEvent(c, "recu", "Retiré du manifeste"); log("Manifeste", `${c.tracking} retiré`); });
  },
  "manif-advance": el => {
    const m = manifesteOf(el.dataset.id);
    const next = STATUTS_MANIFESTE[STATUTS_MANIFESTE.findIndex(s => s.id === m.statut) + 1];
    const cs = db.colis.filter(c => c.manifesteId === m.id);
    if (!next || !confirmBox(`Passer le manifeste ${m.numero} à « ${next.label} » ?\n${cs.length} colis seront mis à jour.`)) return;
    store.mutate(() => {
      m.statut = next.id;
      if (next.id === "transit" && !m.dateDepart) m.dateDepart = store.nowIso();
      const st = MANIFESTE_TO_COLIS[next.id];
      cs.forEach(c => { if (st && c.statut !== "probleme" && c.statut !== st) addEvent(c, st, `Manifeste ${m.numero}`); });
      log("Manifeste", `${m.numero} → ${next.label} (${cs.length} colis)`);
    });
    toast(`Manifeste ${m.numero} : ${next.label}`);
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
  "export-colis": () => exportColis(db.colis, "welj-colis.csv"),
  "export-colis-mois": () => exportColis(db.colis.filter(c => monthKey(c.createdAt) === ui.rapports.mois), `welj-colis-${ui.rapports.mois}.csv`),
  "export-clients": () => downloadCsv("welj-clients.csv", [["Code", "Nom", "Type", "Téléphone", "Email", "Succursale", "Adresse", "Solde USD"],
    ...db.clients.map(c => [c.code, c.nom, c.type, c.telephone, c.email, c.succursale, c.adresse, soldeClient(c.id)])]),
  "export-paiements": () => downloadCsv("welj-paiements.csv", [["Reçu", "Date", "Client", "Colis", "Méthode", "Montant USD", "Montant HTG", "Référence"],
    ...db.paiements.map(p => [p.numero, p.date, clientOf(p.clientId)?.nom, colisOf(p.colisId)?.tracking, methode(p.methode), p.montant, p.montantHTG || "", p.reference])]),

  "add-branch": () => {
    const code = (prompt("Code de la succursale (3 lettres, ex. GON pour Gonaïves)") || "").trim().toUpperCase();
    if (!code) return;
    if (!/^[A-Z]{2,5}$/.test(code) || branch(code)) { toast("Code invalide ou déjà utilisé", "bad"); return; }
    const nom = prompt("Nom de la succursale", "Succursale ") || code;
    store.mutate(d => { d.settings.succursales.push({ id: code, nom, ville: nom.replace(/^Succursale\s*/i, ""), type: "destination", telephone: "" }); log("Paramètres", `Succursale ${code} ajoutée`); });
  },
  "new-user": () => openModal(userForm({ role: "comptoir", succursale: "PAP" })),
  "edit-user": el => openModal(userForm(db.users.find(u => u.id === el.dataset.id))),
  backup: () => download(`welj-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`, store.exportJson()),
  "reset-demo": () => { if (confirmBox("Remplacer toutes les données par les données de démonstration ?")) { store.resetDemo(); toast("Données de démo rechargées"); } },
  wipe: () => { if (confirmBox("Effacer TOUS les clients, colis, manifestes et paiements ? (les paramètres sont réinitialisés)")) { store.wipeAll(); toast("Base vidée"); } },
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
      <div class="field"><label>Transporteur</label><input name="transporteur" value="${esc(m.transporteur || "")}" list="carriers"><datalist id="carriers">${["Amerijet", "Sunrise Airways", "Crowley", "Seaboard Marine", "Tropical Shipping", "DHL"].map(x => `<option value="${x}">`).join("")}</datalist></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Référence (AWB / BL / n° conteneur)</label><input name="reference" value="${esc(m.reference || "")}"></div>
      <div class="field"><label>Destination</label><select name="destination">${S().succursales.filter(b => b.type === "destination").map(b => opt(b.id, b.nom, b.id === m.destination)).join("")}</select></div>
    </div>
    <div class="form-grid">
      <div class="field"><label>Date de départ</label><input type="date" name="dateDepart" value="${esc(m.dateDepart ? dayKey(m.dateDepart) : "")}"></div>
      <div class="field"><label>Arrivée prévue (ETA)</label><input type="date" name="eta" value="${esc(m.eta ? dayKey(m.eta) : "")}"></div>
    </div>
    <div class="field"><label>Notes</label><input name="notes" value="${esc(m.notes || "")}"></div>
    <div class="modal-actions"><button type="button" class="btn" data-act="close">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
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
ACTIONS["delete-user"] = el => {
  if (!confirmBox("Supprimer cet utilisateur ?")) return;
  store.mutate(d => { d.users = d.users.filter(u => u.id !== el.dataset.id); });
  closeModal();
};

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
    if (d.imprimer) printLabel(c);
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
    d.dateDepart = toIso(d.dateDepart); d.eta = toIso(d.eta);
    let m;
    store.mutate(db_ => {
      if (id) { m = manifesteOf(id); Object.assign(m, { transporteur: d.transporteur, reference: d.reference, destination: d.destination, dateDepart: d.dateDepart, eta: d.eta, notes: d.notes }); return; }
      const seq = store.nextSeq("manifeste");
      m = { id: store.uid(), numero: numeroManifeste(seq, d.mode), mode: d.mode, transporteur: d.transporteur, reference: d.reference, origine: "FLL", destination: d.destination,
        dateDepart: d.dateDepart, eta: d.eta, statut: "ouvert", notes: d.notes, createdAt: store.nowIso() };
      db_.manifestes.push(m); log("Nouveau manifeste", m.numero);
    });
    closeModal(); go("manifestes", m.id);
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
  return `<div class="doc-head"><div><div class="doc-brand">${esc(E.nom)}</div><div class="small">${esc(E.adresse)}<br>${esc(E.telephone)} · ${esc(E.email)} · ${esc(E.site)}</div></div></div>`;
}
function printLabel(c) {
  const cl = clientOf(c.clientId); const b = branch(c.destination);
  printHtml(`<style>@page{size:4in 6in;margin:0.15in}</style><div class="label">
    <div class="label-top"><b>${esc(S().entreprise.nom)}</b><span>${esc(serviceOf(c.service)?.nom || "")}</span></div>
    <div class="label-dest">${esc(c.destination)}</div>
    <div class="small">${esc(b?.nom || "")}</div>
    <div class="label-client">${esc(cl?.nom || "")}<br><span class="mono">${esc(cl?.code || "")}</span> · ${esc(cl?.telephone || "")}</div>
    <div class="label-bc">${barcodeSvg(c.tracking, { height: 70, narrow: 2 })}<div class="mono big">${esc(c.tracking)}</div></div>
    <div class="label-grid"><span>Poids<b>${num(c.poids)} lb</b></span><span>Pièces<b>${c.pieces}</b></span><span>Reçu<b>${fdate(c.createdAt)}</b></span></div>
    <div class="small">${esc(c.description)}${c.livraisonDomicile ? " — LIVRAISON DOMICILE" : ""}</div>
  </div>`, { format: "label" });
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
    <div><b>Trajet</b><br>${esc(branch(m.origine)?.ville || m.origine)} → ${esc(branch(m.destination)?.ville || m.destination)}</div><div><b>Départ / ETA</b><br>${fdate(m.dateDepart)} / ${fdate(m.eta)}</div></div>
    <table class="doc-table"><thead><tr><th>#</th><th>N° WELJ</th><th>Destinataire</th><th>Contenu</th><th class="r">Pcs</th><th class="r">Poids (lb)</th><th class="r">Valeur ($)</th></tr></thead><tbody>
    ${cs.map((c, i) => `<tr><td>${i + 1}</td><td>${esc(c.tracking)}</td><td>${esc(clientOf(c.clientId)?.nom || "")}</td><td>${esc(c.description)}</td><td class="r">${c.pieces}</td><td class="r">${num(c.poids)}</td><td class="r">${num(c.valeur, 0)}</td></tr>`).join("")}
    <tr class="total"><td colspan="4">Total : ${cs.length} colis</td><td class="r">${cs.reduce((s, c) => s + +c.pieces, 0)}</td><td class="r">${num(cs.reduce((s, c) => s + +c.poids, 0))}</td><td class="r">${num(cs.reduce((s, c) => s + +c.valeur, 0), 0)}</td></tr>
    </tbody></table>
    <div class="doc-cols sign"><div>Préparé par : ____________________</div><div>Reçu par : ____________________</div></div>`);
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
  downloadCsv(filename, [["N° WELJ", "N° fournisseur", "Date réception", "Client", "Code client", "Contenu", "Catégorie", "Pièces", "Poids lb", "Valeur $", "Service", "Destination", "Statut", "Manifeste", "Facturé $", "Payé $", "Solde $"],
    ...list.map(c => [c.tracking, c.trackingFournisseur, c.createdAt.slice(0, 10), clientOf(c.clientId)?.nom, clientOf(c.clientId)?.code, c.description, c.categorie, c.pieces, c.poids, c.valeur,
      serviceOf(c.service)?.nom, c.destination, statut(c.statut).label, manifesteOf(c.manifesteId)?.numero || "", c.facture.total, payeColis(c), soldeColis(c)])]);
}

/* =========================================================
   DÉLÉGATION D'ÉVÉNEMENTS
========================================================= */
document.addEventListener("click", e => {
  const act = e.target.closest("[data-act]");
  if (act && ACTIONS[act.dataset.act] && !act.disabled) { e.preventDefault(); ACTIONS[act.dataset.act](act, e); return; }
  const row = e.target.closest("[data-href]");
  if (row && !e.target.closest("a,button,input,select,label")) go(...row.dataset.href.split("/"));
});
document.addEventListener("change", e => {
  const el = e.target.closest("[data-act-change]");
  if (el && CHANGE_ACTIONS[el.dataset.actChange]) CHANGE_ACTIONS[el.dataset.actChange](el);
  if (e.target.dataset.filter && e.target.tagName !== "INPUT") applyFilter(e.target);
  if (e.target.dataset.filter && ["date", "month"].includes(e.target.type)) applyFilter(e.target);
});
document.addEventListener("input", e => { if (e.target.dataset.filter && e.target.type === "search") applyFilter(e.target); });
function applyFilter(el) {
  const [page, key] = el.dataset.filter.split(".");
  ui[page][key] = el.value;
  render();
}
document.addEventListener("submit", e => {
  const form = e.target.closest("[data-form]");
  if (form && FORMS[form.dataset.form]) { e.preventDefault(); FORMS[form.dataset.form](form); }
});

render();
