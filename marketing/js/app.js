import {
  load, save, defaultData, uid, esc, nl2br, num, fmt, todayISO, addDays, addMonths,
  dateFr, dateCourte, totauxFacture, budgetActions, totalHonoraires,
} from './store.js';
import { SECTEURS, CANAUX, MOTIFS, suggestions } from './secteurs.js';
import { PLATEFORMES, CHAMPS_LABELS, SUPPORTS, DECOUVERTE, normaliserFiche, completude, liensRecherche, diagnostic, appliquerFiche, texteContexte, texteWebIA, ageRechercheWeb } from './fiche.js';
import { histogramme } from './graphiques.js';
import { sync } from './sync.js';
import { MODELES, appliquerModele } from './modeles.js';
import { STATUTS_PUB, nouvellePublication, grilleMois, moisDecale, libelleMois, abregeCanal, FORMATS, heureConseillee, programme, lundi, ajouterJours } from './calendrier.js';
import { FREQUENCES, dateSuivante, genererRecurrentes, relancesAFaire } from './facturation.js';
import { rechercherEntreprise, fusionnerResultat, genererSection, genererLibre, schema } from './ia.js';
import { normaliserPlan, scorePlan, resultats, recommandations, actionEnRetard, STATUTS_ACTION } from './analyse.js';

const S = schema; // constructeurs de schémas JSON pour les réponses de l'IA
let data = load();
data.plans.forEach(normaliserPlan);
data.clients.forEach(normaliserFiche);
// Filtres des listes (conservés pendant la session).
const filtres = { plans: { q: '', statut: '' }, factures: { q: '', statut: '' }, actions: { q: '', statut: 'ouvertes', plan: '' } };
const contient = (txt, q) => !q || String(txt).toLowerCase().includes(q.toLowerCase());
const $view = document.getElementById('view');
const $modal = document.getElementById('modal');

// ---------- Persistance ----------
let saveTimer;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = () => { if (!save(data)) toast('Impossible d\'enregistrer : stockage du navigateur plein (logo trop lourd ?).', 'err'); sync.planifierEnvoi(); };
  now ? run() : (saveTimer = setTimeout(run, 300));
}

// ---------- Helpers ----------
const money = n => `${fmt(n)} ${esc(data.settings.devise || 'HTG')}`;
const clientById = id => data.clients.find(c => c.id === id);
const planById = id => data.plans.find(p => p.id === id);
const factureById = id => data.factures.find(f => f.id === id);
const secteurLabel = k => SECTEURS[k]?.label || 'Autre secteur';
const motifLabel = p => p.motif === 'autre' ? (p.motifDetail || 'Autre').split('\n')[0] : (MOTIFS[p.motif] || '');
const motifOptions = sel => `<option value="">— Choisir la raison du plan —</option>${Object.entries(MOTIFS).map(([k, l]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}`;

const STATUTS_PLAN = { brouillon: 'Brouillon', presente: 'Présenté', accepte: 'Accepté', refuse: 'Refusé' };
const STATUTS_FACT = { brouillon: 'Brouillon', envoyee: 'Envoyée', partielle: 'Payée partiellement', payee: 'Payée', annulee: 'Annulée' };
const badge = (statut, labels) => `<span class="badge st-${statut}">${labels[statut] || statut}</span>`;

function toast(msg, type = 'ok') {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function openModal(html, wide = false) {
  $modal.innerHTML = `<div class="modal-bg" data-action="close-modal-bg"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  $modal.querySelector('input,select,textarea')?.focus();
}
const closeModal = () => { $modal.innerHTML = ''; };

// Confirmation affichée dans l'application : window.confirm() est bloqué
// dans certains contextes (aperçus intégrés, iframes protégées).
let pendingConfirm = null;
function askConfirm(msg, onYes, label = 'Confirmer') {
  openModal(`<h2>Confirmation</h2><p>${esc(msg)}</p>
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button>
    <button type="button" class="btn btn-primary" data-action="confirm-yes">${esc(label)}</button></div>`);
  pendingConfirm = onYes;
  $modal.querySelector('[data-action="confirm-yes"]').focus();
}

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o = o?.[ks[i]]; if (o == null) return; }
  o[ks[ks.length - 1]] = val;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

const go = hash => { location.hash = hash; };

// ---------- Modèle de plan ----------
function nouveauPlan({ clientId, titre, motif = '', motifDetail = '', debut, fin, budgetPrevu, prefill, modele = '' }) {
  const client = clientById(clientId);
  const p = {
    id: uid(), clientId, titre, statut: 'brouillon', creeLe: todayISO(), datePresentation: '',
    motif, motifDetail: String(motifDetail).trim(),
    debut, fin, budgetPrevu: num(budgetPrevu),
    resume: '', contexte: '', concurrents: '',
    swot: { forces: '', faiblesses: '', opportunites: '', menaces: '' },
    objectifs: [], cibles: [],
    positionnement: '', messageCle: '', slogan: '', ton: '',
    mix: { produit: '', prix: '', distribution: '', promotion: '' },
    actions: [], kpis: '', suivi: '', risques: '',
    honoraires: [
      { description: 'Élaboration de la stratégie et du plan marketing', qte: 1, pu: 0 },
      { description: 'Gestion et suivi des campagnes (par mois)', qte: 1, pu: 0 },
    ],
    notes: '',
  };
  normaliserPlan(p);
  if (prefill && client) appliquerSuggestions(p, client.secteur, false);
  // Le modèle de campagne remplace les objectifs et actions génériques du secteur.
  if (modele) appliquerModele(p, modele, true);
  if (prefill && client && completude(client) > 0) appliquerFiche(p, client, dureeMois(p));
  return p;
}

// Remplit les champs vides avec les suggestions du secteur (n'écrase rien).
function appliquerSuggestions(p, secteur, notify = true) {
  const s = suggestions(secteur);
  for (const k of ['forces', 'faiblesses', 'opportunites', 'menaces']) if (!p.swot[k]) p.swot[k] = s.swot[k];
  if (!p.objectifs.length) p.objectifs = s.objectifs.slice(0, 3).map(o => ({ ...o }));
  if (!p.cibles.length) p.cibles = s.cibles.map(c => ({ ...c }));
  if (!p.actions.length) p.actions = s.actions.map(a => ({ ...a, description: '', debut: p.debut, fin: p.fin, budget: 0, responsable: '' }));
  if (!p.positionnement) p.positionnement = s.positionnement;
  if (!p.kpis) p.kpis = s.kpis;
  if (!p.suivi) p.suivi = s.suivi;
  if (!p.risques) p.risques = s.risques;
  if (notify) toast('Suggestions ajoutées dans les champs vides.');
}

// ---------- Mise en page ----------
const NAV = [
  ['dashboard', '◧', 'Tableau de bord'],
  ['clients', '◉', 'Entreprises clientes'],
  ['plans', '✎', 'Plans marketing'],
  ['execution', '📋', 'À publier'],
  ['actions', '☑', 'Suivi des actions'],
  ['factures', '▤', 'Factures'],
  ['temps', '⏱', 'Temps & rentabilité'],
  ['parametres', '⚙', 'Paramètres'],
];

function renderShell(active) {
  const s = data.settings;
  document.getElementById('sidebar').innerHTML = `
    <div class="brand">
      ${s.logo ? `<img class="brand-logo" src="${esc(s.logo)}" alt="">` : '<div class="brand-logo ph">M</div>'}
      <div><div class="brand-name">${esc(s.nom)}</div><div class="brand-sub">Plans marketing & facturation</div></div>
    </div>
    <nav class="navlinks">
      ${NAV.map(([k, ic, l]) => `<a class="navlink ${active === k ? 'active' : ''}" href="#/${k}"><span class="ic">${ic}</span>${l}</a>`).join('')}
    </nav>
    ${data.chrono ? `<a class="chrono-badge" href="#/temps">⏱ Chrono en cours</a>` : ''}
    <div class="sidebar-foot">${(() => { const e = sync.etatSync(); return e.espace
      ? `<a href="#/parametres" class="sync-etat st-${e.statut}">☁ ${esc(e.espace.nom)}<br><span>${{ synchro: 'Synchronisé', envoi: 'Envoi en cours…', connexion: 'Connexion…', hors_ligne: 'Hors ligne : modifications gardées', erreur: 'Erreur de synchronisation' }[e.statut] || ''}</span></a>`
      : 'Données enregistrées dans ce navigateur.<br>Pensez à exporter une sauvegarde.'; })()}</div>`;
}

const topbar = (titre, sous, actions = '') => `
  <div class="topbar"><div><h1>${titre}</h1>${sous ? `<p>${sous}</p>` : ''}</div>
  <div class="topbar-actions no-print">${actions}</div></div>`;

// ---------- Vues ----------
function viewDashboard() {
  const facts = data.factures.filter(f => f.statut !== 'annulee' && f.statut !== 'brouillon');
  const encaisse = facts.reduce((s, f) => s + totauxFacture(f).paye, 0);
  const aEncaisser = facts.reduce((s, f) => s + totauxFacture(f).reste, 0);
  const enCours = data.plans.filter(p => p.statut === 'brouillon').length;
  const presentes = data.plans.filter(p => p.statut !== 'brouillon').length;
  const impayees = facts.filter(f => totauxFacture(f).reste > 0.005)
    .sort((a, b) => (a.echeance || '').localeCompare(b.echeance || ''));
  const recents = [...data.plans].sort((a, b) => (b.creeLe || '').localeCompare(a.creeLe || '')).slice(0, 6);
  const semaine = addDays(todayISO(), 7);
  const relances = relancesAFaire(data.factures);
  const pubsAVenir = data.plans.filter(p => p.statut !== 'refuse').flatMap(p => (p.publications || []).map(x => ({ x, p })))
    .filter(({ x }) => x.statut !== 'publie' && x.date >= todayISO() && x.date <= semaine).sort((a, b) => a.x.date.localeCompare(b.x.date));
  const aValider = data.factures.filter(f => f.recurrenteDe && f.statut === 'brouillon');
  const aSuivre = toutesActions().filter(({ a, p }) => a.statut !== 'termine' &&
    (actionEnRetard(a, p) || (a.statut === 'a_faire' && (a.debut || p.debut) <= semaine)));

  const vide = !data.clients.length && !data.plans.length;
  return topbar('Tableau de bord', 'Vue d\'ensemble de vos plans marketing et de votre facturation',
    `<button class="btn btn-primary" data-action="new-plan-for">+ Nouveau plan</button>`) + (vide ? `
    <div class="panel empty-start">
      <h3>Bienvenue 👋</h3>
      <p>Pour commencer : <b>1.</b> renseignez votre agence dans <a href="#/parametres">Paramètres</a> (nom, logo, devise, taxe),
      <b>2.</b> ajoutez une <a href="#/clients">entreprise cliente</a>, <b>3.</b> créez son plan marketing, présentez-le, puis générez la facture.</p>
      <button class="btn" data-action="demo">Charger un exemple pour découvrir l'application</button>
    </div>` : '') + `
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">Plans en préparation</div><div class="val">${enCours}</div><div class="sub">${data.clients.length} entreprise(s) cliente(s)</div></div>
      <div class="kpi"><div class="lbl">Plans présentés</div><div class="val">${presentes}</div><div class="sub">${data.plans.filter(p => p.statut === 'accepte').length} accepté(s)</div></div>
      <div class="kpi pos"><div class="lbl">Encaissé</div><div class="val num">${money(encaisse)}</div></div>
      <div class="kpi ${aEncaisser > 0 ? 'neg' : ''}"><div class="lbl">Reste à encaisser</div><div class="val num">${money(aEncaisser)}</div><div class="sub">${impayees.length} facture(s) ouverte(s)</div></div>
    </div>
    ${relances.length || aValider.length ? `<div class="grid-2">
      ${relances.length ? `<div class="panel"><h3>Relances à faire <span class="n">rappels de paiement du jour</span></h3><table><tbody>${relances.map(({ f, etape, jours }) => `<tr>
        <td><b>${esc(f.numero)}</b><div class="muted">${esc(clientById(f.clientId)?.nom || '')}</div></td>
        <td class="${etape === 'retard' ? 'txt-red' : 'muted'}">${etape === 'avant' ? `Échéance dans ${jours} j` : etape === 'jour' ? 'Échéance aujourd\'hui' : `En retard de ${-jours} j`}</td>
        <td class="r num">${money(totauxFacture(f).reste)}</td>
        <td class="r"><button class="btn btn-sm btn-gold" data-action="relance-dash" data-id="${f.id}">Relancer</button></td></tr>`).join('')}</tbody></table></div>` : ''}
      ${aValider.length ? `<div class="panel"><h3>Factures récurrentes à valider</h3><table><tbody>${aValider.map(f => `<tr class="rowlink" data-href="#/facture/${f.id}">
        <td><b>${esc(f.numero)}</b> ↻<div class="muted">${esc(f.objet)}</div></td><td>${esc(clientById(f.clientId)?.nom || '')}</td><td class="r num">${money(totauxFacture(f).total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>` : ''}
    ${pubsAVenir.length ? `<div class="panel"><h3>Publications des 7 prochains jours</h3><table><tbody>${pubsAVenir.slice(0, 10).map(({ x, p }) => `<tr class="rowlink" data-href="#/plan/${p.id}/calendrier">
      <td class="nowrap">${dateCourte(x.date)}</td><td><b>${esc(x.canal)}</b> — ${esc(x.titre || x.texte.slice(0, 50))}<div class="muted">${esc(clientById(p.clientId)?.nom || '')}</div></td>
      <td class="r"><span class="pub-chip pst-${x.statut}">${STATUTS_PUB[x.statut]}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${aSuivre.length ? `<div class="panel"><h3>Actions à suivre <span class="n">en retard ou à lancer cette semaine</span></h3>
      <table><tbody>${aSuivre.slice(0, 8).map(({ a, p }) => `<tr class="rowlink" data-href="#/actions">
        <td><b>${esc(a.canal)}</b> — ${esc(a.action)}<div class="muted">${esc(p.titre)} · ${esc(clientById(p.clientId)?.nom || '')}</div></td>
        <td class="nowrap ${actionEnRetard(a, p) ? 'txt-red' : 'muted'}">${actionEnRetard(a, p) ? 'En retard · fin ' + dateCourte(a.fin || p.fin) : 'Début ' + dateCourte(a.debut || p.debut)}</td>
        <td class="r">${badge(a.statut, STATUTS_ACTION)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="grid-2">
      <div class="panel"><h3>Plans récents</h3>
        ${recents.length ? `<table><tbody>${recents.map(p => `<tr class="rowlink" data-href="#/plan/${p.id}/infos">
          <td><b>${esc(p.titre)}</b><div class="muted">${esc(clientById(p.clientId)?.nom || '—')}</div></td>
          <td class="r">${badge(p.statut, STATUTS_PLAN)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Aucun plan pour l\'instant.</p>'}
      </div>
      <div class="panel"><h3>Factures à encaisser</h3>
        ${impayees.length ? `<table><tbody>${impayees.slice(0, 8).map(f => {
          const late = f.echeance && f.echeance < todayISO();
          return `<tr class="rowlink" data-href="#/facture/${f.id}">
          <td><b>${esc(f.numero)}</b><div class="muted">${esc(clientById(f.clientId)?.nom || '—')}</div></td>
          <td class="${late ? 'txt-red' : 'muted'}">${late ? 'En retard · ' : 'Échéance '}${dateCourte(f.echeance)}</td>
          <td class="r num"><b>${money(totauxFacture(f).reste)}</b></td></tr>`;
        }).join('')}</tbody></table>` : '<p class="muted">Aucune facture en attente de paiement.</p>'}
      </div>
    </div>`;
}

function viewClients() {
  const rows = data.clients.map(c => {
    const nbPlans = data.plans.filter(p => p.clientId === c.id).length;
    return `<tr>
      <td><a class="strong-link" href="#/client/${c.id}">${esc(c.nom)}</a><div class="muted">${esc(c.contact || '')}</div></td>
      <td>${esc(secteurLabel(c.secteur))}</td>
      <td><a href="#/client/${c.id}" class="fiche-link">${scoreBadge(completude(c))}</a></td>
      <td>${esc(c.telephone || '')}<div class="muted">${esc(c.email || '')}</div></td>
      <td class="c">${nbPlans}</td>
      <td class="r nowrap">
        <a class="btn btn-sm btn-gold" href="#/client/${c.id}">Fiche</a>
        <button class="btn btn-sm" data-action="new-plan-for" data-id="${c.id}">+ Plan</button>
        <button class="btn btn-sm" data-action="edit-client" data-id="${c.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-action="del-client" data-id="${c.id}">Supprimer</button>
      </td></tr>`;
  }).join('');
  return topbar('Entreprises clientes', 'Tout type d\'entreprise : commerce, restaurant, services, santé, ONG…',
    `<label class="btn">⇧ Importer une fiche<input type="file" accept="application/json,.json" data-action-change="import-fiche" hidden></label><button class="btn btn-primary" data-action="edit-client">+ Nouvelle entreprise</button>`) +
    (data.clients.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Entreprise</th><th>Secteur</th><th title="Fiche entreprise complétée">Fiche</th><th>Contact</th><th class="c">Plans</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<div class="panel muted">Aucune entreprise cliente. Ajoutez-en une pour créer son premier plan.</div>');
}

function modalClient(id) {
  const c = clientById(id) || { nom: '', secteur: 'commerce', taille: '', contact: '', telephone: '', email: '', adresse: '', siteWeb: '', nif: '' };
  openModal(`<h2>${id ? 'Modifier' : 'Nouvelle'} entreprise</h2>
    <form data-form="client" data-id="${id || ''}">
      <div class="form-grid">
        <label class="full">Nom de l'entreprise *<input name="nom" required value="${esc(c.nom)}"></label>
        <label>Secteur d'activité<select name="secteur">${Object.entries(SECTEURS).map(([k, s]) => `<option value="${k}" ${c.secteur === k ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label>
        <label>Taille<select name="taille">${['', 'Auto-entrepreneur', 'Petite entreprise (1-10)', 'PME (11-50)', 'Grande entreprise (50+)'].map(t => `<option ${c.taille === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Personne de contact<input name="contact" value="${esc(c.contact)}"></label>
        <label>Téléphone<input name="telephone" value="${esc(c.telephone)}"></label>
        <label>Email<input name="email" type="email" value="${esc(c.email)}"></label>
        <label>NIF / N° fiscal<input name="nif" value="${esc(c.nif)}"></label>
        <label class="full">Adresse<input name="adresse" value="${esc(c.adresse)}"></label>
        <label class="full">Site web / réseaux<input name="siteWeb" value="${esc(c.siteWeb)}"></label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Enregistrer</button></div>
    </form>`, true);
}

const barreFiltres = (liste, statuts, extra = '') => `<div class="filters no-print">
  <input type="search" placeholder="Rechercher…" data-filter="${liste}.q" value="${esc(filtres[liste].q)}">
  <select data-filter="${liste}.statut"><option value="">Tous les statuts</option>${Object.entries(statuts).map(([k, l]) => `<option value="${k}" ${filtres[liste].statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select>${extra}</div>`;

const scoreBadge = n => `<span class="score ${n >= 80 ? 'good' : n >= 50 ? 'mid' : 'low'}" title="Qualité du plan">${n} %</span>`;

// ---------- Fiche entreprise ----------
const TYPES_CONSTAT = { force: ['Force', 'ok'], faiblesse: ['Faiblesse', 'err'], opportunite: ['Opportunité', 'info'] };

function diagHtml(c) {
  const d = diagnostic(c);
  if (!d.length) return '<p class="muted">Remplissez la fiche et la présence en ligne : le diagnostic apparaîtra ici.</p>';
  return `<ul class="recos">${d.map(x => `<li class="${TYPES_CONSTAT[x.type][1]}"><b>${TYPES_CONSTAT[x.type][0]} :</b> ${esc(x.texte)}${x.action ? `<div class="muted">→ Action proposée : ${esc(x.action.action)}</div>` : ''}</li>`).join('')}</ul>`;
}

// Ce que la dernière recherche sur internet a trouvé, tel quel.
function blocWeb(c) {
  const w = c.fiche.web?.donnees;
  if (!w) return '';
  const age = ageRechercheWeb(c);
  const ligne = (l, v) => v && String(v).trim() ? `<div><b>${l} :</b> ${nl2br(v)}</div>` : '';
  return `<details class="web-box" ${age < 2 ? 'open' : ''}>
    <summary>🌐 Trouvé sur internet le ${dateCourte(c.fiche.web.date)}${age > 60 ? ' <span class="txt-red">(à mettre à jour)</span>' : ''}</summary>
    ${w.resume ? `<p>${nl2br(w.resume)}</p>` : ''}
    ${ligne('Produits / services', w.activite?.produits)}${ligne('Prix publiés', w.activite?.prix)}${ligne('Zone', w.activite?.zone)}
    ${ligne('Concurrents', w.concurrents)}${ligne('Mis en avant', w.avantage)}${ligne('Avis des clients', w.avis_clients)}
    ${w.remarques ? `<p class="muted">À vérifier : ${esc(w.remarques)}</p>` : ''}
    ${w.sources?.length ? `<div class="muted">Sources : ${w.sources.map(x => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre || x.url)}</a>`).join(' · ')}</div>` : ''}
    <div class="row-btns mt"><button class="btn btn-sm" data-action="web-reprendre" data-id="${c.id}">Reprendre tout dans la fiche (remplace)</button>
      <span class="muted">Ces informations sont aussi transmises à l'IA quand elle rédige le plan.</span></div>
  </details>`;
}

function updateLiveFiche(c) {
  const set = (k, html) => document.querySelectorAll(`[data-live="${k}"]`).forEach(el => { el.innerHTML = html; });
  const pct = completude(c);
  set('ficheScore', scoreBadge(pct));
  set('ficheMeter', `<i style="width:${pct}%" class="${pct >= 80 ? '' : pct >= 50 ? 'mid' : 'over'}"></i>`);
  set('diag', diagHtml(c));
}

function viewFiche(c) {
  const f = c.fiche;
  const cb = (path, val, attrs = '') => `<input data-cbind="${path}" value="${esc(val)}" ${attrs}>`;
  const cn = (path, val, attrs = '') => `<input data-cbind="${path}" data-type="num" type="number" min="0" step="any" value="${esc(val)}" ${attrs}>`;
  const ca = (path, val, ph = '', rows = 3) => `<textarea data-cbind="${path}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
  const q = (label, html, cls = '') => `<label class="${cls}">${label}${html}</label>`;
  const pct = completude(c);
  const plans = data.plans.filter(p => p.clientId === c.id);
  return topbar(`Fiche entreprise — ${esc(c.nom)}`, `${esc(secteurLabel(c.secteur))}${f.majLe ? ` · mise à jour le ${dateCourte(f.majLe)}` : ''}`,
    `<a class="btn" href="#/clients">← Entreprises</a><button class="btn" data-action="edit-client" data-id="${c.id}">Coordonnées</button><button class="btn" data-action="export-fiche" data-id="${c.id}">⇩ Exporter la fiche</button><button class="btn btn-primary" data-action="new-plan-for" data-id="${c.id}">+ Nouveau plan</button>`) + `
  <div class="fiche-layout">
    <div>
      <div class="panel intro-fiche">
        <div class="score-head"><span>Fiche complétée</span><span data-live="ficheScore">${scoreBadge(pct)}</span></div>
        <div class="meter" data-live="ficheMeter"><i style="width:${pct}%" class="${pct >= 80 ? '' : pct >= 50 ? 'mid' : 'over'}"></i></div>
        <p class="muted">Plus la fiche est complète, plus le plan sera adapté : les réponses et les chiffres en ligne sont repris automatiquement dans le contexte, le SWOT, les cibles, les actions et les objectifs du plan. Tout est enregistré automatiquement.</p>
      </div>

      <div class="panel"><h3>1. Vérifier ce qui existe sur internet</h3>
        <p class="muted">Ouvrez ces recherches pour voir ce que les clients trouvent déjà sur l'entreprise (pages, avis, photos, articles), puis notez les chiffres dans la partie « Présence en ligne » ci-dessous.</p>
        <div class="ia-box">
          <div><b>Recherche automatique par IA</b><div class="muted">L'IA cherche l'entreprise sur le web (site, réseaux sociaux, avis, application, presse) et remplit la fiche. Vous vérifiez ensuite.</div></div>
          <button class="btn btn-primary" data-action="ia-recherche" data-id="${c.id}">🤖 Rechercher avec l'IA</button>
        </div>
        ${blocWeb(c)}
        <div class="row-btns">${liensRecherche(c).map(([l, u]) => `<a class="btn btn-sm" href="${esc(u)}" target="_blank" rel="noopener">🔎 ${l}</a>`).join('')}</div>
        ${q('Ce que vous avez trouvé en ligne', ca('fiche.recherche', f.recherche, 'Ex. : page Facebook active depuis 2019, beaucoup de commentaires sur la rapidité du service, 2 avis négatifs sur l\'attente, article dans Le Nouvelliste en 2023…', 3), 'mt')}
      </div>

      <div class="panel"><h3>2. L'activité</h3><div class="form-grid">
        ${q('Description de l\'activité', ca('fiche.activite.description', f.activite.description, 'Que fait l\'entreprise ? Depuis où ? Pour qui ?'), 'full')}
        ${q('Produits / services principaux', ca('fiche.activite.produits', f.activite.produits, 'Les 3 à 5 produits ou services qui rapportent le plus', 2), 'full')}
        ${q('Gamme de prix', cb('fiche.activite.prix', f.activite.prix, 'placeholder="Ex. : de 250 à 1 500 HTG"'))}
        ${q('Ancienneté', cb('fiche.activite.anciennete', f.activite.anciennete, 'placeholder="Ex. : 5 ans"'))}
        ${q('Nombre d\'employés', cb('fiche.activite.employes', f.activite.employes))}
        ${q('Zone servie', cb('fiche.activite.zone', f.activite.zone, 'placeholder="Quartier, ville, tout le pays, diaspora…"'))}
        ${q('Chiffre d\'affaires mensuel approximatif (facultatif)', cb('fiche.activite.ca', f.activite.ca))}
        ${q('Saisonnalité', cb('fiche.activite.saisonnalite', f.activite.saisonnalite, 'placeholder="Meilleurs mois, mois creux…"'))}
      </div></div>

      <div class="panel"><h3>3. La clientèle</h3><div class="form-grid">
        ${q('Profil des clients actuels', ca('fiche.clientele.profil', f.clientele.profil, 'Âge, sexe, quartier, revenus, profession, particuliers ou entreprises…', 2), 'full')}
        <div class="full"><div class="lbl-like">Comment les clients découvrent l'entreprise</div><div class="check-grid">
          ${DECOUVERTE.map(d => `<label class="check"><input type="checkbox" data-cbind="fiche.clientele.decouverte" data-list="${esc(d)}" ${f.clientele.decouverte.includes(d) ? 'checked' : ''}> ${esc(d)}</label>`).join('')}</div></div>
        ${q('Nombre de clients par mois (environ)', cn('fiche.clientele.clientsMois', f.clientele.clientsMois))}
        ${q('Part de clients qui reviennent (%)', cn('fiche.clientele.fideles', f.clientele.fideles, 'max="100"'))}
      </div></div>

      <div class="panel"><h3>4. Concurrence et difficultés</h3><div class="form-grid">
        ${q('Principaux concurrents', ca('fiche.concurrence.concurrents', f.concurrence.concurrents, 'Noms, prix, points forts de chacun', 2), 'full')}
        ${q('Ce qui différencie l\'entreprise (son atout)', ca('fiche.concurrence.avantage', f.concurrence.avantage, 'Pourquoi les clients la choisissent plutôt qu\'un concurrent', 2), 'full')}
        ${q('Problèmes actuels (un par ligne)', ca('fiche.concurrence.problemes', f.concurrence.problemes, 'Ex. : ventes en baisse le soir\nPeu de nouveaux clients', 3), 'full')}
      </div></div>

      <div class="panel"><h3>5. Présence en ligne et données accumulées</h3>
        <p class="muted">Recopiez les chiffres visibles sur chaque page (ou dans les statistiques de l'entreprise). Laissez vide si l'entreprise n'y est pas.</p>
        <div class="table-wrap flat"><table class="edit">
          <thead><tr><th>Plateforme</th><th>Lien</th><th colspan="3">Chiffres</th></tr></thead>
          <tbody>${PLATEFORMES.map(pl => `<tr><td><b>${pl.label}</b></td>
            <td>${cb(`fiche.enLigne.${pl.k}.url`, f.enLigne[pl.k].url, 'placeholder="https://…"')}</td>
            ${pl.champs.map(ch => `<td><span class="mini-lbl">${CHAMPS_LABELS[ch]}</span>${cn(`fiche.enLigne.${pl.k}.${ch}`, f.enLigne[pl.k][ch], ch === 'note' ? 'max="5" step="0.1"' : '')}</td>`).join('')}
            ${'<td></td>'.repeat(3 - pl.champs.length)}</tr>`).join('')}</tbody>
        </table></div>
        <div class="form-grid mt">
          ${q('Contacts clients enregistrés (fichier, carnet, caisse…)', cn('fiche.bases.contactsClients', f.bases.contactsClients))}
          ${q('Adresses email collectées', cn('fiche.bases.emails', f.bases.emails))}
          ${q('Ce que disent les clients (avis, commentaires marquants)', ca('fiche.bases.avisClients', f.bases.avisClients, '', 2), 'full')}
          ${q('Publications ou campagnes qui ont le mieux marché', ca('fiche.bases.meilleuresPubs', f.bases.meilleuresPubs, '', 2), 'full')}
        </div>
      </div>

      <div class="panel"><h3>6. Moyens disponibles</h3><div class="form-grid">
        ${q(`Budget marketing possible par mois (${esc(data.settings.devise)})`, cn('fiche.moyens.budgetMensuel', f.moyens.budgetMensuel))}
        ${q('Qui gère la communication aujourd\'hui ?', cb('fiche.moyens.gestionnaire', f.moyens.gestionnaire, 'placeholder="Le patron, un employé, personne…"'))}
        <div class="full"><div class="lbl-like">Supports déjà disponibles</div><div class="check-grid">
          ${Object.entries(SUPPORTS).map(([k, l]) => `<label class="check"><input type="checkbox" data-cbind="fiche.moyens.supports.${k}" data-type="bool" ${f.moyens.supports[k] ? 'checked' : ''}> ${l}</label>`).join('')}</div></div>
      </div></div>
    </div>

    <aside class="fiche-side">
      <div class="panel"><h3>Diagnostic automatique</h3><div data-live="diag">${diagHtml(c)}</div></div>
      <div class="panel"><h3>Plans de cette entreprise</h3>
        ${plans.length ? plans.map(p => `<div class="side-plan"><a href="#/plan/${p.id}/analyse">${esc(p.titre)}</a> ${badge(p.statut, STATUTS_PLAN)}</div>`).join('')
          + '<p class="muted">Dans un plan existant, étape « Analyse & SWOT » → « Importer la fiche » pour reprendre les nouvelles informations.</p>'
          : '<p class="muted">Aucun plan. Les informations de cette fiche seront reprises automatiquement à la création du plan.</p>'}
      </div>
    </aside>
  </div>`;
}

// ---------- Recherche par IA ----------
let rechercheEnCours = null;

const IA_ETAPE = { infos: 'resume', analyse: 'analyse', objectifs: 'objectifs', cibles: 'cibles', strategie: 'strategie', actions: 'actions', suivi: 'suivi', resultats: 'bilan' };
const usd = n => n.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });

function demanderCleSansFermer() {
  if (data.settings.cleApi) return true;
  toast('Ajoutez votre clé API dans Paramètres → Recherche par IA pour utiliser l\'IA.', 'err');
  return false;
}

function demanderCle() {
  if (data.settings.cleApi) return true;
  openModal(`<h2>IA non configurée</h2>
    <p>Pour utiliser l'IA, ajoutez d'abord votre clé API Anthropic dans les Paramètres (partie « Recherche par IA »).</p>
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button><a class="btn btn-primary" href="#/parametres">Aller aux Paramètres</a></div>`);
  return false;
}

// Affiche une fenêtre d'attente annulable pendant un appel à l'IA. Retourne le résultat, ou null en cas d'erreur.
async function avecProgression(message, travail) {
  const controle = new AbortController();
  rechercheEnCours = controle;
  openModal(`<h2>L'IA travaille…</h2>
    <div class="ia-progress"><span class="spinner"></span><div>${message}<div class="muted">Généralement moins d'une minute.</div></div></div>
    <div class="modal-actions"><button type="button" class="btn" data-action="ia-annuler">Annuler</button></div>`);
  $modal.querySelector('.modal-bg').dataset.action = 'noop';
  try { return await travail(controle.signal); }
  catch (e) {
    openModal(`<h2>Opération interrompue</h2><p>${esc(e.message)}</p><div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button></div>`);
    return null;
  } finally { rechercheEnCours = null; }
}

// Tout ce que l'IA doit savoir sur l'entreprise et le plan en cours.
function contexteIA(p) {
  const c = clientById(p.clientId) || {};
  const r = resultats(p);
  const plan = {
    titre: p.titre, motif: motifLabel(p), raison: p.motifDetail, periode: `${p.debut} → ${p.fin}`, budgetEnvisage: num(p.budgetPrevu),
    resume: p.resume, contexte: p.contexte, swot: p.swot, objectifs: p.objectifs.map(o => ({ objectif: o.objectif, cible: o.cible, actuel: o.actuel, progression: o.progression })),
    cibles: p.cibles, positionnement: p.positionnement, messageCle: p.messageCle, slogan: p.slogan,
    actions: p.actions.map(a => ({ canal: a.canal, action: a.action, budget: num(a.budget), statut: a.statut, depense: num(a.depense), prospects: num(a.prospects), ventes: num(a.ventes) })),
  };
  return [
    `Entreprise : ${c.nom} — secteur : ${secteurLabel(c.secteur)}${c.adresse ? ` — ${c.adresse}` : ''}`,
    `Devise : ${data.settings.devise}. Date du jour : ${todayISO()}.`,
    c.fiche && `Fiche entreprise :\n${texteContexte(c)}`,
    c.fiche?.concurrence?.concurrents?.trim() && `Concurrents connus de l'agence : ${c.fiche.concurrence.concurrents.trim()}`,
    c.fiche?.concurrence?.problemes?.trim() && `Problèmes signalés par l'entreprise : ${c.fiche.concurrence.problemes.trim()}`,
    c.fiche && texteWebIA(c) && `Informations publiques trouvées sur internet (à utiliser, sans les présenter comme vérifiées si elles sont marquées comme douteuses) :\n${texteWebIA(c)}`,
    c.fiche && `Diagnostic :\n${diagnostic(c).map(d => `- [${d.type}] ${d.texte}`).join('\n')}`,
    `Canaux disponibles : ${CANAUX.join(', ')}.`,
    r.aDesDonnees && `Résultats réels : dépensé ${r.depense}, prospects ${r.prospects}, ventes ${r.ventes}, ROI ${Math.round(r.roi)} %.`,
    `Plan en cours (JSON) :\n${JSON.stringify(plan)}`,
  ].filter(Boolean).join('\n\n');
}

let proposition = null;
let rechercheEnAttente = null;

function apercuValeur(v) {
  if (Array.isArray(v)) {
    if (!v.length) return '<p class="muted">—</p>';
    if (typeof v[0] !== 'object') return `<ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const cols = Object.keys(v[0]);
    return `<div class="table-wrap flat"><table><thead><tr>${cols.map(k => `<th>${esc(LIBELLES_IA[k] || k)}</th>`).join('')}</tr></thead><tbody>${v.map(o => `<tr>${cols.map(k => `<td>${esc(typeof o[k] === 'number' ? fmt(o[k]).replace(/,00$/, '') : o[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return `<p>${nl2br(v)}</p>`;
}

const LIBELLES_IA = { resume: 'Résumé', contexte: 'Situation actuelle', concurrents: 'Marché et concurrence', forces: 'Forces', faiblesses: 'Faiblesses', opportunites: 'Opportunités', menaces: 'Menaces', objectifs: 'Objectifs', cibles: 'Cibles', positionnement: 'Positionnement', messageCle: 'Message clé', slogans: 'Slogans proposés', ton: 'Ton', produit: 'Produit', prix: 'Prix', distribution: 'Distribution', promotion: 'Communication', actions: 'Actions', kpis: 'Indicateurs', suivi: 'Suivi', risques: 'Risques', bilan: 'Bilan', objectif: 'Objectif', indicateur: 'Indicateur', cible: 'Cible', echeance: 'Échéance', nom: 'Nom', description: 'Description', besoins: 'Besoins', canaux: 'Canaux', canal: 'Canal', action: 'Action', budget: 'Budget', debut: 'Début', fin: 'Fin' };

// Recherche sur internet avec la fenêtre d'attente standard ; complète la fiche. Retourne true si faite.
async function rechercheWebAvant(c) {
  const res = await avecProgression(`Recherche de « ${esc(c.nom)} » sur internet (site, réseaux sociaux, avis, presse)… 1 à 3 minutes.`,
    signal => rechercherEntreprise({ ...c, secteurLabel: secteurLabel(c.secteur) }, data.settings.cleApi, signal));
  if (!res) return false;
  if (res.donnees.entreprise_trouvee) {
    const modifs = fusionnerResultat(c, res.donnees, false);
    c.fiche.majLe = todayISO(); persist(true);
    toast(`Infos trouvées sur internet : ${modifs.length} champ(s) de la fiche complété(s) (coût estimé ${usd(res.cout)}).`);
  } else toast('Aucune source fiable trouvée sur internet pour cette entreprise.', 'err');
  return true;
}

async function proposerSection(p, section, sansRecherche = false) {
  if (!demanderCle()) return;
  const c = clientById(p.clientId);
  if (section === 'tout' && !sansRecherche && c && ageRechercheWeb(c) > 60) {
    rechercheEnAttente = { p };
    openModal(`<h2>Rechercher d'abord l'entreprise sur internet ?</h2>
      <p>${ageRechercheWeb(c) === Infinity ? 'L\'entreprise n\'a pas encore été recherchée sur internet.' : `La dernière recherche date de ${ageRechercheWeb(c)} jours.`} Une recherche préalable permet à l'IA de s'appuyer sur ce qui existe déjà en ligne : site, réseaux sociaux, avis des clients, concurrents.</p>
      <div class="modal-actions wrap"><button type="button" class="btn" data-action="close-modal">Annuler</button>
        <button type="button" class="btn" data-action="ia-tout-direct">Rédiger sans recherche</button>
        <button type="button" class="btn btn-primary" data-action="ia-tout-recherche">🌐 Rechercher puis rédiger</button></div>`, true);
    return;
  }
  const res = await avecProgression(section === 'tout' ? 'Rédaction du brouillon complet du plan…' : 'Rédaction de propositions pour cette étape…',
    signal => genererSection(data.settings.cleApi, section, contexteIA(p), signal));
  if (!res) return;
  proposition = { section, donnees: res.donnees, planId: p.id };
  const d = res.donnees;
  openModal(`<h2>Proposition de l'IA</h2>
    <div class="ia-apercu">${Object.entries(d).map(([k, v]) => `<h4>${esc(LIBELLES_IA[k] || k)}</h4>${k === 'slogans'
      ? v.map((x, i) => `<label class="check"><input type="radio" name="slogan" value="${i}" ${i === 0 ? 'checked' : ''}> ${esc(x)}</label>`).join('')
      : apercuValeur(v)}`).join('')}</div>
    <p class="muted">Coût estimé : ${usd(res.cout)}. « Compléter » remplit les champs vides et ajoute les éléments des listes ; « Remplacer » écrase le contenu des parties concernées.</p>
    <div class="modal-actions wrap"><button type="button" class="btn" data-action="close-modal">Ignorer</button>
      <button type="button" class="btn" data-action="ia-appliquer" data-mode="remplacer">Remplacer</button>
      <button type="button" class="btn btn-primary" data-action="ia-appliquer" data-mode="completer">Compléter le plan</button></div>`, true);
}

function appliquerProposition(p, mode) {
  if (!proposition || proposition.planId !== p.id) return;
  const d = proposition.donnees;
  const rempl = mode === 'remplacer';
  const txt = (cle, val) => { if (val === undefined) return; if (rempl || !String(p[cle] || '').trim()) p[cle] = val; };
  const lignes = (obj, cle, arr) => { if (!arr) return; const t = arr.join('\n'); obj[cle] = rempl || !obj[cle].trim() ? t : `${obj[cle]}\n${t}`; };
  const borne = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? (iso < p.debut ? p.debut : iso > p.fin ? p.fin : iso) : '');
  txt('resume', d.resume); txt('contexte', d.contexte); txt('concurrents', d.concurrents);
  ['forces', 'faiblesses', 'opportunites', 'menaces'].forEach(k => lignes(p.swot, k, d[k]));
  if (d.objectifs) p.objectifs = [...(rempl ? [] : p.objectifs), ...d.objectifs.map(o => ({ ...o, actuel: '', progression: 0 }))];
  if (d.cibles) p.cibles = [...(rempl ? [] : p.cibles), ...d.cibles];
  txt('positionnement', d.positionnement); txt('messageCle', d.messageCle); txt('ton', d.ton);
  if (d.slogans?.length) txt('slogan', d.slogans[+($modal.querySelector('input[name=slogan]:checked')?.value || 0)]);
  ['produit', 'prix', 'distribution', 'promotion'].forEach(k => { if (d[k] !== undefined && (rempl || !p.mix[k].trim())) p.mix[k] = d[k]; });
  if (d.actions) p.actions = [...(rempl ? [] : p.actions), ...d.actions.map(a => normaliserPlan({ actions: [{ ...a, budget: num(a.budget), debut: borne(a.debut) || p.debut, fin: borne(a.fin) || p.fin, responsable: '' }] }).actions[0])];
  if (d.kpis) p.kpis = rempl || !p.kpis.trim() ? d.kpis.join('\n') : `${p.kpis}\n${d.kpis.join('\n')}`;
  txt('suivi', d.suivi); txt('risques', d.risques); txt('bilan', d.bilan);
  proposition = null;
  persist(true); closeModal(); rerenderKeepScroll(); toast('Proposition appliquée au plan. Relisez et ajustez.');
}

function modalRechercheIA(c) {
  if (!data.settings.cleApi) {
    openModal(`<h2>Recherche par IA</h2>
      <p>Pour que l'application cherche elle-même sur internet, ajoutez d'abord votre clé API Anthropic dans les Paramètres (partie « Recherche par IA »).</p>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button><a class="btn btn-primary" href="#/parametres">Aller aux Paramètres</a></div>`);
    return;
  }
  openModal(`<h2>Rechercher « ${esc(c.nom)} » avec l'IA</h2>
    <p>L'IA va chercher sur le web le site, les réseaux sociaux, la fiche Google, l'application mobile, les avis et la presse concernant cette entreprise, puis remplir la fiche.</p>
    <ul class="muted">
      <li>Durée : 1 à 3 minutes.</li>
      <li>Coût : facturé à l'usage sur votre compte Anthropic ; le montant estimé est affiché à la fin de la recherche.</li>
      <li>Les réseaux sociaux ne montrent pas toujours leurs chiffres : certains resteront vides.</li>
      <li>Les informations proviennent de sources publiques : vérifiez-les avant de les présenter au client.</li>
    </ul>
    <label class="check"><input type="checkbox" name="remplacer"> Remplacer aussi les champs déjà remplis</label>
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button>
      <button type="button" class="btn btn-primary" data-action="ia-lancer" data-id="${c.id}">🤖 Lancer la recherche</button></div>`, true);
}

async function lancerRechercheIA(c, remplacer) {
  const controle = new AbortController();
  rechercheEnCours = controle;
  openModal(`<h2>Recherche en cours…</h2>
    <div class="ia-progress"><span class="spinner"></span><div>L'IA consulte le web pour « ${esc(c.nom)} ».<div class="muted">Cela prend généralement 1 à 3 minutes. Vous pouvez rester sur cette page.</div></div></div>
    <div class="modal-actions"><button type="button" class="btn" data-action="ia-annuler">Annuler la recherche</button></div>`);
  $modal.querySelector('.modal-bg').dataset.action = 'noop';
  try {
    const { donnees, usage, cout } = await rechercherEntreprise({ ...c, secteurLabel: secteurLabel(c.secteur) }, data.settings.cleApi, controle.signal);
    const modifs = donnees.entreprise_trouvee ? fusionnerResultat(c, donnees, remplacer) : [];
    if (donnees.entreprise_trouvee) { c.fiche.majLe = todayISO(); persist(true); }
    const coutTxt = `Coût estimé : ${cout.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} (${usage.recherches} recherche(s) web)`;
    if (location.hash === `#/client/${c.id}`) render();
    openModal(donnees.entreprise_trouvee ? `<h2>Recherche terminée</h2>
      ${donnees.resume ? `<p>${esc(donnees.resume)}</p>` : ''}
      <h4>${modifs.length} champ(s) rempli(s)</h4>
      ${modifs.length ? `<div class="chips">${modifs.map(m => `<span class="chip static">${esc(m)}</span>`).join('')}</div>` : '<p class="muted">Aucun champ vide à compléter (cochez « Remplacer » pour mettre à jour les champs existants).</p>'}
      ${donnees.remarques ? `<p class="hint">${esc(donnees.remarques)}</p>` : ''}
      ${donnees.sources.length ? `<h4>Sources</h4><ul class="sources">${donnees.sources.map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.titre || x.url)}</a></li>`).join('')}</ul>` : ''}
      <p class="muted">${coutTxt}. Le résumé et les sources sont aussi notés dans « Ce que vous avez trouvé en ligne ».</p>
      <div class="modal-actions"><button type="button" class="btn btn-primary" data-action="close-modal">Vérifier la fiche</button></div>`
      : `<h2>Entreprise non trouvée</h2>
      <p>L'IA n'a pas trouvé de source fiable concernant « ${esc(c.nom)} ». ${donnees.remarques ? esc(donnees.remarques) : ''}</p>
      <p class="muted">Astuce : indiquez la ville dans l'adresse, ou un lien connu (site, page Facebook) dans la fiche, puis relancez. ${coutTxt}.</p>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button></div>`, true);
  } catch (e) {
    openModal(`<h2>Recherche interrompue</h2><p>${esc(e.message)}</p>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button></div>`);
  } finally {
    rechercheEnCours = null;
  }
}

function viewPlans() {
  const f = filtres.plans;
  const plans = [...data.plans].sort((a, b) => (b.creeLe || '').localeCompare(a.creeLe || ''))
    .filter(p => (!f.statut || p.statut === f.statut) && contient(`${p.titre} ${motifLabel(p)} ${p.motifDetail} ${clientById(p.clientId)?.nom || ''}`, f.q));
  return topbar('Plans marketing', 'Créez, présentez puis facturez vos plans marketing et publicitaires',
    `<button class="btn btn-primary" data-action="new-plan-for">+ Nouveau plan</button>`) +
    (data.plans.length ? barreFiltres('plans', STATUTS_PLAN) : '') +
    (plans.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Plan</th><th>Période</th><th class="r">Budget actions</th><th class="r">Honoraires</th><th class="c">Qualité</th><th>Statut</th><th></th></tr></thead>
      <tbody>${plans.map(p => `<tr>
        <td><b>${esc(p.titre)}</b><div class="muted">${esc(clientById(p.clientId)?.nom || '—')}</div>${p.motif ? `<div class="motif-tag">${esc(motifLabel(p))}</div>` : ''}</td>
        <td class="nowrap">${dateCourte(p.debut)} → ${dateCourte(p.fin)}</td>
        <td class="r num">${money(budgetActions(p))}</td>
        <td class="r num">${money(totalHonoraires(p))}</td>
        <td class="c">${scoreBadge(scorePlan(p, clientById(p.clientId)).score)}</td>
        <td>${badge(p.statut, STATUTS_PLAN)}</td>
        <td class="r nowrap">
          <a class="btn btn-sm" href="#/plan/${p.id}/infos">Modifier</a>
          <a class="btn btn-sm btn-gold" href="#/plan/${p.id}/presentation">Présenter</a>
          <button class="btn btn-sm" data-action="dup-plan" data-id="${p.id}" title="Dupliquer">⧉</button>
          <button class="btn btn-sm btn-danger" data-action="del-plan" data-id="${p.id}" title="Supprimer">✕</button>
        </td></tr>`).join('')}</tbody></table></div>`
      : `<div class="panel muted">${data.plans.length ? 'Aucun plan ne correspond à ces filtres.' : 'Aucun plan. Cliquez sur « Nouveau plan » pour commencer.'}</div>`);
}

// ---------- Suivi des actions (tous les plans) ----------
const toutesActions = () => data.plans.filter(p => p.statut !== 'refuse')
  .flatMap(p => p.actions.map((a, i) => ({ a, p, i })));

function viewActions() {
  const f = filtres.actions;
  const all = toutesActions();
  const retard = all.filter(({ a, p }) => actionEnRetard(a, p));
  const list = all.filter(({ a, p }) => {
    if (f.plan && p.id !== f.plan) return false;
    if (f.statut === 'ouvertes' && a.statut === 'termine') return false;
    if (f.statut === 'retard' && !actionEnRetard(a, p)) return false;
    if (STATUTS_ACTION[f.statut] && a.statut !== f.statut) return false;
    return contient(`${a.canal} ${a.action} ${a.responsable} ${p.titre} ${clientById(p.clientId)?.nom || ''}`, f.q);
  }).sort((x, y) => (x.a.fin || x.p.fin || '').localeCompare(y.a.fin || y.p.fin || ''));
  const compte = st => all.filter(({ a }) => a.statut === st).length;
  return topbar('Suivi des actions', 'Toutes les actions de vos plans : qui fait quoi, quand, et avec quel résultat') + `
    <div class="kpi-row">
      <div class="kpi"><div class="lbl">À faire</div><div class="val">${compte('a_faire')}</div></div>
      <div class="kpi"><div class="lbl">En cours</div><div class="val">${compte('en_cours')}</div></div>
      <div class="kpi pos"><div class="lbl">Terminées</div><div class="val">${compte('termine')}</div></div>
      <div class="kpi ${retard.length ? 'neg' : ''}"><div class="lbl">En retard</div><div class="val">${retard.length}</div></div>
    </div>
    <div class="filters no-print">
      <input type="search" placeholder="Rechercher (canal, action, responsable, client…)" data-filter="actions.q" value="${esc(f.q)}">
      <select data-filter="actions.statut">${[['ouvertes', 'Non terminées'], ['', 'Toutes'], ['retard', 'En retard'], ...Object.entries(STATUTS_ACTION)].map(([k, l]) => `<option value="${k}" ${f.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select data-filter="actions.plan"><option value="">Tous les plans</option>${data.plans.map(p => `<option value="${p.id}" ${f.plan === p.id ? 'selected' : ''}>${esc(p.titre)} — ${esc(clientById(p.clientId)?.nom || '')}</option>`).join('')}</select>
    </div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Action</th><th>Plan / client</th><th>Période</th><th>Responsable</th><th class="r">Budget / dépensé</th><th>Statut</th></tr></thead>
      <tbody>${list.map(({ a, p, i }) => `<tr class="${actionEnRetard(a, p) ? 'late' : ''}">
        <td><b>${esc(a.canal)}</b><div>${esc(a.action)}</div></td>
        <td><a href="#/plan/${p.id}/resultats">${esc(p.titre)}</a><div class="muted">${esc(clientById(p.clientId)?.nom || '')}</div></td>
        <td class="nowrap">${dateCourte(a.debut || p.debut)} → ${dateCourte(a.fin || p.fin)}${actionEnRetard(a, p) ? '<div class="txt-red">En retard</div>' : ''}</td>
        <td>${esc(a.responsable || '—')}</td>
        <td class="r num">${money(a.budget)}<div class="muted">${money(a.depense)}</div></td>
        <td><select class="statut-select st-${a.statut}" data-action-change="action-statut" data-plan="${p.id}" data-i="${i}">${Object.entries(STATUTS_ACTION).map(([k, l]) => `<option value="${k}" ${a.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      </tr>`).join('')}</tbody></table></div>`
      : `<div class="panel muted">${all.length ? 'Aucune action ne correspond à ces filtres.' : 'Aucune action : ajoutez des actions dans l\'étape « Actions & budget » d\'un plan.'}</div>`}`;
}

function modalNouveauPlan(clientId = '') {
  if (!data.clients.length) { modalClient(); toast('Ajoutez d\'abord l\'entreprise cliente.'); return; }
  const debut = todayISO();
  openModal(`<h2>Nouveau plan marketing</h2>
    <form data-form="plan">
      <div class="form-grid">
        <label class="full">Entreprise cliente *<select name="clientId" required>${data.clients.map(c => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.nom)} — ${esc(secteurLabel(c.secteur))}</option>`).join('')}</select></label>
        <label class="full">Titre du plan *<input name="titre" required value="Plan marketing ${new Date().getFullYear()}"></label>
        <label class="full">Modèle de campagne (facultatif)<select name="modele"><option value="">— Aucun : plan libre —</option>${Object.entries(MODELES).map(([k, m]) => `<option value="${k}">${esc(m.label)} (${m.mois} mois)</option>`).join('')}</select></label>
        <label class="full">Motif du plan *<select name="motif" required>${motifOptions('')}</select></label>
        <label class="full">Précisez la raison du plan<textarea name="motifDetail" rows="2" placeholder="Ex. : l'entreprise ouvre une 2e boutique à Pétion-Ville en décembre et veut attirer une nouvelle clientèle."></textarea></label>
        <label>Début<input type="date" name="debut" value="${debut}" required></label>
        <label>Fin<input type="date" name="fin" value="${addMonths(debut, 6)}" required></label>
        <label class="full">Budget publicitaire envisagé (${esc(data.settings.devise)})<input name="budgetPrevu" type="number" min="0" step="any" value="0"></label>
        <label class="full check"><input type="checkbox" name="prefill" checked> Pré-remplir avec des suggestions adaptées au secteur (modifiables)</label>
        ${data.settings.cleApi ? `<label class="full check"><input type="checkbox" name="rechercheWeb" ${ageRechercheWeb(clientById(clientId) || data.clients[0]) > 60 ? 'checked' : ''}> 🌐 Rechercher d'abord l'entreprise sur internet (IA) pour adapter le plan à ce qui existe déjà en ligne</label>` : ''}
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Créer le plan</button></div>
    </form>`, true);
}

// ---------- Éditeur de plan ----------
const STEPS = [
  ['infos', 'Informations'],
  ['analyse', 'Analyse & SWOT'],
  ['objectifs', 'Objectifs'],
  ['cibles', 'Cibles'],
  ['strategie', 'Stratégie & message'],
  ['actions', 'Actions & budget'],
  ['calendrier', 'Calendrier de publication'],
  ['suivi', 'Suivi & KPIs'],
  ['honoraires', 'Honoraires'],
  ['resultats', 'Résultats & pilotage'],
];

const inp = (bind, val, attrs = '') => `<input data-bind="${bind}" value="${esc(val)}" ${attrs}>`;
const numInp = (bind, val) => `<input data-bind="${bind}" data-type="num" type="number" step="any" min="0" value="${esc(val)}">`;
const area = (bind, val, ph = '', rows = 4) => `<textarea data-bind="${bind}" rows="${rows}" placeholder="${esc(ph)}">${esc(val)}</textarea>`;
const field = (label, html, cls = '') => `<label class="${cls}">${label}${html}</label>`;
const chips = (kind, items, labelFn) => items.length ? `<div class="chips"><span class="muted">Idées :</span>${items.map((it, i) =>
  `<button class="chip" data-action="add-suggest" data-kind="${kind}" data-i="${i}">+ ${esc(labelFn(it))}</button>`).join('')}</div>` : '';

function stepContent(p, step) {
  const client = clientById(p.clientId);
  const sug = suggestions(client?.secteur);
  const devise = esc(data.settings.devise);
  switch (step) {
    case 'infos': return `
      <div class="form-grid">
        ${field('Titre du plan', inp('titre', p.titre), 'full')}
        ${field('Motif du plan', `<select data-bind="motif">${motifOptions(p.motif)}</select>`, 'full')}
        ${field('Raison du plan (détails)', area('motifDetail', p.motifDetail, 'Pourquoi l\'entreprise a besoin de ce plan maintenant ? Ex. : baisse des ventes depuis 3 mois, arrivée d\'un concurrent, nouveau produit…', 3), 'full')}
        ${field('Entreprise cliente', `<select data-bind="clientId">${data.clients.map(c => `<option value="${c.id}" ${c.id === p.clientId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>`)}
        ${field(`Budget publicitaire envisagé (${devise})`, numInp('budgetPrevu', p.budgetPrevu))}
        ${field('Début de la campagne', inp('debut', p.debut, 'type="date"'))}
        ${field('Fin de la campagne', inp('fin', p.fin, 'type="date"'))}
        ${field('Résumé du plan (synthèse pour le client)', area('resume', p.resume, 'En quelques phrases : la situation, l\'ambition, la stratégie proposée et les résultats attendus.', 5), 'full')}
      </div>
      <div class="hint">Secteur : <b>${esc(secteurLabel(client?.secteur))}</b>.
        <button class="btn btn-sm" data-action="prefill">✦ Remplir les champs vides avec des suggestions du secteur</button></div>
      ${ficheHint(client)}
      <div class="hint modele-hint">📋 Modèle de campagne${p.modele && MODELES[p.modele] ? ` : <b>${esc(MODELES[p.modele].label)}</b>` : ''}
        <button class="btn btn-sm" data-action="modele-choisir">${p.modele ? 'Changer / ajouter un modèle' : 'Appliquer un modèle'}</button>
        <span class="muted">Objectifs, actions datées et budget réparti selon le type de campagne.</span></div>`;
    case 'analyse': return `
      ${ficheHint(client)}
      <div class="form-grid">
        ${field('Situation actuelle de l\'entreprise', area('contexte', p.contexte, 'Historique, produits/services, clients actuels, chiffre d\'affaires, présence en ligne, ce qui marche et ce qui ne marche pas…', 5), 'full')}
        ${field('Marché et concurrence', area('concurrents', p.concurrents, 'Principaux concurrents, leurs prix, leurs points forts, tendances du marché…', 4), 'full')}
      </div>
      <h4>Analyse SWOT</h4>
      <div class="swot-grid">
        ${field('<span class="sw f">Forces</span>', area('swot.forces', p.swot.forces, 'Une idée par ligne', 5))}
        ${field('<span class="sw w">Faiblesses</span>', area('swot.faiblesses', p.swot.faiblesses, 'Une idée par ligne', 5))}
        ${field('<span class="sw o">Opportunités</span>', area('swot.opportunites', p.swot.opportunites, 'Une idée par ligne', 5))}
        ${field('<span class="sw t">Menaces</span>', area('swot.menaces', p.swot.menaces, 'Une idée par ligne', 5))}
      </div>`;
    case 'objectifs': return `
      <p class="muted">Des objectifs SMART : précis, mesurables, atteignables, réalistes et datés.</p>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th>Objectif</th><th>Indicateur</th><th style="width:110px">Cible</th><th style="width:120px">Échéance</th><th></th></tr></thead>
        <tbody>${p.objectifs.map((o, i) => `<tr>
          <td>${inp(`objectifs.${i}.objectif`, o.objectif)}</td><td>${inp(`objectifs.${i}.indicateur`, o.indicateur)}</td>
          <td>${inp(`objectifs.${i}.cible`, o.cible)}</td><td>${inp(`objectifs.${i}.echeance`, o.echeance)}</td>
          <td><button class="btn btn-sm btn-danger" data-action="del-row" data-list="objectifs" data-i="${i}">✕</button></td></tr>`).join('')}</tbody>
      </table></div>
      <button class="btn btn-sm" data-action="add-row" data-list="objectifs">+ Ajouter un objectif</button>
      ${chips('objectifs', sug.objectifs, o => o.objectif)}`;
    case 'cibles': return `
      <p class="muted">Décrivez chaque groupe de clients visé (persona).</p>
      <div class="cards">${p.cibles.map((c, i) => `<div class="card">
        <div class="card-head">${inp(`cibles.${i}.nom`, c.nom, 'class="strong" placeholder="Nom du groupe"')}
          <button class="btn btn-sm btn-danger" data-action="del-row" data-list="cibles" data-i="${i}">✕</button></div>
        ${field('Profil', area(`cibles.${i}.description`, c.description, 'Âge, sexe, lieu, revenus, profession…', 2))}
        ${field('Besoins et motivations', area(`cibles.${i}.besoins`, c.besoins, '', 2))}
        ${field('Où et comment les toucher', area(`cibles.${i}.canaux`, c.canaux, '', 2))}
      </div>`).join('')}</div>
      <button class="btn btn-sm" data-action="add-row" data-list="cibles">+ Ajouter une cible</button>
      ${chips('cibles', sug.cibles, c => c.nom)}`;
    case 'strategie': return `
      <div class="form-grid">
        ${field('Positionnement', area('positionnement', p.positionnement, 'Comment l\'entreprise veut être perçue par rapport à ses concurrents.', 3), 'full')}
        ${field('Message clé / promesse', area('messageCle', p.messageCle, 'Le bénéfice principal que le client doit retenir.', 3), 'full')}
        ${field('Slogan', inp('slogan', p.slogan))}
        ${field('Ton de communication', inp('ton', p.ton, 'placeholder="Chaleureux, professionnel, drôle…"'))}
      </div>
      <h4>Marketing mix (4P)</h4>
      <div class="swot-grid">
        ${field('Produit / Service', area('mix.produit', p.mix.produit, 'Offre, gamme, qualité, nouveautés…', 4))}
        ${field('Prix', area('mix.prix', p.mix.prix, 'Politique de prix, promotions, facilités de paiement…', 4))}
        ${field('Distribution', area('mix.distribution', p.mix.distribution, 'Points de vente, livraison, vente en ligne…', 4))}
        ${field('Communication', area('mix.promotion', p.mix.promotion, 'Grandes lignes de la communication et de la publicité…', 4))}
      </div>`;
    case 'actions': {
      const total = budgetActions(p);
      return `
      <p class="muted">Détaillez chaque action publicitaire ou marketing avec sa période et son budget.</p>
      <datalist id="canaux">${CANAUX.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th style="width:170px">Canal</th><th>Action / contenu</th><th style="width:135px">Début</th><th style="width:135px">Fin</th><th style="width:120px">Budget (${devise})</th><th style="width:120px">Responsable</th><th></th></tr></thead>
        <tbody>${p.actions.map((a, i) => `<tr>
          <td>${inp(`actions.${i}.canal`, a.canal, 'list="canaux"')}</td>
          <td>${inp(`actions.${i}.action`, a.action)}<textarea class="sub" data-bind="actions.${i}.description" rows="1" placeholder="Détails (fréquence, format, zone…)">${esc(a.description)}</textarea></td>
          <td>${inp(`actions.${i}.debut`, a.debut, 'type="date"')}</td><td>${inp(`actions.${i}.fin`, a.fin, 'type="date"')}</td>
          <td>${numInp(`actions.${i}.budget`, a.budget)}</td><td>${inp(`actions.${i}.responsable`, a.responsable)}</td>
          <td><button class="btn btn-sm btn-danger" data-action="del-row" data-list="actions" data-i="${i}">✕</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4" class="r"><b>Total des actions</b></td><td class="num"><b data-live="budgetTotal">${money(total)}</b></td><td colspan="2" class="muted" data-live="budgetEcart">${ecartBudget(p)}</td></tr></tfoot>
      </table></div>
      <div class="row-btns"><button class="btn btn-sm" data-action="add-row" data-list="actions">+ Ajouter une action</button>
      ${num(p.budgetPrevu) > 0 && p.actions.length ? `<button class="btn btn-sm" data-action="repartir-budget">⚖ Répartir le budget envisagé (${money(p.budgetPrevu)}) entre les actions</button>` : ''}</div>
      ${chips('actions', sug.actions, a => `${a.canal} : ${a.action}`)}`;
    }
    case 'calendrier': return vueCalendrier(p);
    case 'suivi': return `
      <div class="form-grid">
        ${field('Indicateurs de performance (KPIs)', area('kpis', p.kpis, 'Un indicateur par ligne', 5), 'full')}
        ${field('Méthode de suivi et reporting', area('suivi', p.suivi, 'Fréquence des rapports, réunions de bilan, outils…', 3), 'full')}
        ${field('Risques et plan B', area('risques', p.risques, '', 3), 'full')}
      </div>`;
    case 'honoraires': return `
      <p class="muted">Vos prestations pour ce plan. Elles seront reprises dans la facture générée après la présentation.</p>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th>Prestation</th><th style="width:90px">Qté</th><th style="width:140px">Prix unitaire (${devise})</th><th style="width:140px" class="r">Total</th><th></th></tr></thead>
        <tbody>${p.honoraires.map((l, i) => `<tr>
          <td>${inp(`honoraires.${i}.description`, l.description)}</td>
          <td>${numInp(`honoraires.${i}.qte`, l.qte)}</td><td>${numInp(`honoraires.${i}.pu`, l.pu)}</td>
          <td class="r num" data-live="hon-${i}">${money(num(l.qte) * num(l.pu))}</td>
          <td><button class="btn btn-sm btn-danger" data-action="del-row" data-list="honoraires" data-i="${i}">✕</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3" class="r"><b>Total honoraires HT</b></td><td class="r num"><b data-live="honTotal">${money(totalHonoraires(p))}</b></td><td></td></tr></tfoot>
      </table></div>
      <button class="btn btn-sm" data-action="add-row" data-list="honoraires">+ Ajouter une prestation</button>
      ${(() => { const h = data.temps.filter(t => t.planId === p.id).reduce((s, t) => s + num(t.duree), 0); return h ? `<p class="hint">⏱ Temps déjà passé sur ce plan : <b>${heures(h)}</b>${num(data.settings.coutHoraire) ? ` (coût ${money(h * num(data.settings.coutHoraire))})` : ''}. <a href="#/temps">Voir le détail</a></p>` : ''; })()}
      ${(data.settings.catalogue || []).length ? `<div class="chips"><span class="muted">Catalogue :</span>${data.settings.catalogue.map((c, i) =>
        `<button class="chip" data-action="add-catalogue" data-i="${i}">+ ${esc(c.description)}${num(c.pu) ? ` · ${money(c.pu)}` : ''}</button>`).join('')}
        <a class="muted" href="#/parametres">Modifier le catalogue</a></div>` : ''}
      <div class="form-grid" style="margin-top:16px">${field('Notes / conditions de la proposition', area('notes', p.notes, 'Validité de l\'offre, modalités, ce qui est inclus ou non…', 3), 'full')}</div>`;
    case 'resultats': return `
      <p class="muted">Pendant la campagne, notez ce qui a été dépensé et obtenu pour chaque action. Les indicateurs et les recommandations se mettent à jour automatiquement.</p>
      <div data-live="resKpi">${resultatsKpi(p)}</div>
      <h4>Résultats par action</h4>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th>Action</th><th style="width:120px">Statut</th><th style="width:110px" class="r">Budget prévu</th><th style="width:115px">Dépensé</th><th style="width:105px">Personnes touchées</th><th style="width:95px">Prospects</th><th style="width:120px">Ventes générées</th></tr></thead>
        <tbody>${p.actions.map((a, i) => `<tr class="${actionEnRetard(a, p) ? 'late' : ''}">
          <td><b>${esc(a.canal)}</b><div class="muted">${esc(a.action)}</div></td>
          <td><select data-bind="actions.${i}.statut">${Object.entries(STATUTS_ACTION).map(([k, l]) => `<option value="${k}" ${a.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
          <td class="r num">${money(a.budget)}</td>
          <td>${numInp(`actions.${i}.depense`, a.depense)}</td><td>${numInp(`actions.${i}.portee`, a.portee)}</td>
          <td>${numInp(`actions.${i}.prospects`, a.prospects)}</td><td>${numInp(`actions.${i}.ventes`, a.ventes)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Aucune action dans ce plan.</td></tr>'}</tbody>
      </table></div>
      ${p.objectifs.length ? `<h4>Avancement des objectifs</h4>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th>Objectif</th><th style="width:110px">Cible</th><th style="width:150px">Valeur actuelle</th><th style="width:230px">Atteint (%)</th></tr></thead>
        <tbody>${p.objectifs.map((o, i) => `<tr><td>${esc(o.objectif)}<div class="muted">${esc(o.indicateur)}</div></td><td>${esc(o.cible)}</td>
          <td>${inp(`objectifs.${i}.actuel`, o.actuel)}</td>
          <td><div class="prog-in"><input type="range" min="0" max="100" step="5" data-bind="objectifs.${i}.progression" data-type="num" value="${num(o.progression)}"><b data-live="prog-${i}">${num(o.progression)} %</b></div></td></tr>`).join('')}</tbody>
      </table></div>` : ''}
      <h4>Relevés mensuels <span class="n muted">pour les rapports mensuels au client</span></h4>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th style="width:140px">Mois</th><th>Dépensé</th><th>Personnes touchées</th><th>Prospects</th><th>Ventes</th><th></th></tr></thead>
        <tbody>${p.releves.map((r, i) => `<tr><td><input type="month" data-bind="releves.${i}.mois" value="${esc(r.mois)}"></td>
          <td>${numInp(`releves.${i}.depense`, r.depense)}</td><td>${numInp(`releves.${i}.portee`, r.portee)}</td><td>${numInp(`releves.${i}.prospects`, r.prospects)}</td><td>${numInp(`releves.${i}.ventes`, r.ventes)}</td>
          <td class="nowrap"><a class="btn btn-sm btn-gold" href="#/plan/${p.id}/rapport/${esc(r.mois)}">Rapport</a> <button class="btn btn-sm btn-danger" data-action="del-row" data-list="releves" data-i="${i}">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Aucun relevé. Ajoutez le mois écoulé pour suivre l\'évolution et produire le rapport mensuel.</td></tr>'}</tbody>
      </table></div>
      <button class="btn btn-sm" data-action="releve-ajouter">+ Ajouter un mois</button>
      <span class="muted">Le nouveau mois est pré-rempli avec les résultats cumulés des actions, moins les mois déjà relevés.</span>
      <div data-live="graphs">${graphiquesReleves(p)}</div>
      <h4>Recommandations</h4>
      <div data-live="resRecos">${recosHtml(p)}</div>
      <div class="form-grid" style="margin-top:16px">
        ${field('Bilan et prochaines étapes (pour le client)', area('bilan', p.bilan, 'Ce qui a fonctionné, ce qui sera ajusté le mois prochain…', 4), 'full')}
        <label class="check full"><input type="checkbox" data-bind="afficherResultats" data-type="bool" ${p.afficherResultats ? 'checked' : ''}> Inclure les résultats dans la présentation (rapport pour le client)</label>
      </div>`;
  }
  return '';
}

function resultatsKpi(p) {
  const r = resultats(p);
  const pct = r.budget ? Math.min(100, r.depense / r.budget * 100) : 0;
  return `<div class="kpi-row compact">
    <div class="kpi"><div class="lbl">Budget dépensé</div><div class="val num">${money(r.depense)}</div>
      <div class="meter"><i style="width:${pct.toFixed(0)}%" class="${r.depense > r.budget && r.budget ? 'over' : ''}"></i></div><div class="sub">${Math.round(r.budget ? r.depense / r.budget * 100 : 0)} % de ${money(r.budget)}</div></div>
    <div class="kpi"><div class="lbl">Prospects</div><div class="val">${fmt(r.prospects).replace(/,00$/, '')}</div><div class="sub">${r.prospects ? money(r.coutProspect) + ' / prospect' : '—'}</div></div>
    <div class="kpi pos"><div class="lbl">Ventes générées</div><div class="val num">${money(r.ventes)}</div><div class="sub">${fmt(r.portee).replace(/,00$/, '')} personnes touchées</div></div>
    <div class="kpi ${r.depense && r.roi < 0 ? 'neg' : r.depense ? 'pos' : ''}"><div class="lbl">Retour sur investissement</div><div class="val">${r.depense ? Math.round(r.roi) + ' %' : '—'}</div><div class="sub">(ventes − dépenses) / dépenses</div></div>
    <div class="kpi ${r.enRetard ? 'neg' : ''}"><div class="lbl">Actions terminées</div><div class="val">${r.terminees} / ${r.nb}</div><div class="sub">${r.enRetard ? r.enRetard + ' en retard' : 'Objectifs atteints à ' + Math.round(r.progression) + ' %'}</div></div>
  </div>`;
}

const recosHtml = p => `<ul class="recos">${recommandations(p, money).map(r => `<li class="${r.type}">${esc(r.texte)}</li>`).join('')}</ul>`;

function scorePanel(p) {
  const { score, conseils } = scorePlan(p, clientById(p.clientId));
  return `<div class="score-head"><span>Qualité du plan</span>${scoreBadge(score)}</div>
    <div class="meter"><i style="width:${score}%" class="${score >= 80 ? '' : score >= 50 ? 'mid' : 'over'}"></i></div>
    ${conseils.length ? `<ul class="conseils">${conseils.slice(0, 5).map(c => `<li><a href="${c.step === 'fiche' ? `#/client/${p.clientId}` : `#/plan/${p.id}/${c.step}`}">${esc(c.texte)}</a></li>`).join('')}</ul>
      ${conseils.length > 5 ? `<div class="muted">+ ${conseils.length - 5} autre(s) conseil(s)</div>` : ''}` : '<p class="muted">Plan complet 👍 Prêt à être présenté.</p>'}`;
}

function ficheHint(c) {
  if (!c) return '';
  const pct = completude(c);
  return `<div class="hint fiche-hint">Fiche entreprise complétée à ${scoreBadge(pct)}
    <a class="btn btn-sm" href="#/client/${c.id}">${pct < 100 ? 'Compléter la fiche' : 'Voir la fiche'}</a>
    ${pct ? '<button class="btn btn-sm btn-primary" data-action="importer-fiche">⇩ Importer la fiche et le diagnostic dans ce plan</button>' : ''}
    <span class="muted">Contexte, constats SWOT, cibles, actions et objectifs sont ajoutés sans effacer votre travail.</span></div>`;
}

// ---------- Calendrier de publication ----------
const calMois = {}; // mois affiché par plan
const calFiltre = { statut: '', canal: '' };

function vueCalendrier(p) {
  const mois = calMois[p.id] || (p.publications.map(x => x.date).filter(d => d >= todayISO()).sort()[0] || (todayISO() > p.debut ? todayISO() : p.debut)).slice(0, 7);
  calMois[p.id] = mois;
  const pubs = p.publications.filter(x => (!calFiltre.statut || x.statut === calFiltre.statut) && (!calFiltre.canal || x.canal === calFiltre.canal));
  const parJour = {};
  pubs.forEach(x => { (parJour[x.date] = parJour[x.date] || []).push(x); });
  const canaux = [...new Set(p.publications.map(x => x.canal).filter(Boolean))];
  const compte = st => p.publications.filter(x => x.statut === st).length;
  return `
    <p class="muted">Découpez les actions en publications concrètes : date, réseau, texte et visuel. Glissez une publication sur un autre jour pour la déplacer.</p>
    <div class="cal-stats">${Object.entries(STATUTS_PUB).map(([k, l]) => `<span class="pub-chip pst-${k}">${l} : ${compte(k)}</span>`).join('')}</div>
    <div class="cal-bar">
      <div class="row-btns"><button class="btn btn-sm" data-action="cal-mois" data-delta="-1">◀</button><b class="cal-titre">${libelleMois(mois)}</b><button class="btn btn-sm" data-action="cal-mois" data-delta="1">▶</button></div>
      <div class="row-btns">
        <select data-cal-filtre="statut"><option value="">Tous les statuts</option>${Object.entries(STATUTS_PUB).map(([k, l]) => `<option value="${k}" ${calFiltre.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select data-cal-filtre="canal"><option value="">Tous les réseaux</option>${canaux.map(c => `<option ${calFiltre.canal === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <button class="btn btn-sm btn-ia" data-action="ia-calendrier">✨ Proposer les publications du mois</button>
        <button class="btn btn-sm" data-action="cal-imprimer">🖨 Calendrier à valider</button>
        <button class="btn btn-sm" data-action="partage-client" data-id="${p.id}">🔗 Faire valider par le client</button>
        <a class="btn btn-sm btn-gold" href="#/execution/${p.id}">📋 Plan d'exécution interne</a>
      </div>
    </div>
    <div class="cal-grid">
      ${['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(j => `<div class="cal-head">${j}</div>`).join('')}
      ${grilleMois(mois).flat().map(j => `<div class="cal-day ${j.dansMois ? '' : 'hors'} ${j.date === todayISO() ? 'today' : ''} ${j.date < p.debut || j.date > p.fin ? 'hors-plan' : ''}" data-date="${j.date}">
        <div class="cal-num"><span>${j.jour}</span><button class="cal-add" data-action="pub-nouvelle" data-date="${j.date}" title="Ajouter une publication">+</button></div>
        ${(parJour[j.date] || []).map(x => `<div class="pub-chip pst-${x.statut}" draggable="true" data-pub="${x.id}" data-action="pub-ouvrir" data-pid="${x.id}" title="${esc(x.titre || x.texte)}"><b>${esc(abregeCanal(x.canal))}</b> ${esc(x.titre || x.texte.slice(0, 30) || 'Sans titre')}</div>`).join('')}
      </div>`).join('')}
    </div>
    <button class="btn btn-sm" data-action="pub-nouvelle" data-date="">+ Ajouter une publication</button>`;
}

function modalPublication(p, pub) {
  const neuve = !p.publications.some(x => x.id === pub.id);
  openModal(`<h2>${neuve ? 'Nouvelle publication' : 'Publication'}</h2>
    <form data-form="publication" data-plan="${p.id}" data-id="${pub.id}">
      <datalist id="canaux-pub">${CANAUX.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="form-grid">
        <label>Date *<input type="date" name="date" value="${esc(pub.date)}" required></label>
        <label>Heure de publication<input type="time" name="heure" value="${esc(pub.heure)}"><span class="muted">Vide = heure conseillée selon le réseau (ex. ${heureConseillee(pub.canal || 'TikTok')} pour ${esc(pub.canal || 'TikTok')})</span></label>
        <label>Réseau / canal *<input name="canal" list="canaux-pub" value="${esc(pub.canal)}" required></label>
        <label>Format<select name="format"><option value="">—</option>${FORMATS.map(x => `<option ${pub.format === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
        <label class="full">Titre (pour le calendrier)<input name="titre" value="${esc(pub.titre)}" placeholder="Ex. : Promo de la semaine"></label>
        <label class="full">Texte de la publication<textarea name="texte" rows="6">${esc(pub.texte)}</textarea></label>
        <label class="full">Visuel à prévoir<input name="visuel" value="${esc(pub.visuel)}" placeholder="Photo, vidéo courte, carrousel… et ce qu'elle montre"></label>
        <label class="check full"><input type="checkbox" name="visuelPret" ${pub.visuelPret ? 'checked' : ''}> Visuel prêt</label>
        <label>Hashtags<input name="hashtags" value="${esc(pub.hashtags)}"></label>
        <label>Lien à mettre (site, WhatsApp, appli…)<input name="lien" value="${esc(pub.lien)}" placeholder="https://…"></label>
        <label>Responsable de la publication<input name="responsable" list="responsables" value="${esc(pub.responsable || p.actions.find(a => a.canal === pub.canal)?.responsable || '')}"></label>
        <datalist id="responsables">${responsablesConnus().map(r => `<option value="${esc(r)}">`).join('')}</datalist>
        <label class="full">Consignes internes (pour la personne qui publie — jamais montrées au client)<textarea name="consignes" rows="2" placeholder="Ex. : épingler le post, répondre aux commentaires dans l'heure, booster 2 000 HTG sur 3 jours…">${esc(pub.consignes)}</textarea></label>
        <label>Statut<select name="statut">${Object.entries(STATUTS_PUB).map(([k, l]) => `<option value="${k}" ${pub.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="full">Commentaire du client / remarques<input name="commentaire" value="${esc(pub.commentaire)}"></label>
      </div>
      <div class="modal-actions wrap">
        ${neuve ? '' : `<button type="button" class="btn btn-danger" data-action="pub-suppr" data-pid="${pub.id}">Supprimer</button>`}
        <button type="button" class="btn btn-ia" data-action="pub-ia">✨ Rédiger avec l'IA</button>
        <button type="button" class="btn" data-action="pub-copier">Copier le texte</button>
        <button type="button" class="btn" data-action="close-modal">Annuler</button>
        <button type="button" class="btn btn-primary" data-action="submit-form">Enregistrer</button>
      </div>
    </form>`, true);
}

async function redigerPublication(p) {
  if (!demanderCleSansFermer()) return;
  const form = $modal.querySelector('form[data-form="publication"]');
  const btn = form.querySelector('[data-action="pub-ia"]');
  const fd = Object.fromEntries(new FormData(form));
  btn.disabled = true; btn.textContent = '✨ Rédaction…';
  try {
    const { donnees: d, cout } = await genererLibre(data.settings.cleApi,
      `Rédige une publication pour ${fd.canal || 'les réseaux sociaux'}, prévue le ${fd.date || 'prochainement'}${fd.titre ? `, sur le thème « ${fd.titre} »` : ''}${fd.texte ? `. Brouillon existant à améliorer : « ${fd.texte} »` : ''}. Respecte le ton et le message clé du plan ; texte prêt à publier, avec un appel à l'action.`,
      contexteIA(p), { titre: S.texte('Titre court pour le calendrier.'), texte: S.texte('Texte complet de la publication.'), visuel: S.texte('Visuel à prévoir.'), hashtags: S.texte('Hashtags séparés par des espaces.') }, undefined, 'low');
    ['titre', 'texte', 'visuel', 'hashtags'].forEach(k => { if (d[k] && (k === 'texte' || !form.elements[k].value.trim())) form.elements[k].value = d[k]; });
    toast(`Texte rédigé (coût estimé ${usd(cout)}). Relisez puis enregistrez.`);
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = '✨ Rédiger avec l\'IA'; }
}

async function proposerCalendrier(p) {
  if (!demanderCle()) return;
  const mois = calMois[p.id];
  const debut = `${mois}-01`, fin = moisDecale(mois, 1) + '-01';
  const res = await avecProgression(`Préparation des publications de ${libelleMois(mois)}…`, signal => genererLibre(data.settings.cleApi,
    `Propose le calendrier de publication du mois de ${libelleMois(mois)} (dates de ${debut} inclus à ${fin} exclu, dans la période du plan), en déclinant les actions du plan sur les réseaux concernés : 8 à 16 publications réparties dans le mois, variées (promotion, conseil, témoignage, coulisses…), avec le texte prêt à publier.`,
    contexteIA(p), { publications: S.liste('Publications du mois.', S.objet({ date: S.texte('Date AAAA-MM-JJ.'), heure: S.texte('Heure de publication HH:MM, la plus adaptée au réseau et à la cible.'), canal: S.texte('Réseau ou canal.'), format: S.texte(`Format, parmi : ${FORMATS.join(', ')}.`), titre: S.texte('Titre court.'), texte: S.texte('Texte complet.'), visuel: S.texte('Visuel à prévoir.'), hashtags: S.texte('Hashtags.'), consignes: S.texte('Consignes pratiques pour la personne qui publie (interaction, boost, épinglage…).') })) }, signal));
  if (!res) return;
  const pubs = res.donnees.publications.filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x.date));
  propositionCal = { planId: p.id, pubs };
  openModal(`<h2>${pubs.length} publications proposées</h2>
    <div class="ia-apercu">${pubs.map((x, i) => `<label class="check pub-prop"><input type="checkbox" name="pub" value="${i}" checked>
      <span><b>${dateCourte(x.date)} · ${esc(x.canal)}</b> — ${esc(x.titre)}<span class="muted">${esc(x.texte)}</span></span></label>`).join('')}</div>
    <p class="muted">Coût estimé : ${usd(res.cout)}. Les publications sont ajoutées au statut « Brouillon ».</p>
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Ignorer</button><button type="button" class="btn btn-primary" data-action="ia-cal-ajouter">Ajouter la sélection</button></div>`, true);
}
let propositionCal = null;

function imprimerCalendrier(p) {
  const mois = calMois[p.id];
  const pubs = p.publications.filter(x => x.date.startsWith(mois)).sort((a, b) => a.date.localeCompare(b.date));
  const c = clientById(p.clientId) || {};
  const w = document.getElementById('print-zone');
  w.innerHTML = `<article class="doc"><h1 class="print-title">Calendrier de publication — ${libelleMois(mois)}</h1>
    <p>${esc(c.nom || '')} · ${esc(p.titre)}</p>
    <table class="doc-table"><thead><tr><th>Date</th><th>Réseau</th><th>Publication</th><th>Visuel</th><th>Validation client</th></tr></thead>
    <tbody>${pubs.map(x => `<tr><td class="nowrap">${dateCourte(x.date)}</td><td>${esc(x.canal)}</td><td><b>${esc(x.titre)}</b><div>${nl2br(x.texte)}</div><div class="muted">${esc(x.hashtags)}</div></td><td>${esc(x.visuel)}</td><td>☐ OK ☐ À modifier<div class="muted">${esc(x.commentaire)}</div></td></tr>`).join('') || '<tr><td colspan="5">Aucune publication ce mois-ci.</td></tr>'}</tbody></table></article>`;
  document.body.classList.add('print-zone-on');
  window.print();
  setTimeout(() => { document.body.classList.remove('print-zone-on'); w.innerHTML = ''; }, 500);
}

// ---------- Plan d'exécution interne (« À publier ») ----------
const filtreExec = { semaine: '', responsable: '' };
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const jourLong = d => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

function responsablesConnus() {
  return [...new Set(data.plans.flatMap(p => [...p.actions.map(a => a.responsable), ...(p.publications || []).map(x => x.responsable)]).map(r => (r || '').trim()).filter(Boolean))].sort();
}
const responsableDe = it => (it.pub ? it.pub.responsable || it.plan.actions.find(a => a.canal === it.pub.canal)?.responsable : it.action?.responsable) || '';

function itemsExecution(planId, debut, fin) {
  const plans = data.plans.filter(p => p.statut !== 'refuse' && (!planId || p.id === planId));
  return programme(plans, debut, fin, num(data.settings.delaiPreparation))
    .filter(it => !filtreExec.responsable || responsableDe(it) === filtreExec.responsable);
}

function carteExec(it, aujourdhui) {
  const p = it.plan, client = clientById(p.clientId)?.nom || '';
  const resp = responsableDe(it);
  const tete = (icone, titre) => `<div class="exec-tete"><span class="exec-heure">${esc(it.heure)}</span><b>${icone} ${titre}</b><span class="muted">${esc(client)} · ${esc(p.titre)}${resp ? ` · 👤 ${esc(resp)}` : ''}</span></div>`;
  if (it.type === 'publication') {
    const x = it.pub;
    const fait = x.statut === 'publie';
    const retard = !fait && x.date < aujourdhui;
    return `<div class="exec-carte ${fait ? 'fait' : ''} ${retard ? 'retard' : ''}">
      ${tete('📣', `${esc(x.canal)}${x.format ? ` — ${esc(x.format)}` : ''}`)}
      ${x.titre ? `<div class="exec-titre">${esc(x.titre)}</div>` : ''}
      ${!fait && x.statut !== 'valide' ? `<div class="exec-alerte">⚠ Pas encore validé par le client (${esc(STATUTS_PUB[x.statut])})</div>` : ''}
      ${x.consignes ? `<div class="exec-consignes"><b>Consignes :</b> ${nl2br(x.consignes)}</div>` : ''}
      <div class="exec-texte">${x.texte ? nl2br(x.texte) : '<span class="muted">Texte à rédiger</span>'}${x.hashtags ? `<div class="muted">${esc(x.hashtags)}</div>` : ''}${x.lien ? `<div>🔗 ${esc(x.lien)}</div>` : ''}</div>
      ${x.visuel ? `<div class="muted">🖼 Visuel : ${esc(x.visuel)} — ${x.visuelPret ? '<b class="ok-txt">prêt</b>' : '<b class="txt-red">à préparer</b>'}</div>` : ''}
      <div class="row-btns no-print">
        <button class="btn btn-sm" data-action="exec-copier" data-plan="${p.id}" data-pid="${x.id}">Copier le texte</button>
        <button class="btn btn-sm" data-action="exec-modifier" data-plan="${p.id}" data-pid="${x.id}">Modifier</button>
        ${fait ? `<span class="ok-txt">✓ Publié${x.publieLe ? ' le ' + dateCourte(x.publieLe.slice(0, 10)) : ''}</span>` : `<button class="btn btn-sm btn-primary" data-action="exec-publie" data-plan="${p.id}" data-pid="${x.id}">✓ Marquer publié</button>`}
      </div>
      <div class="print-only exec-coche">☐ Publié &nbsp; ☐ Commentaires répondus</div>
    </div>`;
  }
  if (it.type === 'preparation') {
    const x = it.pub;
    return `<div class="exec-carte prep">${tete('🎨', `Préparer le visuel — ${esc(x.canal)} du ${dateCourte(x.date)}`)}
      <div>${esc(x.visuel)}${x.format ? ` <span class="muted">(${esc(x.format)})</span>` : ''}</div>
      <div class="row-btns no-print"><button class="btn btn-sm" data-action="exec-visuel" data-plan="${p.id}" data-pid="${x.id}">✓ Visuel prêt</button></div></div>`;
  }
  const a = it.action;
  return `<div class="exec-carte action">${tete(it.type === 'action-debut' ? '▶' : '■', `${it.type === 'action-debut' ? 'Démarrer' : 'Terminer'} : ${esc(a.canal)} — ${esc(a.action)}`)}
    ${a.description ? `<div class="muted">${esc(a.description)}</div>` : ''}${num(a.budget) ? `<div class="muted">Budget : ${money(a.budget)}</div>` : ''}</div>`;
}

function vueExecution(planId) {
  const aujourdhui = todayISO();
  const debut = filtreExec.semaine || lundi(aujourdhui);
  filtreExec.semaine = debut;
  const fin = ajouterJours(debut, 6);
  const plan = planById(planId);
  const items = itemsExecution(planId, debut, fin);
  const enRetard = itemsExecution(planId, '2000-01-01', ajouterJours(aujourdhui, -1)).filter(it => it.type === 'publication' && it.pub.statut !== 'publie');
  const pubs = items.filter(it => it.type === 'publication');
  const responsables = responsablesConnus();
  const jours = Array.from({ length: 7 }, (_, i) => ajouterJours(debut, i));
  return topbar(`Plan d'exécution interne${plan ? ' — ' + esc(plan.titre) : ''}`,
    `<b class="txt-red">Document interne</b> : quoi publier, où, quand et par qui. À ne pas transmettre au client.`,
    `${plan ? `<a class="btn" href="#/plan/${plan.id}/calendrier">← Calendrier</a>` : ''}
     <button class="btn" data-action="exec-programme">✉ Envoyer le programme du jour</button>
     <button class="btn btn-primary" data-action="print">🖨 Imprimer la semaine</button>`) + `
  <div class="filters no-print">
    <div class="row-btns"><button class="btn btn-sm" data-action="exec-semaine" data-delta="-7">◀</button>
      <button class="btn btn-sm" data-action="exec-semaine" data-delta="0">Cette semaine</button>
      <button class="btn btn-sm" data-action="exec-semaine" data-delta="7">▶</button></div>
    <select data-exec-filtre="responsable"><option value="">Tous les responsables</option>${responsables.map(r => `<option ${filtreExec.responsable === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
    <select data-exec-plan><option value="">Tous les plans</option>${data.plans.filter(p => p.statut !== 'refuse').map(p => `<option value="${p.id}" ${p.id === planId ? 'selected' : ''}>${esc(p.titre)} — ${esc(clientById(p.clientId)?.nom || '')}</option>`).join('')}</select>
  </div>
  <h2 class="exec-semaine">Semaine du ${dateFr(debut)} au ${dateFr(fin)}${filtreExec.responsable ? ` · ${esc(filtreExec.responsable)}` : ''}</h2>
  <div class="kpi-row compact">
    <div class="kpi"><div class="lbl">Publications de la semaine</div><div class="val">${pubs.length}</div></div>
    <div class="kpi pos"><div class="lbl">Déjà publiées</div><div class="val">${pubs.filter(it => it.pub.statut === 'publie').length}</div></div>
    <div class="kpi"><div class="lbl">Visuels à préparer</div><div class="val">${items.filter(it => it.type === 'preparation').length}</div></div>
    <div class="kpi ${enRetard.length ? 'neg' : ''}"><div class="lbl">En retard</div><div class="val">${enRetard.length}</div></div>
  </div>
  ${enRetard.length ? `<div class="panel exec-jour retard-panel"><h3>⚠ En retard (non publiées)</h3>${enRetard.map(it => carteExec(it, aujourdhui)).join('')}</div>` : ''}
  ${jours.map((d, i) => { const duJour = items.filter(it => it.date === d); return `<div class="panel exec-jour ${d === aujourdhui ? 'auj' : ''}">
    <h3>${JOURS[i]} ${new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}${d === aujourdhui ? ' <span class="badge st-presente">Aujourd\'hui</span>' : ''}</h3>
    ${duJour.length ? duJour.map(it => carteExec(it, aujourdhui)).join('') : '<p class="muted">Rien de prévu.</p>'}</div>`; }).join('')}
  ${!data.plans.some(p => (p.publications || []).length) ? '<p class="hint">Aucune publication planifiée : ajoutez-les dans l\'étape « Calendrier de publication » d\'un plan.</p>' : ''}`;
}

function texteProgrammeDuJour(planId) {
  const d = todayISO();
  const items = itemsExecution(planId, d, d);
  const lignes = items.map(it => {
    const client = clientById(it.plan.clientId)?.nom || '';
    if (it.type === 'publication') return `• ${it.heure} — ${it.pub.canal}${it.pub.format ? ` (${it.pub.format})` : ''} — ${client}\n  ${it.pub.titre || ''}${it.pub.statut !== 'valide' && it.pub.statut !== 'publie' ? ' ⚠ pas encore validé' : ''}${it.pub.consignes ? `\n  Consignes : ${it.pub.consignes}` : ''}`;
    if (it.type === 'preparation') return `• Préparer le visuel (${it.pub.canal}, publication du ${dateCourte(it.pub.date)}) — ${client} : ${it.pub.visuel}`;
    return `• ${it.type === 'action-debut' ? 'Démarrer' : 'Terminer'} : ${it.action.canal} — ${it.action.action} (${client})`;
  });
  return `Programme du ${jourLong(d)}${filtreExec.responsable ? ` — ${filtreExec.responsable}` : ''} :\n\n${lignes.join('\n\n') || 'Rien de prévu aujourd\'hui.'}\n\nLes textes complets sont dans l'application, page « À publier ».`;
}

function ecartBudget(p) {
  if (!num(p.budgetPrevu)) return '';
  const d = num(p.budgetPrevu) - budgetActions(p);
  return d >= 0 ? `Reste ${money(d)} sur le budget envisagé` : `<span class="txt-red">Dépasse de ${money(-d)} le budget envisagé</span>`;
}

function viewPlanEditor(p, step) {
  const idx = Math.max(0, STEPS.findIndex(s => s[0] === step));
  const [cur, curLabel] = STEPS[idx];
  const prev = STEPS[idx - 1], next = STEPS[idx + 1];
  return topbar(`<span data-live="planTitre">${esc(p.titre)}</span>`,
    `${esc(clientById(p.clientId)?.nom || '')} · ${badge(p.statut, STATUTS_PLAN)}`,
    `<a class="btn" href="#/plans">← Plans</a><a class="btn btn-gold" href="#/plan/${p.id}/presentation">Voir la présentation →</a>`) + `
    <div class="editor">
      <div class="editor-side">
        <nav class="steps">${STEPS.map(([k, l], i) => `${k === 'resultats' ? '<div class="steps-sep">Après la présentation</div>' : ''}<a href="#/plan/${p.id}/${k}" class="step ${k === cur ? 'active' : ''}"><span class="n">${i + 1}</span>${l}</a>`).join('')}</nav>
        <div class="panel score-panel" data-live="score">${scorePanel(p)}</div>
      </div>
      <div class="panel step-body">
        <div class="step-title"><h3>${idx + 1}. ${curLabel}</h3>${IA_ETAPE[cur] ? `<button class="btn btn-sm btn-ia" data-action="ia-section" data-section="${IA_ETAPE[cur]}">✨ Proposer avec l'IA</button>` : ''}</div>
        ${cur === 'infos' ? `<div class="ia-box"><div><b>Brouillon complet par l'IA</b><div class="muted">À partir de la fiche entreprise, du motif et du budget, l'IA propose toutes les parties du plan. Vous relisez et ajustez ensuite.</div></div><button class="btn btn-primary" data-action="ia-section" data-section="tout">✨ Rédiger tout le plan</button></div>` : ''}
        ${stepContent(p, cur)}
        <div class="step-nav">
          ${prev ? `<a class="btn" href="#/plan/${p.id}/${prev[0]}">← ${prev[1]}</a>` : '<span></span>'}
          ${next && cur !== 'honoraires' ? `<a class="btn btn-primary" href="#/plan/${p.id}/${next[0]}">${next[1]} →</a>`
                 : `<a class="btn btn-gold" href="#/plan/${p.id}/presentation">${cur === 'resultats' ? 'Voir le rapport' : 'Présenter le plan'} →</a>`}
        </div>
        <div class="saved muted">Enregistrement automatique</div>
      </div>
    </div>`;
}

function updateLive(p) {
  const set = (k, html) => document.querySelectorAll(`[data-live="${k}"]`).forEach(el => { el.innerHTML = html; });
  set('planTitre', esc(p.titre));
  set('budgetTotal', money(budgetActions(p)));
  set('budgetEcart', ecartBudget(p));
  set('honTotal', money(totalHonoraires(p)));
  p.honoraires.forEach((l, i) => set(`hon-${i}`, money(num(l.qte) * num(l.pu))));
  p.objectifs.forEach((o, i) => set(`prog-${i}`, `${num(o.progression)} %`));
  set('score', scorePanel(p));
  if (document.querySelector('[data-live="resKpi"]')) { set('resKpi', resultatsKpi(p)); set('resRecos', recosHtml(p)); set('graphs', graphiquesReleves(p)); }
}

// Durée réelle de la campagne en mois (au moins 1).
const dureeMois = p => Math.max(1, Math.round((new Date(p.fin) - new Date(p.debut)) / 86400000 / 30.44));

// ---------- Présentation ----------
function moisEntre(debut, fin) {
  if (!debut || !fin || fin < debut) return [];
  const out = [];
  const d = new Date(debut.slice(0, 7) + '-01T00:00:00');
  const end = fin.slice(0, 7);
  while (out.length < 24) {
    const k = d.toISOString().slice(0, 7);
    if (k > end) break;
    out.push({ k, label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '') + (d.getMonth() === 0 || !out.length ? ' ' + String(d.getFullYear()).slice(2) : '') });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

const liste = txt => {
  const items = String(txt || '').split('\n').map(s => s.trim()).filter(Boolean);
  return items.length ? `<ul>${items.map(i => `<li>${esc(i.replace(/^[-•*]\s*/, ''))}</li>`).join('')}</ul>` : '<p class="muted">—</p>';
};
const section = (n, titre, body) => body ? `<section class="doc-section"><h2><span>${n}</span>${titre}</h2>${body}</section>` : '';
const para = (label, txt) => txt ? `<div class="para">${label ? `<h4>${label}</h4>` : ''}<p>${nl2br(txt)}</p></div>` : '';

function viewPresentation(p) {
  const c = clientById(p.clientId) || {};
  const s = data.settings;
  const total = budgetActions(p);
  const parCanal = {};
  p.actions.forEach(a => { const k = a.canal || 'Autre'; parCanal[k] = (parCanal[k] || 0) + num(a.budget); });
  const canaux = Object.entries(parCanal).sort((a, b) => b[1] - a[1]);
  const mois = moisEntre(p.debut, p.fin);
  const factures = data.factures.filter(f => f.planId === p.id);
  let n = 0;

  const actionsBar = `
    <a class="btn" href="#/plan/${p.id}/infos">← Modifier</a>
    <button class="btn" data-action="print">🖨 Imprimer / PDF</button>
    ${p.statut === 'brouillon' ? `<button class="btn btn-primary" data-action="plan-statut" data-id="${p.id}" data-statut="presente">Marquer comme présenté</button>` : `
      <select class="btn" data-action-change="plan-statut" data-id="${p.id}">${Object.entries(STATUTS_PLAN).map(([k, l]) => `<option value="${k}" ${p.statut === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}
    <button class="btn" data-action="partage-client" data-id="${p.id}">🔗 Lien client</button>
    <button class="btn btn-gold" data-action="gen-facture" data-id="${p.id}">Générer la facture</button>`;

  return topbar('Présentation du plan', `${badge(p.statut, STATUTS_PLAN)}${p.datePresentation ? ` · présenté le ${dateFr(p.datePresentation)}` : ''}
    ${factures.length ? ` · Factures : ${factures.map(f => `<a href="#/facture/${f.id}">${esc(f.numero)}</a>`).join(', ')}` : ''}`, actionsBar) + `
  <article class="doc">
    <header class="cover">
      <div class="cover-top">${s.logo ? `<img src="${esc(s.logo)}" alt="" class="doc-logo">` : ''}<div><b>${esc(s.nom)}</b><div class="muted">${esc([s.telephone, s.email].filter(Boolean).join(' · '))}</div></div></div>
      <div class="cover-kicker">Plan marketing & publicitaire</div>
      <h1>${esc(p.titre)}</h1>
      <div class="cover-client">Préparé pour <b>${esc(c.nom || '')}</b> — ${esc(secteurLabel(c.secteur))}</div>
      ${p.motif ? `<div class="cover-motif"><span>Motif du plan</span>${esc(motifLabel(p))}</div>` : ''}
      <div class="cover-meta">
        <div><span>Période</span><b>${dateFr(p.debut)} → ${dateFr(p.fin)}</b></div>
        <div><span>Budget des actions</span><b>${money(total)}</b></div>
        <div><span>Date</span><b>${dateFr(p.datePresentation || todayISO())}</b></div>
      </div>
    </header>

    ${section(++n, 'Raison du plan et résumé', `${p.motif || p.motifDetail ? `<div class="motif-box"><b>${esc(p.motif === 'autre' ? 'Raison du plan' : motifLabel(p) || 'Raison du plan')}</b>${p.motifDetail ? `<p>${nl2br(p.motifDetail)}</p>` : ''}</div>` : ''}
      ${p.resume ? `<p class="lead">${nl2br(p.resume)}</p>` : p.motif ? '' : '<p class="muted">—</p>'}`)}

    ${section(++n, 'Analyse de la situation', para('Situation actuelle', p.contexte) + para('Marché et concurrence', p.concurrents) + presenceEnLigne(c) + reputationEnLigne(c) + `
      <div class="swot">
        <div class="sw-f"><h4>Forces</h4>${liste(p.swot.forces)}</div>
        <div class="sw-w"><h4>Faiblesses</h4>${liste(p.swot.faiblesses)}</div>
        <div class="sw-o"><h4>Opportunités</h4>${liste(p.swot.opportunites)}</div>
        <div class="sw-t"><h4>Menaces</h4>${liste(p.swot.menaces)}</div>
      </div>`)}

    ${section(++n, 'Objectifs', p.objectifs.length ? `<table class="doc-table"><thead><tr><th>Objectif</th><th>Indicateur</th><th>Cible</th><th>Échéance</th></tr></thead>
      <tbody>${p.objectifs.map(o => `<tr><td><b>${esc(o.objectif)}</b></td><td>${esc(o.indicateur)}</td><td>${esc(o.cible)}</td><td>${esc(o.echeance)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">—</p>')}

    ${section(++n, 'Cibles', p.cibles.length ? `<div class="persona-grid">${p.cibles.map(ci => `<div class="persona">
      <h4>${esc(ci.nom)}</h4>${ci.description ? `<p><span>Profil</span>${nl2br(ci.description)}</p>` : ''}${ci.besoins ? `<p><span>Besoins</span>${nl2br(ci.besoins)}</p>` : ''}${ci.canaux ? `<p><span>Où les toucher</span>${nl2br(ci.canaux)}</p>` : ''}</div>`).join('')}</div>` : '<p class="muted">—</p>')}

    ${section(++n, 'Stratégie', `
      ${p.messageCle || p.slogan ? `<blockquote>${p.slogan ? `<div class="slogan">« ${esc(p.slogan)} »</div>` : ''}${p.messageCle ? `<div>${nl2br(p.messageCle)}</div>` : ''}</blockquote>` : ''}
      ${para('Positionnement', p.positionnement)}${para('Ton de communication', p.ton)}
      ${Object.values(p.mix).some(Boolean) ? `<h4>Marketing mix</h4><div class="mix">
        ${[['Produit', p.mix.produit], ['Prix', p.mix.prix], ['Distribution', p.mix.distribution], ['Communication', p.mix.promotion]].map(([l, v]) => `<div><b>${l}</b><p>${v ? nl2br(v) : '—'}</p></div>`).join('')}</div>` : ''}`)}

    ${section(++n, 'Plan d\'action et budget', p.actions.length ? `
      <table class="doc-table"><thead><tr><th>Canal</th><th>Action</th><th>Période</th><th>Responsable</th><th class="r">Budget</th></tr></thead>
      <tbody>${p.actions.map(a => `<tr><td><b>${esc(a.canal)}</b></td><td>${esc(a.action)}${a.description ? `<div class="muted">${nl2br(a.description)}</div>` : ''}</td>
        <td class="nowrap">${dateCourte(a.debut)} → ${dateCourte(a.fin)}</td><td>${esc(a.responsable)}</td><td class="r num">${money(a.budget)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4" class="r"><b>Total</b></td><td class="r num"><b>${money(total)}</b></td></tr></tfoot></table>
      ${total > 0 ? `<h4>Répartition du budget par canal</h4><div class="bars">${canaux.map(([k, v]) => `
        <div class="bar-row"><span class="bar-lbl">${esc(k)}</span><span class="bar"><i style="width:${(v / total * 100).toFixed(1)}%"></i></span><span class="bar-val num">${Math.round(v / total * 100)} %</span></div>`).join('')}</div>` : ''}
      ${mois.length > 1 ? `<h4>Calendrier</h4><div class="gantt-wrap"><table class="gantt"><thead><tr><th></th>${mois.map(m => `<th>${esc(m.label)}</th>`).join('')}</tr></thead>
        <tbody>${p.actions.map(a => {
          const d = (a.debut || p.debut || '').slice(0, 7), f = (a.fin || p.fin || '').slice(0, 7);
          return `<tr><td>${esc(a.canal)}<div class="muted">${esc(a.action)}</div></td>${mois.map(m => `<td class="${m.k >= d && m.k <= f ? 'on' : ''}"></td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>` : ''}` : '<p class="muted">—</p>')}

    ${section(++n, 'Suivi des résultats', `${p.kpis ? `<h4>Indicateurs clés</h4>${liste(p.kpis)}` : ''}${para('Suivi et reporting', p.suivi)}${para('Risques et plan B', p.risques)}` || '<p class="muted">—</p>')}

    ${p.afficherResultats ? section(++n, 'Résultats obtenus', rapportResultats(p)) : ''}

    ${section(++n, 'Notre proposition', p.honoraires.length ? `
      <table class="doc-table"><thead><tr><th>Prestation</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead>
      <tbody>${p.honoraires.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${fmt(l.qte).replace(/,00$/, '')}</td><td class="r num">${money(l.pu)}</td><td class="r num">${money(num(l.qte) * num(l.pu))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r"><b>Total honoraires HT</b></td><td class="r num"><b>${money(totalHonoraires(p))}</b></td></tr>
      ${total > 0 ? `<tr><td colspan="3" class="r muted">Budget publicitaire (achat média, hors honoraires)</td><td class="r num muted">${money(total)}</td></tr>` : ''}</tfoot></table>
      ${para('', p.notes)}` : '')}

    ${(p.messagesClient || []).length ? `<section class="doc-section no-print"><h2><span>✉</span>Messages du client</h2>${p.messagesClient.map(m => `<p><b>${dateCourte(m.date)}${m.nom ? ' · ' + esc(m.nom) : ''}</b> — ${nl2br(m.texte)}</p>`).join('')}</section>` : ''}
    ${blocSignature(p, c)}

    <footer class="doc-foot">${esc(s.nom)}${s.adresse ? ` · ${esc(s.adresse)}` : ''}${s.telephone ? ` · ${esc(s.telephone)}` : ''}${s.email ? ` · ${esc(s.email)}` : ''}</footer>
  </article>`;
}

// Tableau de la présence en ligne actuelle du client (s'il y en a une).
function presenceEnLigne(c) {
  if (!c.fiche) return '';
  const rows = PLATEFORMES.map(pl => ({ pl, d: c.fiche.enLigne[pl.k] }))
    .filter(({ pl, d }) => d.url || pl.champs.some(ch => num(d[ch]) > 0));
  const contacts = num(c.fiche.bases.contactsClients), emails = num(c.fiche.bases.emails);
  if (!rows.length && !contacts && !emails) return '';
  const val = (d, ch) => num(d[ch]) ? (ch === 'note' ? String(d[ch]).replace('.', ',') + ' / 5' : fmt(d[ch]).replace(/,00$/, '')) : '—';
  return `<div class="para"><h4>Présence en ligne actuelle</h4>
    <table class="doc-table"><thead><tr><th>Plateforme</th><th>Chiffres clés</th><th class="r">Engagement</th></tr></thead>
    <tbody>${rows.map(({ pl, d }) => {
      const taux = num(d.abonnes) && num(d.interactions) ? (num(d.interactions) / num(d.abonnes) * 100).toFixed(1).replace('.', ',') + ' %' : '—';
      return `<tr><td><b>${pl.label}</b>${d.url ? `<div class="muted">${esc(d.url)}</div>` : ''}</td>
        <td>${pl.champs.map(ch => `${CHAMPS_LABELS[ch]} : <b>${val(d, ch)}</b>`).join(' · ')}</td><td class="r">${pl.social ? taux : '—'}</td></tr>`;
    }).join('')}
    ${contacts || emails ? `<tr><td><b>Données clients</b></td><td>${contacts ? `Contacts : <b>${fmt(contacts).replace(/,00$/, '')}</b>` : ''}${contacts && emails ? ' · ' : ''}${emails ? `Emails : <b>${fmt(emails).replace(/,00$/, '')}</b>` : ''}</td><td></td></tr>` : ''}
    </tbody></table></div>`;
}

// Bon pour accord : signature à l'écran (doigt, stylet ou souris) ou sur papier.
function blocSignature(p, c) {
  const sig = p.signature;
  return `<section class="doc-section signature-block">
    <h2><span>✓</span>Bon pour accord</h2>
    <p>Je soussigné(e), représentant ${esc(c.nom || 'l\'entreprise')}, accepte la proposition « ${esc(p.titre)} » et les honoraires de ${money(totalHonoraires(p))} HT décrits ci-dessus.</p>
    ${sig ? `<div class="sig-done"><img src="${esc(sig.image)}" alt="Signature"><div><b>${esc(sig.nom)}</b>${sig.fonction ? `, ${esc(sig.fonction)}` : ''}<div class="muted">Signé le ${dateFr(sig.date)}</div></div></div>
      <button class="btn btn-sm no-print" data-action="sig-effacer" data-id="${p.id}">Effacer la signature</button>`
    : `<div class="no-print sig-pad-wrap">
        <div class="form-grid">
          <label>Nom du signataire<input id="sig-nom" value="${esc(c.contact || '')}"></label>
          <label>Fonction<input id="sig-fonction" placeholder="Directeur, propriétaire…"></label>
        </div>
        <div class="lbl-like mt">Signature (au doigt sur téléphone ou tablette, ou à la souris)</div>
        <canvas id="sig-pad" width="600" height="180"></canvas>
        <div class="row-btns"><button class="btn btn-sm" data-action="sig-vider">Recommencer</button>
          <button class="btn btn-primary" data-action="sig-valider" data-id="${p.id}">Valider la signature</button></div>
      </div>
      <div class="print-only sig-paper"><div>Nom et fonction : ______________________</div><div>Date : ____ / ____ / ________</div><div>Signature :</div></div>`}
  </section>`;
}

function initSignature() {
  const cv = document.getElementById('sig-pad');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#132340';
  let dessine = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', e => { dessine = true; cv.dataset.vide = 'non'; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  cv.addEventListener('pointermove', e => { if (!dessine) return; ctx.lineTo(...pos(e)); ctx.stroke(); });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { dessine = false; }));
}

// ---------- Relevés et rapport mensuel ----------
const releveTries = p => [...p.releves].filter(r => r.mois).sort((a, b) => a.mois.localeCompare(b.mois));
const moisCourt = m => new Date(m + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }).replace('.', '');
const nombreCourt = n => n >= 1e6 ? fmt(n / 1e6).replace(/,00$/, '') + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : String(Math.round(n));

function graphiquesReleves(p, jusqua) {
  const rel = releveTries(p).filter(r => !jusqua || r.mois <= jusqua).slice(-12);
  if (!rel.length) return '';
  const et = rel.map(r => moisCourt(r.mois));
  return `<div class="graphs">
    ${histogramme({ titre: `Dépenses et ventes par mois (${data.settings.devise})`, etiquettes: et, format: v => nombreCourt(v),
      series: [{ nom: 'Dépensé', valeurs: rel.map(r => num(r.depense)) }, { nom: 'Ventes générées', valeurs: rel.map(r => num(r.ventes)) }] })}
    ${histogramme({ titre: 'Prospects par mois', etiquettes: et, format: v => nombreCourt(v), series: [{ nom: 'Prospects', valeurs: rel.map(r => num(r.prospects)) }] })}
  </div>`;
}

function nouveauReleve(p) {
  const rel = releveTries(p);
  const dernier = rel.at(-1)?.mois;
  const mois = dernier ? moisDecale(dernier, 1) : moisDecale(todayISO().slice(0, 7), -1) < p.debut.slice(0, 7) ? p.debut.slice(0, 7) : moisDecale(todayISO().slice(0, 7), -1);
  const r = resultats(p);
  const deja = k => rel.reduce((s, x) => s + num(x[k]), 0);
  const reste = (tot, k) => Math.max(0, tot - deja(k));
  return { mois, depense: reste(r.depense, 'depense'), portee: reste(r.portee, 'portee'), prospects: reste(r.prospects, 'prospects'), ventes: reste(r.ventes, 'ventes'), commentaire: '' };
}

function variation(v, avant) {
  if (avant === undefined || !num(avant)) return '';
  const pct = (num(v) - num(avant)) / num(avant) * 100;
  return `<span class="var">${pct >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(pct))} % vs mois précédent</span>`;
}

function viewRapport(p, mois) {
  const s = data.settings, c = clientById(p.clientId) || {};
  const rel = releveTries(p);
  const i = rel.findIndex(r => r.mois === mois);
  const r = rel[i];
  if (!r) return topbar('Rapport mensuel', 'Relevé introuvable.', `<a class="btn" href="#/plan/${p.id}/resultats">← Retour</a>`);
  const av = rel[i - 1] || {};
  const cpp = num(r.prospects) ? num(r.depense) / num(r.prospects) : 0;
  const roi = num(r.depense) ? (num(r.ventes) - num(r.depense)) / num(r.depense) * 100 : null;
  const pubs = p.publications.filter(x => x.date.startsWith(mois));
  const publiees = pubs.filter(x => x.statut === 'publie');
  const tuile = (l, v, extra = '') => `<div><span>${l}</span><b>${v}</b>${extra}</div>`;
  return topbar('Rapport mensuel', `${esc(c.nom || '')} · ${esc(p.titre)}`, `
    <a class="btn" href="#/plan/${p.id}/resultats">← Résultats</a>
    <button class="btn btn-ia" data-action="ia-commentaire" data-mois="${esc(mois)}">✨ Rédiger le commentaire</button>
    <button class="btn" data-action="rapport-partager" data-mois="${esc(mois)}">✉ Envoyer le résumé</button>
    <button class="btn btn-primary" data-action="print">🖨 Imprimer / PDF</button>`) + `
  <article class="doc rapport">
    <header class="rapport-head">
      <div class="cover-top">${s.logo ? `<img src="${esc(s.logo)}" alt="" class="doc-logo">` : ''}<div><b>${esc(s.nom)}</b><div class="muted">${esc([s.telephone, s.email].filter(Boolean).join(' · '))}</div></div></div>
      <div class="cover-kicker">Rapport mensuel</div>
      <h1>${esc(libelleMois(mois))}</h1>
      <div class="cover-client">${esc(c.nom || '')} — ${esc(p.titre)}</div>
    </header>
    <section class="doc-section"><h2><span>1</span>Chiffres du mois</h2>
      <div class="res-grid">
        ${tuile('Budget dépensé', money(r.depense), variation(r.depense, av.depense))}
        ${tuile('Personnes touchées', fmt(r.portee).replace(/,00$/, ''), variation(r.portee, av.portee))}
        ${tuile('Prospects', fmt(r.prospects).replace(/,00$/, ''), variation(r.prospects, av.prospects))}
        ${tuile('Ventes générées', money(r.ventes), variation(r.ventes, av.ventes))}
        ${tuile('Coût par prospect', cpp ? money(cpp) : '—')}
      </div>
      ${roi !== null ? `<p>Retour sur investissement du mois : <b>${Math.round(roi)} %</b> (ventes − dépenses) / dépenses.</p>` : ''}
    </section>
    ${rel.length > 1 ? `<section class="doc-section"><h2><span>2</span>Évolution</h2>${graphiquesReleves(p, mois)}</section>` : ''}
    <section class="doc-section"><h2><span>${rel.length > 1 ? 3 : 2}</span>Ce qui a été réalisé</h2>
      ${pubs.length ? `<p><b>${publiees.length}</b> publication(s) publiée(s) sur ${pubs.length} prévue(s) ce mois-ci.</p>
        ${publiees.length ? `<table class="doc-table"><thead><tr><th>Date</th><th>Réseau</th><th>Publication</th></tr></thead><tbody>${publiees.map(x => `<tr><td class="nowrap">${dateCourte(x.date)}</td><td>${esc(x.canal)}</td><td>${esc(x.titre || x.texte.slice(0, 80))}</td></tr>`).join('')}</tbody></table>` : ''}` : ''}
      <table class="doc-table"><thead><tr><th>Action</th><th>Statut</th></tr></thead><tbody>${p.actions.map(a => `<tr><td><b>${esc(a.canal)}</b> — ${esc(a.action)}</td><td>${STATUTS_ACTION[a.statut] || ''}</td></tr>`).join('')}</tbody></table>
      ${p.objectifs.length ? `<h4>Avancement des objectifs</h4><div class="bars">${p.objectifs.map(o => `<div class="bar-row"><span class="bar-lbl">${esc(o.objectif)}</span><span class="bar"><i style="width:${Math.min(100, num(o.progression))}%"></i></span><span class="bar-val num">${Math.round(num(o.progression))} %</span></div>`).join('')}</div>` : ''}
    </section>
    <section class="doc-section"><h2><span>✓</span>Commentaire et prochaines étapes</h2>
      <textarea class="no-print" data-releve-commentaire="${esc(mois)}" rows="5" placeholder="Ce qui a bien marché, ce qui sera ajusté le mois prochain…">${esc(r.commentaire || '')}</textarea>
      <div class="print-only">${r.commentaire ? `<p>${nl2br(r.commentaire)}</p>` : ''}</div>
    </section>
    <footer class="doc-foot">${esc(s.nom)}${s.telephone ? ` · ${esc(s.telephone)}` : ''}${s.email ? ` · ${esc(s.email)}` : ''}</footer>
  </article>`;
}

function texteResumeRapport(p, mois) {
  const c = clientById(p.clientId) || {};
  const r = releveTries(p).find(x => x.mois === mois);
  return `Bonjour${c.contact ? ' ' + c.contact : ''},\n\nVoici le bilan de ${libelleMois(mois)} pour « ${p.titre} » :\n- Budget dépensé : ${money(r.depense)}\n- Personnes touchées : ${fmt(r.portee).replace(/,00$/, '')}\n- Prospects : ${fmt(r.prospects).replace(/,00$/, '')}\n- Ventes générées : ${money(r.ventes)}\n${r.commentaire ? `\n${r.commentaire}\n` : ''}\nLe rapport complet est joint en PDF.\n\n${data.settings.nom}`;
}

// Avis et sources publiques (si l'entreprise a été recherchée sur internet).
function reputationEnLigne(c) {
  const w = c.fiche?.web?.donnees;
  const avis = c.fiche?.bases?.avisClients || w?.avis_clients;
  if (!avis && !w?.sources?.length) return '';
  return `<div class="para">${avis ? `<h4>Ce que disent les clients en ligne</h4><p>${nl2br(avis)}</p>` : ''}
    ${w?.sources?.length ? `<p class="muted sources-pres">Sources publiques consultées le ${dateCourte(c.fiche.web.date)} : ${w.sources.map(x => esc(x.titre || x.url)).join(' · ')}</p>` : ''}</div>`;
}

function rapportResultats(p) {
  const r = resultats(p);
  const cellules = [
    ['Budget dépensé', `${money(r.depense)}<small>sur ${money(r.budget)}</small>`],
    ['Personnes touchées', fmt(r.portee).replace(/,00$/, '')],
    ['Prospects', `${fmt(r.prospects).replace(/,00$/, '')}${r.prospects ? `<small>${money(r.coutProspect)} / prospect</small>` : ''}`],
    ['Ventes générées', money(r.ventes)],
    ['Retour sur investissement', r.depense ? Math.round(r.roi) + ' %' : '—'],
  ];
  return `<div class="res-grid">${cellules.map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('')}</div>
    ${p.actions.length ? `<table class="doc-table"><thead><tr><th>Action</th><th>Statut</th><th class="r">Dépensé</th><th class="r">Touchés</th><th class="r">Prospects</th><th class="r">Ventes</th></tr></thead>
      <tbody>${p.actions.map(a => `<tr><td><b>${esc(a.canal)}</b><div class="muted">${esc(a.action)}</div></td><td>${STATUTS_ACTION[a.statut] || ''}</td>
        <td class="r num">${money(a.depense)}</td><td class="r">${fmt(a.portee).replace(/,00$/, '')}</td><td class="r">${fmt(a.prospects).replace(/,00$/, '')}</td><td class="r num">${money(a.ventes)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${p.objectifs.length ? `<h4>Avancement des objectifs</h4><div class="bars">${p.objectifs.map(o => `
      <div class="bar-row"><span class="bar-lbl">${esc(o.objectif)}${o.actuel ? `<small>Actuel : ${esc(o.actuel)} · cible ${esc(o.cible)}</small>` : ''}</span><span class="bar"><i style="width:${Math.min(100, num(o.progression))}%"></i></span><span class="bar-val num">${Math.round(num(o.progression))} %</span></div>`).join('')}</div>` : ''}
    ${para('Bilan et prochaines étapes', p.bilan)}`;
}

function modalGenFacture(p, acompte = false) {
  const hon = totalHonoraires(p), med = budgetActions(p);
  openModal(`<h2>${acompte ? 'Facture d\'acompte' : 'Générer la facture'}</h2>
    ${acompte ? '<p class="hint">Proposition signée ✓ — facturez maintenant l\'acompte de démarrage.</p>' : ''}
    <form data-form="gen-facture" data-id="${p.id}">
      <p class="muted">Plan « ${esc(p.titre)} » — ${esc(clientById(p.clientId)?.nom || '')}</p>
      <label class="check"><input type="checkbox" name="honoraires" ${hon > 0 || !med ? 'checked' : ''}> Honoraires du plan (${money(hon)})</label>
      <label class="check"><input type="checkbox" name="media" ${med > 0 && !hon ? 'checked' : ''}> Budget des actions publicitaires (${money(med)})</label>
      <label class="check sub-opt"><input type="checkbox" name="mediaDetail" checked> Détailler le budget publicitaire action par action</label>
      <div class="form-grid" style="margin-top:12px">
        <label>Type de facture<select name="type"><option value="complete">Facture complète</option><option value="acompte" ${acompte ? 'selected' : ''}>Facture d'acompte</option></select></label>
        <label>Pourcentage d'acompte<input type="number" name="acomptePct" min="1" max="100" value="50"></label>
        <label>Date<input type="date" name="date" value="${todayISO()}"></label>
        <label>Échéance (jours)<input type="number" name="delai" min="0" value="${num(data.settings.delaiPaiement)}"></label>
      </div>
      ${p.statut === 'brouillon' ? '<p class="hint">Le plan sera marqué comme <b>présenté</b>.</p>' : ''}
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-gold" data-action="submit-form">Créer la facture</button></div>
    </form>`);
}

function nouveauNumero(date) {
  const s = data.settings;
  const n = num(s.prochainNumero) || 1;
  s.prochainNumero = n + 1;
  return `${s.prefixeFacture || 'FAC'}-${date.slice(0, 4)}-${String(n).padStart(4, '0')}`;
}

// Coordonnées de paiement (paramètres) en texte, pour la facture, les relances et le QR code.
function textePaiement(f) {
  const pm = data.settings.paiement || {};
  return [pm.lien && `Payer en ligne : ${pm.lien}`, pm.moncash && `MonCash : ${pm.moncash}`, pm.natcash && `NatCash : ${pm.natcash}`, pm.banque && `Virement : ${pm.banque}`]
    .filter(Boolean).join('\n');
}

function blocPaiement(f) {
  const txt = textePaiement(f);
  if (!txt || ['annulee', 'payee'].includes(f.statut)) return '';
  const pm = data.settings.paiement;
  const t = totauxFacture(f);
  const contenuQR = pm.lien || `${data.settings.nom}\nFacture ${f.numero}\nMontant : ${fmt(t.reste || t.total)} ${data.settings.devise}\n${txt}`;
  return `<div class="inv-pay-how">
    <div><h4>Comment payer</h4><p>${nl2br(txt)}</p><p class="muted">Indiquez la référence <b>${esc(f.numero)}</b> avec votre paiement.</p></div>
    <figure><div class="qr" data-qr="${esc(contenuQR)}"></div><figcaption>${pm.lien ? 'Scannez pour payer en ligne' : 'Scannez pour enregistrer les coordonnées de paiement'}</figcaption></figure>
  </div>`;
}

async function initQR() {
  const zones = document.querySelectorAll('[data-qr]');
  if (!zones.length) return;
  try {
    const qrcode = (await import('./vendor/qrcode.esm.js')).default;
    zones.forEach(z => { const q = qrcode(0, 'M'); q.addData(z.dataset.qr, 'Byte'); q.make(); z.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); });
  } catch { zones.forEach(z => { z.textContent = ''; }); }
}

let relanceCourante = null;
const marquerRelance = canal => {
  if (!relanceCourante) return;
  relanceCourante.relances = [...(relanceCourante.relances || []), { date: todayISO(), canal }];
  persist(true);
};

function modalRelance(f) {
  relanceCourante = f;
  const c = clientById(f.clientId) || {};
  const t = totauxFacture(f);
  const s = data.settings;
  const j = Math.round((new Date(f.echeance) - new Date(todayISO())) / 86400000);
  const intro = j > 0 ? `Petit rappel amical : la facture ${f.numero} du ${dateCourte(f.date)} (${f.objet}) arrive à échéance le ${dateCourte(f.echeance)}. Montant : ${fmt(t.reste)} ${s.devise}.`
    : j === 0 ? `La facture ${f.numero} du ${dateCourte(f.date)} (${f.objet}) arrive à échéance aujourd'hui. Montant : ${fmt(t.reste)} ${s.devise}.`
    : `Sauf erreur de notre part, la facture ${f.numero} du ${dateCourte(f.date)} (${f.objet}) reste à régler : ${fmt(t.reste)} ${s.devise}, échue depuis ${-j} jour(s) (le ${dateCourte(f.echeance)}).`;
  const modalites = textePaiement(f) || s.mentions;
  const msg = `Bonjour${c.contact ? ' ' + c.contact : ''},\n\n${intro}\n${modalites ? '\nModalités de paiement :\n' + modalites + '\n' : ''}\nMerci d'avance et belle journée,\n${s.nom}${s.telephone ? '\n' + s.telephone : ''}`;
  const historique = (f.relances || []).map(r => `${dateCourte(r.date)} (${r.canal})`).join(', ');
  const tel = String(c.telephone || '').replace(/\D/g, '');
  openModal(`<h2>Relancer — ${esc(f.numero)}</h2>
    <p class="muted">Message prêt à envoyer (modifiable) :</p>
    <textarea id="relance-msg" rows="10">${esc(msg)}</textarea>
    ${historique ? `<p class="muted">Déjà relancé : ${historique}</p>` : ''}
    <div class="modal-actions wrap">
      <button type="button" class="btn" data-action="copier-relance">Copier</button>
      ${c.email ? `<a class="btn" data-relance="mail" data-sujet="Facture ${esc(f.numero)}" href="mailto:${esc(c.email)}" target="_blank" rel="noopener">Email</a>` : ''}
      ${tel ? `<a class="btn btn-primary" data-relance="wa" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
    </div>
    ${!tel && !c.email ? '<p class="hint">Ajoutez le téléphone ou l\'email du client dans sa fiche pour l\'envoyer directement.</p>' : ''}`, true);
}

function creerFacture(p, opts) {
  let lignes = [];
  if (opts.honoraires) lignes.push(...p.honoraires.filter(l => l.description || num(l.pu)).map(l => ({ description: l.description, qte: num(l.qte), pu: num(l.pu) })));
  if (opts.media) {
    if (opts.mediaDetail) lignes.push(...p.actions.filter(a => num(a.budget)).map(a => ({ description: `Achat média — ${a.canal}${a.action ? ' : ' + a.action : ''}`, qte: 1, pu: num(a.budget) })));
    else if (budgetActions(p)) lignes.push({ description: `Budget publicitaire de la campagne (${dateCourte(p.debut)} → ${dateCourte(p.fin)})`, qte: 1, pu: budgetActions(p) });
  }
  if (opts.type === 'acompte') {
    const base = lignes.reduce((s, l) => s + l.qte * l.pu, 0);
    const pct = Math.min(100, Math.max(1, num(opts.acomptePct)));
    lignes = [{ description: `Acompte de ${pct} % — ${p.titre}`, qte: 1, pu: Math.round(base * pct) / 100 }];
  }
  if (!lignes.length) lignes.push({ description: p.titre, qte: 1, pu: 0 });

  const s = data.settings;
  const date = opts.date || todayISO();
  const f = {
    id: uid(), numero: nouveauNumero(date),
    planId: p.id, clientId: p.clientId, date, echeance: addDays(date, num(opts.delai)),
    objet: `${opts.type === 'acompte' ? 'Acompte — ' : ''}${p.titre}`,
    lignes, remisePct: 0, tvaPct: num(s.tvaPct), montantPaye: 0, paiements: [], statut: 'brouillon',
    notes: s.conditions || '',
  };
  if (p.statut === 'brouillon') { p.statut = 'presente'; p.datePresentation = todayISO(); }
  data.factures.push(f);
  persist(true);
  return f;
}

// ---------- Temps passé et rentabilité ----------
const filtreTemps = { client: '', mois: '' };
const heures = n => `${(Math.round(num(n) * 100) / 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
const dureeChrono = () => data.chrono ? (Date.now() - data.chrono.debut) / 3600000 : 0;

// Honoraires facturés HT (hors achat média refacturé) et encaissements, par client.
function rentabiliteParClient() {
  const cout = num(data.settings.coutHoraire);
  return data.clients.map(c => {
    const facts = data.factures.filter(f => f.clientId === c.id && !['brouillon', 'annulee'].includes(f.statut));
    const honoraires = facts.reduce((s, f) => s + f.lignes.filter(l => !/^achat média/i.test(l.description)).reduce((t, l) => t + num(l.qte) * num(l.pu), 0) * (1 - num(f.remisePct) / 100), 0);
    const encaisse = facts.reduce((s, f) => s + totauxFacture(f).paye, 0);
    const h = data.temps.filter(t => t.clientId === c.id).reduce((s, t) => s + num(t.duree), 0);
    return { c, honoraires, encaisse, h, coutTemps: h * cout, marge: honoraires - h * cout, tauxReel: h ? honoraires / h : 0 };
  }).filter(r => r.h || r.honoraires).sort((a, b) => b.marge - a.marge);
}

function viewTemps() {
  const f = filtreTemps;
  const entrees = [...data.temps].sort((a, b) => b.date.localeCompare(a.date))
    .filter(t => (!f.client || t.clientId === f.client) && (!f.mois || t.date.startsWith(f.mois)));
  const total = entrees.reduce((s, t) => s + num(t.duree), 0);
  const cout = num(data.settings.coutHoraire);
  const rent = rentabiliteParClient();
  const ch = data.chrono;
  const plansDe = cid => data.plans.filter(p => !cid || p.clientId === cid);
  return topbar('Temps & rentabilité', 'Le temps passé par client, comparé aux honoraires facturés',
    `<button class="btn btn-primary" data-action="temps-ajouter">+ Saisir du temps</button>`) + `
    <div class="panel chrono-panel">
      ${ch ? `<div><b>⏱ Chrono en cours : <span data-live="chrono">${heures(Math.round(dureeChrono() * 100) / 100)}</span></b>
          <div class="muted">${esc(clientById(ch.clientId)?.nom || '')}${ch.planId ? ' · ' + esc(planById(ch.planId)?.titre || '') : ''}${ch.description ? ' · ' + esc(ch.description) : ''}</div></div>
          <button class="btn btn-danger" data-action="chrono-stop">■ Arrêter et enregistrer</button>`
        : `<div class="form-grid chrono-form">
          <label>Client<select id="chrono-client">${data.clients.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</select></label>
          <label>Plan (facultatif)<select id="chrono-plan"><option value="">—</option>${plansDe('').map(p => `<option value="${p.id}">${esc(p.titre)} — ${esc(clientById(p.clientId)?.nom || '')}</option>`).join('')}</select></label>
          <label class="full">Tâche<input id="chrono-desc" placeholder="Ex. : création des visuels, réunion client…"></label>
        </div><button class="btn btn-gold" data-action="chrono-start" ${data.clients.length ? '' : 'disabled'}>▶ Démarrer le chrono</button>`}
    </div>
    ${cout ? '' : '<p class="hint">Indiquez le coût d\'une heure de travail dans <a href="#/parametres">Paramètres</a> (Facturation) pour calculer la marge réelle par client.</p>'}
    <div class="panel"><h3>Rentabilité par client</h3>
      ${rent.length ? `<div class="table-wrap flat"><table>
        <thead><tr><th>Client</th><th class="r">Honoraires facturés HT</th><th class="r">Encaissé</th><th class="r">Temps passé</th><th class="r">Coût du temps</th><th class="r">Marge</th><th class="r">Gain réel / heure</th></tr></thead>
        <tbody>${rent.map(r => `<tr><td><b>${esc(r.c.nom)}</b></td><td class="r num">${money(r.honoraires)}</td><td class="r num">${money(r.encaisse)}</td>
          <td class="r">${heures(r.h)}</td><td class="r num">${cout ? money(r.coutTemps) : '—'}</td>
          <td class="r num ${cout && r.marge < 0 ? 'txt-red' : ''}"><b>${cout ? money(r.marge) : '—'}</b></td><td class="r num">${r.h ? money(r.tauxReel) : '—'}</td></tr>`).join('')}</tbody>
      </table></div><p class="muted">Honoraires : lignes des factures émises, hors achat média refacturé, remise déduite. Gain réel / heure = honoraires ÷ heures passées.</p>`
      : '<p class="muted">Saisissez du temps et émettez des factures pour voir la rentabilité de chaque client.</p>'}
    </div>
    <div class="panel"><h3>Temps saisi <span class="n">${heures(total)} au total</span></h3>
      <div class="filters">
        <select data-temps-filtre="client"><option value="">Tous les clients</option>${data.clients.map(c => `<option value="${c.id}" ${f.client === c.id ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
        <input type="month" data-temps-filtre="mois" value="${esc(f.mois)}">
      </div>
      ${entrees.length ? `<div class="table-wrap flat"><table><thead><tr><th>Date</th><th>Client / plan</th><th>Tâche</th><th class="r">Durée</th><th></th></tr></thead>
        <tbody>${entrees.map(t => `<tr><td class="nowrap">${dateCourte(t.date)}</td><td>${esc(clientById(t.clientId)?.nom || '—')}<div class="muted">${esc(planById(t.planId)?.titre || '')}</div></td>
          <td>${esc(t.description)}</td><td class="r">${heures(num(t.duree))}</td>
          <td class="r nowrap"><button class="btn btn-sm" data-action="temps-modifier" data-id="${t.id}">Modifier</button> <button class="btn btn-sm btn-danger" data-action="temps-suppr" data-id="${t.id}">✕</button></td></tr>`).join('')}</tbody></table></div>`
        : '<p class="muted">Aucun temps saisi pour ces filtres.</p>'}
    </div>`;
}

function modalTemps(t) {
  const neuf = !t;
  t = t || { id: uid(), date: todayISO(), clientId: data.clients[0]?.id || '', planId: '', description: '', duree: 1 };
  openModal(`<h2>${neuf ? 'Saisir du temps' : 'Modifier le temps'}</h2>
    <form data-form="temps" data-id="${t.id}">
      <div class="form-grid">
        <label>Date<input type="date" name="date" value="${esc(t.date)}" required></label>
        <label>Durée (heures)<input type="number" name="duree" min="0.25" step="0.25" value="${esc(t.duree)}" required></label>
        <label>Client *<select name="clientId" required>${data.clients.map(c => `<option value="${c.id}" ${c.id === t.clientId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select></label>
        <label>Plan (facultatif)<select name="planId"><option value="">—</option>${data.plans.map(p => `<option value="${p.id}" ${p.id === t.planId ? 'selected' : ''}>${esc(p.titre)} — ${esc(clientById(p.clientId)?.nom || '')}</option>`).join('')}</select></label>
        <label class="full">Tâche<input name="description" value="${esc(t.description)}"></label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Enregistrer</button></div>
    </form>`);
}

// ---------- Équipe (Supabase) et portail client ----------
let infosEquipe = null; // membres et invitations chargés à la demande

function panneauEquipe() {
  const c = sync.config(), e = sync.etatSync();
  if (!c.url) return `
    <p class="muted">Pour travailler à plusieurs sur les mêmes données en temps réel et partager les plans avec vos clients (validation des publications, signature en ligne), reliez l'application à un projet <b>Supabase</b> gratuit, comme l'application POS. Sans cela, tout reste dans ce navigateur.</p>
    <ol class="muted steps-list">
      <li>Créez un projet sur <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>
      <li>Dans l'éditeur SQL du projet, exécutez le fichier <code>marketing/supabase/marketing.sql</code>.</li>
      <li>Copiez l'adresse du projet et la clé <b>anon</b> publique (Project Settings → API).</li>
    </ol>
    <div class="form-grid">
      <label>Adresse du projet<input id="sb-url" placeholder="https://xxxx.supabase.co"></label>
      <label>Clé anon publique<input id="sb-cle" placeholder="eyJ…"></label>
    </div>
    <div class="row-btns mt"><button class="btn btn-primary" data-action="sb-configurer">Relier au projet</button></div>`;
  if (!e.utilisateur) return `
    <p class="muted">Projet relié : ${esc(c.url)}. Connectez-vous, ou créez votre compte (chaque membre de l'équipe a le sien).</p>
    <div class="form-grid">
      <label>Email<input id="sb-email" type="email" autocomplete="username"></label>
      <label>Mot de passe<input id="sb-mdp" type="password" autocomplete="current-password"></label>
    </div>
    <div class="row-btns mt"><button class="btn btn-primary" data-action="sb-connexion">Se connecter</button><button class="btn" data-action="sb-inscription">Créer un compte</button>
      <button class="btn btn-sm" data-action="sb-oublier">Changer de projet</button></div>`;
  if (!e.espace) return `
    <p>Connecté : <b>${esc(e.utilisateur.email)}</b> <button class="btn btn-sm" data-action="sb-deconnexion">Se déconnecter</button></p>
    <div data-espaces><button class="btn" data-action="sb-espaces">Voir mes espaces</button></div>
    <div class="form-grid mt"><label>Nouvel espace (nom de l'agence)<input id="sb-espace-nom" value="${esc(data.settings.nom)}"></label></div>
    <div class="row-btns mt"><button class="btn btn-primary" data-action="sb-creer-espace">Créer l'espace avec mes données</button></div>
    <p class="muted">Un collègue invité retrouve l'espace dans « Voir mes espaces » après s'être connecté avec l'email invité.</p>`;
  const m = infosEquipe;
  const admin = m?.membres.some(x => x.user_id === e.utilisateur.id && x.role === 'admin');
  return `
    <p>Espace <b>${esc(e.espace.nom)}</b> · connecté en tant que <b>${esc(e.utilisateur.email)}</b> · <span class="sync-etat st-${e.statut}">${{ synchro: 'synchronisé ✓', envoi: 'envoi…', hors_ligne: 'hors ligne', erreur: 'erreur : ' + esc(e.erreur), connexion: 'connexion…' }[e.statut] || ''}</span></p>
    ${m ? `<div class="table-wrap flat"><table><thead><tr><th>Membre</th><th>Rôle</th><th></th></tr></thead><tbody>
      ${m.membres.map(x => `<tr><td>${esc(x.email || x.user_id)}</td><td>${x.role === 'admin' ? 'Administrateur' : 'Membre'}</td><td class="r">${admin && x.user_id !== e.utilisateur.id ? `<button class="btn btn-sm btn-danger" data-action="sb-retirer" data-id="${x.user_id}">Retirer</button>` : ''}</td></tr>`).join('')}
      ${m.invitations.map(x => `<tr><td>${esc(x.email)} <span class="muted">(invitation en attente)</span></td><td>${x.role === 'admin' ? 'Administrateur' : 'Membre'}</td><td class="r">${admin ? `<button class="btn btn-sm" data-action="sb-annuler-inv" data-email="${esc(x.email)}">Annuler</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>
    ${admin ? `<div class="form-grid mt"><label>Inviter (email)<input id="sb-inv-email" type="email"></label><label>Rôle<select id="sb-inv-role"><option value="membre">Membre</option><option value="admin">Administrateur</option></select></label></div>
      <div class="row-btns mt"><button class="btn btn-primary" data-action="sb-inviter">Inviter</button></div>
      <p class="muted">La personne crée son compte avec cet email (bouton « Créer un compte ») et rejoint l'espace automatiquement.</p>` : ''}`
    : '<button class="btn" data-action="sb-membres">Voir les membres</button>'}
    <div class="form-grid mt"><label class="full">Adresse publique du portail client (facultatif)<input data-sbind="urlPortail" value="${esc(data.settings.urlPortail || '')}" placeholder="https://mon-agence.netlify.app/"></label></div>
    <p class="muted">Le portail client (fichier <code>client.html</code>) doit être mis en ligne avec l'application (Netlify, Vercel, GitHub Pages…) pour que vos clients puissent ouvrir les liens de validation.</p>
    <div class="row-btns mt"><button class="btn" data-action="sb-quitter">Travailler hors espace</button><button class="btn" data-action="sb-deconnexion">Se déconnecter</button></div>`;
}

const majEquipe = () => { const z = document.querySelector('[data-equipe]'); if (z) z.innerHTML = panneauEquipe(); renderShell(current.nav || 'parametres'); };

async function actionEquipe(fn, ok) {
  try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok); majEquipe(); return r; }
  catch (e) { toast(sync.erreurLisible(e), 'err'); return null; }
}

async function ouvrirEspaceUI(espace) {
  const docs = (data.clients.length + data.plans.length + data.factures.length) > 0;
  const lancer = mode => actionEquipe(async () => {
    const r = await sync.ouvrirEspace(espace, data, mode);
    save(data); render();
    return r;
  }, r => `Espace « ${espace.nom} » ouvert : ${r.recus} document(s) reçu(s), ${r.envoyes} envoyé(s).`);
  if (!docs) return lancer('recevoir');
  openModal(`<h2>Ouvrir l'espace « ${esc(espace.nom)} »</h2>
    <p>Ce navigateur contient déjà des données. Que voulez-vous faire ?</p>
    <div class="modal-actions wrap">
      <button type="button" class="btn" data-action="close-modal">Annuler</button>
      <button type="button" class="btn" data-action="sb-ouvrir-mode" data-mode="recevoir">Remplacer par les données de l'espace</button>
      <button type="button" class="btn btn-primary" data-action="sb-ouvrir-mode" data-mode="envoyer">Ajouter mes données à l'espace</button>
    </div><p class="muted">Conseil : exportez d'abord une sauvegarde (Paramètres → Sauvegarde).</p>`, true);
  espaceEnAttente = { espace, lancer };
}
let espaceEnAttente = null;

// Réponse envoyée par un client depuis le portail.
function appliquerRetour(r) {
  const p = planById(r.plan_id);
  if (!p) return;
  normaliserPlan(p);
  const client = clientById(p.clientId)?.nom || 'Le client';
  if (r.type === 'publication') {
    const pub = p.publications.find(x => x.id === r.cible);
    if (!pub) return;
    pub.statut = r.statut === 'valide' ? 'valide' : 'brouillon';
    if (r.commentaire) pub.commentaire = `Client : ${r.commentaire}`;
    toast(`${client} : publication « ${pub.titre || pub.canal} » ${r.statut === 'valide' ? 'validée ✓' : 'à modifier'}.`);
  } else if (r.type === 'signature') {
    p.signature = { image: r.image, nom: r.nom, fonction: r.fonction || '', date: (r.cree_le || todayISO()).slice(0, 10), enLigne: true };
    p.statut = 'accepte';
    if (!p.datePresentation) p.datePresentation = todayISO();
    toast(`${client} a signé la proposition « ${p.titre} » ✓`);
  } else if (r.type === 'commentaire') {
    p.messagesClient = [...(p.messagesClient || []), { date: (r.cree_le || todayISO()).slice(0, 10), nom: r.nom || '', texte: r.commentaire || '' }];
    toast(`Nouveau message de ${client} sur « ${p.titre} ».`);
  }
  persist(true);
  rendreSiPossible();
}

// Ne pas redessiner pendant que l'utilisateur tape (perte du curseur) : on attend qu'il quitte le champ.
let renduEnAttente = false;
function rendreSiPossible() {
  const a = document.activeElement;
  if (a && $view.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { renduEnAttente = true; return; }
  if (!$modal.innerHTML) rerenderKeepScroll(); else renduEnAttente = true;
}
document.addEventListener('focusout', () => setTimeout(() => { if (renduEnAttente && !$modal.innerHTML && !$view.contains(document.activeElement)) { renduEnAttente = false; rerenderKeepScroll(); } }, 50));

function lienPortail(token) {
  const c = sync.config();
  const base = (data.settings.urlPortail || '').trim();
  if (!base) return '';
  return `${base.replace(/\/?(index\.html)?$/, '/')}client.html#t=${token}&u=${encodeURIComponent(c.url)}&k=${encodeURIComponent(c.cle)}`;
}

async function modalPartage(p) {
  if (!sync.etatSync().espace) {
    openModal(`<h2>Lien client</h2><p>Le partage avec le client nécessite un espace d'équipe en ligne (Supabase). Configurez-le dans Paramètres → Équipe & synchronisation.</p>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button><a class="btn btn-primary" href="#/parametres">Paramètres</a></div>`);
    return;
  }
  let liens = [];
  try { liens = await sync.listerPartages(p.id); } catch (e) { toast(sync.erreurLisible(e), 'err'); return; }
  const actifs = liens.filter(l => l.actif && l.expire_le > new Date().toISOString());
  const c = clientById(p.clientId) || {};
  const tel = String(c.telephone || '').replace(/\D/g, '');
  openModal(`<h2>Partager avec le client</h2>
    <p class="muted">Le client ouvre le lien sur son téléphone : il voit la proposition, peut la <b>signer</b>, et <b>valider ou commenter</b> chaque publication du calendrier. Ses réponses arrivent ici automatiquement.</p>
    ${data.settings.urlPortail ? '' : '<p class="hint">Indiquez d\'abord l\'adresse publique du portail dans Paramètres → Équipe & synchronisation.</p>'}
    ${actifs.length ? actifs.map(l => { const u = lienPortail(l.token); return `<div class="lien-partage">
      <input readonly value="${esc(u || l.token)}" onclick="this.select()"><div class="row-btns">
      <button class="btn btn-sm" data-action="partage-copier" data-lien="${esc(u)}">Copier</button>
      ${tel && u ? `<a class="btn btn-sm btn-primary" target="_blank" rel="noopener" href="https://wa.me/${tel}?text=${encodeURIComponent(`Bonjour${c.contact ? ' ' + c.contact : ''}, voici votre espace pour consulter et valider le plan « ${p.titre} » : ${u}`)}">WhatsApp</a>` : ''}
      <button class="btn btn-sm btn-danger" data-action="partage-desactiver" data-token="${esc(l.token)}">Désactiver</button></div>
      <div class="muted">Valable jusqu'au ${dateCourte(l.expire_le.slice(0, 10))}</div></div>`; }).join('') : '<p>Aucun lien actif.</p>'}
    <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Fermer</button><button type="button" class="btn btn-primary" data-action="partage-creer">Créer un nouveau lien</button></div>`, true);
}

// ---------- Import / export d'une fiche entreprise ----------
let ficheImportee = null;

// Complète les champs vides de « cible » avec ceux de « source » (objets imbriqués compris).
function completerVides(cible, source) {
  let n = 0;
  for (const [k, v] of Object.entries(source || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && cible[k] && typeof cible[k] === 'object' && !Array.isArray(cible[k])) n += completerVides(cible[k], v);
    else if (Array.isArray(v)) { if (!Array.isArray(cible[k]) || !cible[k].length) { if (v.length) { cible[k] = v; n++; } } }
    else if ((cible[k] === '' || cible[k] === null || cible[k] === undefined || cible[k] === 0) && v !== '' && v !== null && v !== undefined) { cible[k] = v; n++; }
  }
  return n;
}

function importerFiche(json) {
  if (json?.type !== 'fiche-entreprise' || !json.client?.nom) throw new Error('format');
  const c = normaliserFiche(structuredClone(json.client));
  if (!SECTEURS[c.secteur]) c.secteur = 'autre';
  ficheImportee = c;
  const existant = data.clients.find(x => x.nom.trim().toLowerCase() === c.nom.trim().toLowerCase());
  if (!existant) return importerFicheChoix('nouvelle');
  openModal(`<h2>« ${esc(c.nom)} » existe déjà</h2>
    <p>Voulez-vous compléter la fiche existante avec les informations du fichier, ou créer une seconde entreprise ?</p>
    <div class="modal-actions wrap"><button type="button" class="btn" data-action="close-modal">Annuler</button>
      <button type="button" class="btn" data-action="import-fiche-nouvelle">Créer une seconde fiche</button>
      <button type="button" class="btn btn-primary" data-action="import-fiche-maj">Compléter la fiche existante</button></div>`);
}

function importerFicheChoix(mode) {
  const c = ficheImportee;
  if (!c) return;
  ficheImportee = null;
  if (mode === 'maj') {
    const ex = normaliserFiche(data.clients.find(x => x.nom.trim().toLowerCase() === c.nom.trim().toLowerCase()));
    const n = completerVides(ex, { ...c, id: undefined });
    // Recherche sur internet du fichier : reprise si elle est plus récente.
    if (c.fiche.web && (!ex.fiche.web || c.fiche.web.date >= ex.fiche.web.date)) ex.fiche.web = c.fiche.web;
    if (c.fiche.recherche && !ex.fiche.recherche.includes(c.fiche.recherche)) ex.fiche.recherche = [ex.fiche.recherche, c.fiche.recherche].filter(Boolean).join('\n\n');
    persist(true); closeModal(); go(`#/client/${ex.id}`); toast(`Fiche complétée : ${n} information(s) ajoutée(s).`);
  } else {
    c.id = uid();
    data.clients.push(c);
    persist(true); closeModal(); go(`#/client/${c.id}`); toast(`Entreprise « ${c.nom} » importée.`);
  }
}

// ---------- Factures ----------
const factureEnRetard = f => ['envoyee', 'partielle'].includes(f.statut) && f.echeance < todayISO();

function modalRecurrence(f) {
  const r = f.recurrence || { actif: true, frequence: 'mensuelle', prochaine: dateSuivante(f.date, 'mensuelle'), fin: '', objet: f.objet };
  openModal(`<h2>Facturation récurrente — ${esc(f.numero)}</h2>
    <form data-form="recurrence" data-id="${f.id}">
      <p class="muted">Pour les prestations facturées régulièrement (gestion des réseaux sociaux, abonnement…). À chaque échéance, l'application prépare automatiquement une nouvelle facture en brouillon, identique à celle-ci, à valider puis envoyer.</p>
      <label class="check"><input type="checkbox" name="actif" ${r.actif ? 'checked' : ''}> Facturation récurrente active</label>
      <div class="form-grid mt">
        <label>Fréquence<select name="frequence">${Object.entries(FREQUENCES).map(([k, l]) => `<option value="${k}" ${r.frequence === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Prochaine facture le<input type="date" name="prochaine" value="${esc(r.prochaine)}" required></label>
        <label>Jusqu'au (facultatif)<input type="date" name="fin" value="${esc(r.fin)}"></label>
        <label>Objet des factures<input name="objet" value="${esc(r.objet || f.objet)}"></label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Enregistrer</button></div>
    </form>`, true);
}

function verifierRecurrentes() {
  const crees = genererRecurrentes(data.factures, nouveauNumero);
  if (crees.length) { persist(true); toast(`${crees.length} facture(s) récurrente(s) préparée(s) en brouillon : à valider dans Factures.`); }
  return crees;
}

function viewFactures() {
  const fl = filtres.factures;
  const list = [...data.factures].sort((a, b) => (b.date + b.numero).localeCompare(a.date + a.numero))
    .filter(f => (!fl.statut || (fl.statut === 'retard' ? factureEnRetard(f) : f.statut === fl.statut))
      && contient(`${f.numero} ${f.objet} ${clientById(f.clientId)?.nom || ''}`, fl.q));
  const tot = list.filter(f => f.statut !== 'annulee').reduce((a, f) => { const t = totauxFacture(f); a.total += t.total; a.reste += f.statut === 'brouillon' ? 0 : t.reste; return a; }, { total: 0, reste: 0 });
  return topbar('Factures', 'Générées à partir des plans présentés',
    `<button class="btn" data-action="new-facture-libre">+ Facture libre</button>`) +
    (data.factures.length ? barreFiltres('factures', { ...STATUTS_FACT, retard: 'En retard de paiement' }) : '') +
    (list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Échéance</th><th class="r">Total TTC</th><th class="r">Reste</th><th>Statut</th></tr></thead>
      <tbody>${list.map(f => {
        const t = totauxFacture(f);
        const late = !['payee', 'annulee', 'brouillon'].includes(f.statut) && f.echeance < todayISO();
        return `<tr class="rowlink" data-href="#/facture/${f.id}">
          <td><b>${esc(f.numero)}</b>${f.recurrence?.actif ? ' <span title="Facturation récurrente">↻</span>' : ''}<div class="muted">${esc(f.objet || '')}</div></td>
          <td>${esc(clientById(f.clientId)?.nom || '—')}</td><td>${dateCourte(f.date)}</td>
          <td class="${late ? 'txt-red' : ''}">${dateCourte(f.echeance)}</td>
          <td class="r num">${money(t.total)}</td><td class="r num">${f.statut === 'annulee' ? '—' : money(t.reste)}</td>
          <td>${badge(f.statut, STATUTS_FACT)}${late ? ' <span class="badge st-refuse">En retard</span>' : ''}</td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="4" class="r"><b>${list.length} facture(s)</b></td><td class="r num"><b>${money(tot.total)}</b></td><td class="r num"><b>${money(tot.reste)}</b></td><td></td></tr></tfoot></table></div>`
      : `<div class="panel muted">${data.factures.length ? 'Aucune facture ne correspond à ces filtres.' : 'Aucune facture. Ouvrez un plan, présentez-le puis cliquez sur « Générer la facture ».'}</div>`);
}

function viewFacture(f) {
  const s = data.settings;
  const c = clientById(f.clientId) || {};
  const p = planById(f.planId);
  const t = totauxFacture(f);
  const edit = f.statut === 'brouillon';
  const fb = (path, val, attrs = '') => `<input data-fbind="${path}" value="${esc(val)}" ${attrs}>`;
  const fn = (path, val) => `<input data-fbind="${path}" data-type="num" type="number" step="any" value="${esc(val)}">`;

  const actions = `<a class="btn" href="#/factures">← Factures</a>
    <button class="btn" data-action="print">🖨 Imprimer / PDF</button>
    ${edit ? `<button class="btn btn-danger" data-action="del-facture" data-id="${f.id}">Supprimer</button>
      <button class="btn btn-primary" data-action="emettre-facture" data-id="${f.id}">Valider et émettre</button>` : ''}
    ${['envoyee', 'partielle'].includes(f.statut) ? `<button class="btn" data-action="relance" data-id="${f.id}">✉ Relancer</button>` : ''}
    <button class="btn" data-action="dup-facture" data-id="${f.id}" title="Pour facturer à nouveau (ex. mois suivant)">⧉ Dupliquer</button>
    ${f.statut !== 'annulee' && !f.recurrenteDe ? `<button class="btn ${f.recurrence?.actif ? 'btn-gold' : ''}" data-action="recurrence" data-id="${f.id}">↻ ${f.recurrence?.actif ? 'Récurrente' : 'Rendre récurrente'}</button>` : ''}
    ${['envoyee', 'partielle'].includes(f.statut) ? `<button class="btn btn-gold" data-action="paiement" data-id="${f.id}">Enregistrer un paiement</button>
      <button class="btn btn-danger" data-action="annuler-facture" data-id="${f.id}">Annuler</button>` : ''}`;

  return topbar(`Facture ${esc(f.numero)}`, `${badge(f.statut, STATUTS_FACT)}${p ? ` · Plan : <a href="#/plan/${p.id}/presentation">${esc(p.titre)}</a>` : ''}${edit ? ' · <b>Brouillon modifiable</b> — validez pour l\'émettre.' : ''}`, actions) + `
  <article class="doc invoice ${edit ? 'editing' : ''}">
    ${f.statut === 'annulee' ? '<div class="stamp red">ANNULÉE</div>' : f.statut === 'payee' ? '<div class="stamp">PAYÉE</div>' : ''}
    <div class="inv-head">
      <div>${s.logo ? `<img src="${esc(s.logo)}" class="doc-logo" alt="">` : ''}
        <div class="inv-from"><b>${esc(s.nom)}</b>${s.adresse ? `<br>${esc(s.adresse)}` : ''}${s.telephone ? `<br>${esc(s.telephone)}` : ''}${s.email ? `<br>${esc(s.email)}` : ''}${s.nif ? `<br>NIF : ${esc(s.nif)}` : ''}</div></div>
      <div class="inv-title"><h1>FACTURE</h1>
        <table class="kv">
          <tr><td>N°</td><td><b>${esc(f.numero)}</b></td></tr>
          <tr><td>Date</td><td>${edit ? fb('date', f.date, 'type="date"') : dateFr(f.date)}</td></tr>
          <tr><td>Échéance</td><td>${edit ? fb('echeance', f.echeance, 'type="date"') : dateFr(f.echeance)}</td></tr>
        </table></div>
    </div>
    <div class="inv-to"><span>Facturé à</span><b>${esc(c.nom || '')}</b>${c.contact ? `<br>À l'attention de ${esc(c.contact)}` : ''}${c.adresse ? `<br>${esc(c.adresse)}` : ''}${c.telephone ? `<br>${esc(c.telephone)}` : ''}${c.email ? `<br>${esc(c.email)}` : ''}${c.nif ? `<br>NIF : ${esc(c.nif)}` : ''}</div>
    <div class="inv-objet"><span>Objet :</span> ${edit ? fb('objet', f.objet) : esc(f.objet)}</div>
    <table class="doc-table inv-lines">
      <thead><tr><th>Description</th><th class="r" style="width:80px">Qté</th><th class="r" style="width:150px">Prix unitaire</th><th class="r" style="width:150px">Montant</th>${edit ? '<th class="no-print" style="width:40px"></th>' : ''}</tr></thead>
      <tbody>${f.lignes.map((l, i) => `<tr>
        <td>${edit ? fb(`lignes.${i}.description`, l.description) : esc(l.description)}</td>
        <td class="r">${edit ? fn(`lignes.${i}.qte`, l.qte) : fmt(l.qte).replace(/,00$/, '')}</td>
        <td class="r num">${edit ? fn(`lignes.${i}.pu`, l.pu) : money(l.pu)}</td>
        <td class="r num" data-live="ligne-${i}">${money(num(l.qte) * num(l.pu))}</td>
        ${edit ? `<td class="no-print"><button class="btn btn-sm btn-danger" data-action="del-fligne" data-i="${i}">✕</button></td>` : ''}</tr>`).join('')}</tbody>
    </table>
    ${edit ? '<button class="btn btn-sm no-print" data-action="add-fligne">+ Ajouter une ligne</button>' : ''}
    <div class="inv-totals"><table>
      <tr><td>Sous-total</td><td class="r num" data-live="f-sous">${money(t.sousTotal)}</td></tr>
      ${edit || t.remise ? `<tr><td>Remise ${edit ? `(${fn('remisePct', f.remisePct)} %)` : `(${fmt(f.remisePct).replace(/,00$/, '')} %)`}</td><td class="r num" data-live="f-remise">− ${money(t.remise)}</td></tr>` : ''}
      <tr><td>Taxe / TCA ${edit ? `(${fn('tvaPct', f.tvaPct)} %)` : `(${fmt(f.tvaPct).replace(/,00$/, '')} %)`}</td><td class="r num" data-live="f-tva">${money(t.tva)}</td></tr>
      <tr class="grand"><td>Total TTC</td><td class="r num" data-live="f-total">${money(t.total)}</td></tr>
      ${t.paye ? `<tr><td>Déjà payé</td><td class="r num">− ${money(t.paye)}</td></tr><tr class="grand"><td>Reste à payer</td><td class="r num">${money(t.reste)}</td></tr>` : ''}
    </table></div>
    ${(f.paiements || []).length ? `<div class="inv-pay"><h4>Paiements reçus</h4>${f.paiements.map(pm => `<div>${dateCourte(pm.date)} — ${money(pm.montant)} (${esc(pm.mode)})${pm.ref ? ` · réf. ${esc(pm.ref)}` : ''}</div>`).join('')}</div>` : ''}
    ${blocPaiement(f)}
    <div class="inv-notes">${edit ? `<label>Conditions / notes<textarea data-fbind="notes" rows="3">${esc(f.notes)}</textarea></label>` : f.notes ? `<p>${nl2br(f.notes)}</p>` : ''}</div>
    ${s.mentions ? `<footer class="doc-foot">${nl2br(s.mentions)}</footer>` : ''}
  </article>`;
}

function updateLiveFacture(f) {
  const t = totauxFacture(f);
  const set = (k, html) => { const el = document.querySelector(`[data-live="${k}"]`); if (el) el.innerHTML = html; };
  f.lignes.forEach((l, i) => set(`ligne-${i}`, money(num(l.qte) * num(l.pu))));
  set('f-sous', money(t.sousTotal)); set('f-remise', '− ' + money(t.remise)); set('f-tva', money(t.tva)); set('f-total', money(t.total));
}

function modalPaiement(f) {
  const t = totauxFacture(f);
  openModal(`<h2>Paiement — ${esc(f.numero)}</h2>
    <form data-form="paiement" data-id="${f.id}">
      <p class="muted">Reste à payer : <b>${money(t.reste)}</b></p>
      <div class="form-grid">
        <label>Montant<input type="number" name="montant" step="any" min="0.01" value="${t.reste.toFixed(2)}" required></label>
        <label>Date<input type="date" name="date" value="${todayISO()}"></label>
        <label>Mode<select name="mode">${['Espèces', 'Virement', 'MonCash', 'NatCash', 'Chèque', 'Carte'].map(m => `<option>${m}</option>`).join('')}</select></label>
        <label>Référence<input name="ref"></label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Enregistrer</button></div>
    </form>`);
}

function modalFactureLibre() {
  if (!data.clients.length) { modalClient(); toast('Ajoutez d\'abord l\'entreprise cliente.'); return; }
  openModal(`<h2>Facture libre</h2>
    <form data-form="facture-libre">
      <label>Entreprise cliente<select name="clientId">${data.clients.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</select></label>
      <label>Objet<input name="objet" value="Prestations marketing" required></label>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Créer</button></div>
    </form>`);
}

// ---------- Paramètres ----------
function viewParametres() {
  const s = data.settings;
  const sb = (k, label, attrs = '', cls = '') => `<label class="${cls}">${label}<input data-sbind="${k}" value="${esc(s[k])}" ${attrs}></label>`;
  return topbar('Paramètres', 'Informations de votre agence, reprises sur les plans et les factures') + `
    <div class="panel"><h3>Votre agence / entreprise</h3>
      <div class="form-grid">
        ${sb('nom', 'Nom', '', 'full')}
        ${sb('adresse', 'Adresse', '', 'full')}
        ${sb('telephone', 'Téléphone')}${sb('email', 'Email', 'type="email"')}
        ${sb('nif', 'NIF / N° fiscal')}
        <label>Logo<input type="file" accept="image/*" data-action-change="logo">${s.logo ? `<span class="logo-row"><img src="${esc(s.logo)}" alt=""><button class="btn btn-sm" data-action="del-logo">Retirer</button></span>` : ''}</label>
      </div></div>
    <div class="panel"><h3>Facturation</h3>
      <div class="form-grid">
        ${sb('devise', 'Devise', 'placeholder="HTG, USD, EUR…"')}
        ${sb('tvaPct', 'Taxe par défaut (%)', 'type="number" step="any" data-type="num"')}
        ${sb('prefixeFacture', 'Préfixe des numéros de facture')}
        ${sb('prochainNumero', 'Prochain numéro', 'type="number" min="1" data-type="num"')}
        ${sb('delaiPaiement', 'Délai de paiement (jours)', 'type="number" min="0" data-type="num"')}
        ${sb('delaiPreparation', 'Préparer les visuels combien de jours avant publication', 'type="number" min="0" max="14" data-type="num"')}
        ${sb('coutHoraire', `Coût d'une heure de travail (${esc(s.devise)}) — pour la rentabilité`, 'type="number" min="0" step="any" data-type="num"')}
        <label class="full">Conditions de paiement par défaut<textarea data-sbind="conditions" rows="2">${esc(s.conditions)}</textarea></label>
        <label>MonCash (numéro)<input data-sbind="paiement.moncash" value="${esc(s.paiement?.moncash)}" placeholder="+509 …"></label>
        <label>NatCash (numéro)<input data-sbind="paiement.natcash" value="${esc(s.paiement?.natcash)}" placeholder="+509 …"></label>
        <label class="full">Virement bancaire (banque, nom du compte, numéro)<input data-sbind="paiement.banque" value="${esc(s.paiement?.banque)}"></label>
        <label class="full">Lien de paiement en ligne (facultatif : PayPal, Stripe, lien de votre banque…)<input data-sbind="paiement.lien" value="${esc(s.paiement?.lien)}" placeholder="https://…"></label>
        <p class="full muted">Ces coordonnées apparaissent sur chaque facture avec un QR code, et dans les messages de relance.</p>
        <label class="full">Mentions en bas de facture (coordonnées bancaires, MonCash…)<textarea data-sbind="mentions" rows="2">${esc(s.mentions)}</textarea></label>
      </div></div>
    <div class="panel" id="panneau-equipe"><h3>Équipe & synchronisation</h3><div data-equipe>${panneauEquipe()}</div></div>
    <div class="panel"><h3>Recherche par IA</h3>
      <p class="muted">Permet au bouton « Rechercher avec l'IA » de la fiche entreprise de chercher les informations publiques sur le web (modèle Claude d'Anthropic).</p>
      <ol class="muted steps-list">
        <li>Créez un compte sur <a href="https://console.anthropic.com/" target="_blank" rel="noopener">console.anthropic.com</a> et ajoutez du crédit (paiement à l'usage).</li>
        <li>Dans « API Keys », créez une clé et collez-la ci-dessous.</li>
        <li>Conseillé : fixez une limite de dépense mensuelle dans la console.</li>
      </ol>
      <div class="form-grid">
        <label class="full">Clé API Anthropic<input type="password" autocomplete="off" data-sbind="cleApi" value="${esc(s.cleApi)}" placeholder="sk-ant-…"></label>
      </div>
      <p class="hint">La clé est enregistrée uniquement dans ce navigateur et n'est jamais incluse dans les sauvegardes exportées. N'enregistrez pas votre clé sur un ordinateur partagé. Chaque recherche est facturée à l'usage ; son coût estimé s'affiche à la fin.</p>
    </div>
    <div class="panel"><h3>Catalogue de prestations</h3>
      <p class="muted">Vos prestations et tarifs habituels : ajoutez-les en un clic dans les honoraires d'un plan.</p>
      <div class="table-wrap flat"><table class="edit">
        <thead><tr><th>Prestation</th><th style="width:170px">Prix unitaire (${esc(s.devise)})</th><th></th></tr></thead>
        <tbody>${(s.catalogue || []).map((c, i) => `<tr>
          <td><input data-sbind="catalogue.${i}.description" value="${esc(c.description)}"></td>
          <td><input data-sbind="catalogue.${i}.pu" data-type="num" type="number" min="0" step="any" value="${esc(c.pu)}"></td>
          <td><button class="btn btn-sm btn-danger" data-action="del-catalogue" data-i="${i}">✕</button></td></tr>`).join('')}</tbody>
      </table></div>
      <button class="btn btn-sm" data-action="add-catalogue-ligne">+ Ajouter une prestation</button>
    </div>
    <div class="panel"><h3>Sauvegarde</h3>
      <p class="muted">Les données sont enregistrées dans ce navigateur. Exportez régulièrement une sauvegarde, ou pour transférer vers un autre ordinateur.</p>
      <div class="topbar-actions">
        <button class="btn" data-action="export">⇩ Exporter (JSON)</button>
        <label class="btn">⇧ Importer<input type="file" accept="application/json,.json" data-action-change="import" hidden></label>
        <button class="btn btn-danger" data-action="reset">Tout effacer</button>
      </div></div>`;
}

// ---------- Routeur ----------
let current = {};
function render() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const [route, id, sub] = parts;
  current = {};
  let html, nav = route || 'dashboard';
  if (route === 'clients') html = viewClients();
  else if (route === 'plans') { html = viewPlans(); if (id === 'nouveau') setTimeout(() => modalNouveauPlan(), 0); }
  else if (route === 'plan' && planById(id)) {
    const p = normaliserPlan(planById(id)); nav = 'plans'; current.plan = p;
    html = sub === 'presentation' ? viewPresentation(p) : sub === 'rapport' ? viewRapport(p, parts[3]) : viewPlanEditor(p, sub || 'infos');
  }
  else if (route === 'actions') { data.plans.forEach(normaliserPlan); html = viewActions(); }
  else if (route === 'execution') { data.plans.forEach(normaliserPlan); html = vueExecution(id || ''); }
  else if (route === 'factures') html = viewFactures();
  else if (route === 'temps') html = viewTemps();
  else if (route === 'facture' && factureById(id)) { nav = 'factures'; current.facture = factureById(id); html = viewFacture(current.facture); }
  else if (route === 'client' && clientById(id)) { nav = 'clients'; current.client = normaliserFiche(clientById(id)); html = viewFiche(current.client); }
  else if (route === 'parametres') html = viewParametres();
  else { nav = 'dashboard'; html = viewDashboard(); }
  current.nav = nav;
  renderShell(nav);
  $view.innerHTML = html;
  initSignature();
  initQR();
  document.body.classList.toggle('menu-open', false);
}

function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

// ---------- Événements ----------
document.addEventListener('click', e => {
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a,button,input,select')) { go(row.dataset.href); return; }
  const lien = e.target.closest('[data-relance]');
  if (lien) {
    const txt = encodeURIComponent(document.getElementById('relance-msg')?.value || '');
    const base = lien.href.split('?')[0];
    lien.href = lien.dataset.relance === 'wa' ? `${base}?text=${txt}` : `${base}?subject=${encodeURIComponent(lien.dataset.sujet)}&body=${txt}`;
    marquerRelance(lien.dataset.relance === 'wa' ? 'WhatsApp' : 'email');
    return;
  }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'close-modal-bg') { if (e.target === el) closeModal(); return; }
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const id = el.dataset.id;
  const p = current.plan, f = current.facture;

  switch (a) {
    case 'close-modal': closeModal(); break;
    case 'confirm-yes': { const fn = pendingConfirm; pendingConfirm = null; closeModal(); fn?.(); break; }
    case 'submit-form': handleForm(el.closest('form[data-form]')); break;
    case 'toggle-menu': document.body.classList.toggle('menu-open'); break;
    case 'print': window.print(); break;
    case 'demo': chargerDemo(); break;
    case 'edit-client': modalClient(id); break;
    case 'del-client': {
      const c = clientById(id);
      if (data.plans.some(x => x.clientId === id) || data.factures.some(x => x.clientId === id)) { toast('Cette entreprise a des plans ou factures : supprimez-les d\'abord.', 'err'); break; }
      askConfirm(`Supprimer « ${c.nom} » ?`, () => { data.clients = data.clients.filter(x => x.id !== id); persist(true); render(); }, 'Supprimer');
      break;
    }
    case 'new-plan-for': modalNouveauPlan(id); break;
    case 'dup-plan': {
      const src = planById(id);
      const copy = { ...structuredClone(src), id: uid(), titre: src.titre + ' (copie)', statut: 'brouillon', datePresentation: '', creeLe: todayISO() };
      data.plans.push(copy); persist(true); go(`#/plan/${copy.id}/infos`); break;
    }
    case 'del-plan': {
      const src = planById(id);
      if (data.factures.some(x => x.planId === id && x.statut !== 'brouillon')) { toast('Ce plan a des factures émises : il ne peut pas être supprimé.', 'err'); break; }
      askConfirm(`Supprimer le plan « ${src.titre} » ?`, () => {
        data.plans = data.plans.filter(x => x.id !== id);
        data.factures = data.factures.filter(x => x.planId !== id);
        persist(true); render();
      }, 'Supprimer');
      break;
    }
    case 'repartir-budget': {
      const n = p.actions.length, total = num(p.budgetPrevu);
      askConfirm(`Répartir ${fmt(total)} ${data.settings.devise} à parts égales entre les ${n} actions ? Les budgets actuels seront remplacés.`, () => {
        const part = Math.floor(total / n / 100) * 100;
        p.actions.forEach((a, i) => { a.budget = i === 0 ? total - part * (n - 1) : part; });
        persist(true); rerenderKeepScroll(); toast('Budget réparti. Ajustez ensuite selon les priorités.');
      }, 'Répartir');
      break;
    }
    case 'add-catalogue': {
      const c = data.settings.catalogue[+el.dataset.i];
      p.honoraires.push({ description: c.description, qte: 1, pu: num(c.pu) }); persist(); rerenderKeepScroll(); break;
    }
    case 'add-catalogue-ligne': data.settings.catalogue.push({ description: '', pu: 0 }); persist(); rerenderKeepScroll(); break;
    case 'del-catalogue': data.settings.catalogue.splice(+el.dataset.i, 1); persist(); rerenderKeepScroll(); break;
    case 'relance': modalRelance(f); break;
    case 'copier-relance': {
      const ta = document.getElementById('relance-msg');
      ta.select();
      marquerRelance('copié');
      (navigator.clipboard?.writeText(ta.value) || Promise.reject()).then(() => toast('Message copié.'))
        .catch(() => toast('Texte sélectionné : faites Ctrl+C pour le copier.'));
      break;
    }
    case 'recurrence': modalRecurrence(f); break;
    case 'relance-dash': modalRelance(factureById(id)); break;
    case 'dup-facture': {
      const date = todayISO();
      const copy = { ...structuredClone(f), id: uid(), numero: nouveauNumero(date), date, echeance: addDays(date, num(data.settings.delaiPaiement)), statut: 'brouillon', montantPaye: 0, paiements: [] };
      data.factures.push(copy); persist(true); go(`#/facture/${copy.id}`); toast(`Facture ${copy.numero} créée (brouillon).`);
      break;
    }
    case 'ia-recherche': modalRechercheIA(clientById(id)); break;
    case 'ia-lancer': lancerRechercheIA(clientById(id), $modal.querySelector('[name=remplacer]')?.checked); break;
    case 'ia-annuler': rechercheEnCours?.abort(); break;
    case 'ia-section': proposerSection(p, el.dataset.section); break;
    case 'ia-tout-direct': if (rechercheEnAttente) proposerSection(rechercheEnAttente.p, 'tout', true); break;
    case 'ia-tout-recherche': {
      const pl = rechercheEnAttente?.p; if (!pl) break;
      rechercheWebAvant(clientById(pl.clientId)).then(ok => { if (ok) proposerSection(pl, 'tout', true); });
      break;
    }
    case 'web-reprendre': {
      const c = clientById(id);
      const modifs = fusionnerResultat(c, c.fiche.web.donnees, true);
      persist(true); render(); toast(`${modifs.length} champ(s) de la fiche mis à jour avec les infos trouvées sur internet.`);
      break;
    }
    case 'cal-mois': calMois[p.id] = moisDecale(calMois[p.id], +el.dataset.delta); rerenderKeepScroll(); break;
    case 'pub-nouvelle': modalPublication(p, nouvellePublication({ date: el.dataset.date || todayISO(), statut: 'brouillon' })); break;
    case 'pub-ouvrir': { const pub = p.publications.find(x => x.id === el.dataset.pid); if (pub) modalPublication(p, pub); break; }
    case 'pub-suppr': askConfirm('Supprimer cette publication ?', () => { p.publications = p.publications.filter(x => x.id !== el.dataset.pid); persist(true); rerenderKeepScroll(); }, 'Supprimer'); break;
    case 'pub-ia': redigerPublication(p); break;
    case 'pub-copier': {
      const form = el.closest('form');
      const txt = [form.elements.texte.value, form.elements.hashtags.value].filter(Boolean).join('\n\n');
      (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Texte copié : collez-le dans le réseau social.')).catch(() => { form.elements.texte.select(); toast('Texte sélectionné : faites Ctrl+C.'); });
      break;
    }
    case 'ia-calendrier': proposerCalendrier(p); break;
    case 'ia-cal-ajouter': {
      if (!propositionCal || propositionCal.planId !== p.id) break;
      const choix = [...$modal.querySelectorAll('input[name=pub]:checked')].map(i => propositionCal.pubs[+i.value]);
      choix.forEach(x => p.publications.push(nouvellePublication({ ...x, statut: 'brouillon' })));
      propositionCal = null; persist(true); closeModal(); rerenderKeepScroll(); toast(`${choix.length} publication(s) ajoutée(s) au calendrier.`);
      break;
    }
    case 'cal-imprimer': imprimerCalendrier(p); break;
    case 'exec-semaine': filtreExec.semaine = +el.dataset.delta ? ajouterJours(filtreExec.semaine || lundi(todayISO()), +el.dataset.delta) : lundi(todayISO()); rerenderKeepScroll(); break;
    case 'exec-publie': case 'exec-visuel': case 'exec-copier': case 'exec-modifier': {
      const pl = normaliserPlan(planById(el.dataset.plan)); const x = pl.publications.find(y => y.id === el.dataset.pid);
      if (!x) break;
      if (a === 'exec-publie') { x.statut = 'publie'; x.publieLe = new Date().toISOString(); persist(true); rerenderKeepScroll(); toast('Publication marquée comme publiée ✓'); }
      if (a === 'exec-visuel') { x.visuelPret = true; persist(true); rerenderKeepScroll(); toast('Visuel prêt ✓'); }
      if (a === 'exec-copier') { const txt = [x.texte, x.hashtags, x.lien].filter(Boolean).join('\n\n'); (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Texte copié : collez-le dans le réseau social.')).catch(() => toast('Copie impossible ici : ouvrez « Modifier » et copiez le texte.', 'err')); }
      if (a === 'exec-modifier') { current.plan = pl; modalPublication(pl, x); }
      break;
    }
    case 'exec-programme': {
      const txt = texteProgrammeDuJour(location.hash.split('/')[2] || '');
      openModal(`<h2>Programme du jour</h2><textarea id="relance-msg" rows="14">${esc(txt)}</textarea>
        <div class="modal-actions wrap"><button type="button" class="btn" data-action="copier-relance">Copier</button>
        <a class="btn btn-primary" data-relance="wa" href="https://wa.me/" target="_blank" rel="noopener">WhatsApp</a></div>`, true);
      relanceCourante = null;
      break;
    }
    case 'export-fiche': {
      const c = clientById(id);
      const blob = new Blob([JSON.stringify({ type: 'fiche-entreprise', version: 1, client: c }, null, 2)], { type: 'application/json' });
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(blob);
      lien.download = `fiche-${c.nom.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.json`;
      lien.click(); URL.revokeObjectURL(lien.href);
      break;
    }
    case 'import-fiche-maj': importerFicheChoix('maj'); break;
    case 'import-fiche-nouvelle': importerFicheChoix('nouvelle'); break;
    case 'sb-configurer': actionEquipe(() => sync.configurer(document.getElementById('sb-url').value, document.getElementById('sb-cle').value), 'Projet relié. Connectez-vous ou créez votre compte.'); break;
    case 'sb-connexion': case 'sb-inscription': {
      const email = document.getElementById('sb-email').value.trim(), mdp = document.getElementById('sb-mdp').value;
      if (!email || mdp.length < 6) { toast('Email et mot de passe (6 caractères minimum) requis.', 'err'); break; }
      actionEquipe(() => sync.seConnecter(email, mdp, a === 'sb-inscription'), r => r.confirmation ? 'Compte créé : confirmez votre email (lien reçu), puis connectez-vous.' : 'Connecté.');
      break;
    }
    case 'sb-oublier': localStorage.removeItem('lakouwon-marketing-sync'); location.reload(); break;
    case 'sb-deconnexion': actionEquipe(() => sync.seDeconnecter(), 'Déconnecté : les données restent dans ce navigateur.'); break;
    case 'sb-espaces': actionEquipe(async () => {
      const liste = await sync.listerEspaces();
      document.querySelector('[data-espaces]').innerHTML = liste.length ? `<div class="row-btns">${liste.map(x => `<button class="btn" data-action="sb-ouvrir" data-id="${x.id}" data-nom="${esc(x.nom)}">Ouvrir « ${esc(x.nom)} »</button>`).join('')}</div>` : '<p class="muted">Aucun espace pour ce compte.</p>';
    }); return;
    case 'sb-ouvrir': ouvrirEspaceUI({ id: el.dataset.id, nom: el.dataset.nom }); break;
    case 'sb-ouvrir-mode': if (espaceEnAttente) { closeModal(); espaceEnAttente.lancer(el.dataset.mode); espaceEnAttente = null; } break;
    case 'sb-creer-espace': {
      const nom = document.getElementById('sb-espace-nom').value.trim();
      if (!nom) { toast('Indiquez un nom.', 'err'); break; }
      actionEquipe(async () => { const esp = await sync.creerEspace(nom); const r = await sync.ouvrirEspace(esp, data, 'envoyer'); save(data); render(); return r; },
        r => `Espace créé : ${r.envoyes} document(s) envoyé(s). Invitez maintenant votre équipe.`);
      break;
    }
    case 'sb-membres': actionEquipe(async () => { infosEquipe = await sync.membres(); }); break;
    case 'sb-inviter': {
      const email = document.getElementById('sb-inv-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Email invalide.', 'err'); break; }
      actionEquipe(async () => { await sync.inviter(email, document.getElementById('sb-inv-role').value); infosEquipe = await sync.membres(); }, `Invitation enregistrée pour ${email}.`);
      break;
    }
    case 'sb-annuler-inv': actionEquipe(async () => { await sync.annulerInvitation(el.dataset.email); infosEquipe = await sync.membres(); }); break;
    case 'sb-retirer': askConfirm('Retirer ce membre de l\'espace ?', () => actionEquipe(async () => { await sync.retirerMembre(id); infosEquipe = await sync.membres(); }, 'Membre retiré.'), 'Retirer'); break;
    case 'sb-quitter': askConfirm('Travailler hors espace ? Les données restent dans ce navigateur mais ne seront plus synchronisées.', () => actionEquipe(() => sync.quitterEspace(), 'Mode local.'), 'Continuer'); break;
    case 'partage-client': modalPartage(planById(id) || p); break;
    case 'partage-creer': { const pl = p || planById($modal.querySelector('[data-plan]')?.dataset.plan); actionEquipe(() => sync.creerPartage(pl.id)).then(r => { if (r) modalPartage(pl); }); break; }
    case 'partage-desactiver': actionEquipe(() => sync.desactiverPartage(el.dataset.token), 'Lien désactivé.').then(() => modalPartage(p)); break;
    case 'partage-copier': (navigator.clipboard?.writeText(el.dataset.lien) || Promise.reject()).then(() => toast('Lien copié.')).catch(() => toast('Sélectionnez le lien et copiez-le.')); break;
    case 'temps-ajouter': if (!data.clients.length) { toast('Ajoutez d\'abord une entreprise cliente.', 'err'); break; } modalTemps(null); break;
    case 'temps-modifier': modalTemps(data.temps.find(t => t.id === id)); break;
    case 'temps-suppr': askConfirm('Supprimer ce temps ?', () => { data.temps = data.temps.filter(t => t.id !== id); persist(true); render(); }, 'Supprimer'); break;
    case 'chrono-start': {
      const planId = document.getElementById('chrono-plan').value;
      data.chrono = { debut: Date.now(), clientId: planId ? planById(planId).clientId : document.getElementById('chrono-client').value, planId, description: document.getElementById('chrono-desc').value.trim() };
      persist(true); render(); toast('Chrono démarré. Il continue même si vous changez de page ou fermez l\'application.');
      break;
    }
    case 'chrono-stop': {
      const ch = data.chrono;
      const duree = Math.max(0.25, Math.round(dureeChrono() * 4) / 4);
      data.temps.push({ id: uid(), date: todayISO(), clientId: ch.clientId, planId: ch.planId, description: ch.description || 'Travail', duree });
      data.chrono = null; persist(true); render(); toast(`${heures(duree)} enregistrée(s) (arrondi au quart d'heure).`);
      break;
    }
    case 'modele-choisir':
      openModal(`<h2>Appliquer un modèle de campagne</h2>
        <form data-form="modele" data-id="${p.id}">
          <div class="modele-liste">${Object.entries(MODELES).map(([k, m], i) => `<label class="check modele-opt"><input type="radio" name="modele" value="${k}" ${i === 0 ? 'checked' : ''}>
            <span><b>${esc(m.label)}</b><span class="muted">${m.actions.length} actions · ${m.objectifs.length} objectif(s) · durée conseillée ${m.mois} mois</span></span></label>`).join('')}</div>
          <label class="check"><input type="checkbox" name="remplacer"> Remplacer les objectifs et actions actuels (sinon : ajouter)</label>
          <p class="muted">Les actions sont placées dans la période du plan (${dateCourte(p.debut)} → ${dateCourte(p.fin)}) et le budget envisagé (${money(p.budgetPrevu)}) est réparti selon le modèle.</p>
          <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button type="button" class="btn btn-primary" data-action="submit-form">Appliquer</button></div>
        </form>`, true);
      break;
    case 'releve-ajouter': {
      const r = nouveauReleve(p);
      if (p.releves.some(x => x.mois === r.mois)) { toast('Ce mois est déjà relevé.', 'err'); break; }
      p.releves.push(r); persist(true); rerenderKeepScroll(); toast(`Relevé de ${libelleMois(r.mois)} ajouté : vérifiez les chiffres.`);
      break;
    }
    case 'rapport-partager': {
      const c = clientById(p.clientId) || {};
      const tel = String(c.telephone || '').replace(/\D/g, '');
      const txt = texteResumeRapport(p, el.dataset.mois);
      openModal(`<h2>Envoyer le résumé du mois</h2><textarea id="relance-msg" rows="12">${esc(txt)}</textarea>
        <p class="muted">Imprimez d'abord le rapport en PDF pour le joindre au message.</p>
        <div class="modal-actions wrap"><button type="button" class="btn" data-action="copier-relance">Copier</button>
        ${c.email ? `<a class="btn" data-relance="mail" data-sujet="Rapport ${esc(libelleMois(el.dataset.mois))}" href="mailto:${esc(c.email)}" target="_blank" rel="noopener">Email</a>` : ''}
        ${tel ? `<a class="btn btn-primary" data-relance="wa" href="https://wa.me/${tel}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>`, true);
      relanceCourante = null;
      break;
    }
    case 'ia-commentaire': {
      if (!demanderCle()) break;
      const mois = el.dataset.mois;
      avecProgression('Rédaction du commentaire du mois…', signal => genererLibre(data.settings.cleApi,
        `Rédige le commentaire du rapport mensuel de ${libelleMois(mois)} pour le client : lecture des chiffres du mois (relevé : ${JSON.stringify(releveTries(p).filter(r => r.mois <= mois).slice(-3))}), ce qui a bien fonctionné, ce qui sera ajusté, et les prochaines étapes. 5 à 8 phrases, ton professionnel et positif, sans inventer de chiffres.`,
        contexteIA(p), { commentaire: S.texte('Commentaire du mois.') }, signal, 'low')).then(res => {
        if (!res) return;
        const r = p.releves.find(x => x.mois === mois);
        r.commentaire = res.donnees.commentaire; persist(true); closeModal(); render(); toast(`Commentaire rédigé (coût estimé ${usd(res.cout)}). Relisez-le.`);
      });
      break;
    }
    case 'sig-vider': { const cv = document.getElementById('sig-pad'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); delete cv.dataset.vide; break; }
    case 'sig-valider': {
      const cv = document.getElementById('sig-pad');
      const nom = document.getElementById('sig-nom').value.trim();
      if (!nom) { toast('Indiquez le nom du signataire.', 'err'); document.getElementById('sig-nom').focus(); break; }
      if (cv.dataset.vide !== 'non') { toast('Le client doit signer dans le cadre.', 'err'); break; }
      const pl = planById(id);
      pl.signature = { image: cv.toDataURL('image/png'), nom, fonction: document.getElementById('sig-fonction').value.trim(), date: todayISO() };
      pl.statut = 'accepte';
      if (!pl.datePresentation) pl.datePresentation = todayISO();
      persist(true); render();
      if (totalHonoraires(pl) > 0) modalGenFacture(pl, true); else toast('Proposition signée et acceptée.');
      break;
    }
    case 'sig-effacer':
      askConfirm('Effacer la signature du client ? Le plan repassera au statut « Présenté ».', () => {
        const pl = planById(id); delete pl.signature; pl.statut = 'presente'; persist(true); render();
      }, 'Effacer');
      break;
    case 'ia-appliquer': appliquerProposition(p, el.dataset.mode); break;
    case 'importer-fiche': {
      const c = clientById(p.clientId);
      if (!completude(c)) { toast('La fiche de cette entreprise est vide : remplissez-la d\'abord.', 'err'); break; }
      const r = appliquerFiche(p, c, dureeMois(p));
      persist(true); rerenderKeepScroll();
      toast(`Fiche importée : ${r.swot} constat(s) SWOT, ${r.actions} action(s), ${r.objectifs} objectif(s) ajoutés.`);
      break;
    }
    case 'prefill': appliquerSuggestions(p, clientById(p.clientId)?.secteur); persist(); break;
    case 'add-row': {
      const list = el.dataset.list;
      const blank = {
        objectifs: { objectif: '', indicateur: '', cible: '', echeance: '' },
        cibles: { nom: '', description: '', besoins: '', canaux: '' },
        actions: { canal: '', action: '', description: '', debut: p.debut, fin: p.fin, budget: 0, responsable: '' },
        honoraires: { description: '', qte: 1, pu: 0 },
      }[list];
      p[list].push(blank); persist(); rerenderKeepScroll(); break;
    }
    case 'del-row': p[el.dataset.list].splice(+el.dataset.i, 1); persist(); rerenderKeepScroll(); break;
    case 'add-suggest': {
      const sug = suggestions(clientById(p.clientId)?.secteur)[el.dataset.kind][+el.dataset.i];
      const item = el.dataset.kind === 'actions' ? { ...sug, description: '', debut: p.debut, fin: p.fin, budget: 0, responsable: '' } : { ...sug };
      p[el.dataset.kind].push(item); persist(); rerenderKeepScroll(); break;
    }
    case 'plan-statut': {
      const pl = planById(id); pl.statut = el.dataset.statut;
      if (pl.statut === 'presente' && !pl.datePresentation) pl.datePresentation = todayISO();
      persist(true); render(); toast('Plan marqué comme présenté. Vous pouvez générer la facture.'); break;
    }
    case 'gen-facture': modalGenFacture(planById(id)); break;
    case 'new-facture-libre': modalFactureLibre(); break;
    case 'add-fligne': f.lignes.push({ description: '', qte: 1, pu: 0 }); persist(); rerenderKeepScroll(); break;
    case 'del-fligne': f.lignes.splice(+el.dataset.i, 1); persist(); rerenderKeepScroll(); break;
    case 'emettre-facture':
      if (!f.lignes.length || totauxFacture(f).total <= 0) { toast('La facture doit avoir un montant supérieur à 0.', 'err'); break; }
      askConfirm('Émettre la facture ? Elle ne sera plus modifiable.', () => { f.statut = 'envoyee'; persist(true); render(); }, 'Émettre');
      break;
    case 'del-facture':
      askConfirm('Supprimer ce brouillon de facture ?', () => { data.factures = data.factures.filter(x => x.id !== id); persist(true); go('#/factures'); }, 'Supprimer');
      break;
    case 'annuler-facture':
      askConfirm('Annuler cette facture ? Elle restera dans l\'historique avec le statut « Annulée ».', () => { f.statut = 'annulee'; persist(true); render(); }, 'Annuler la facture');
      break;
    case 'paiement': modalPaiement(f); break;
    case 'del-logo': data.settings.logo = ''; persist(true); render(); break;
    case 'export': {
      const copie = { ...data, settings: { ...data.settings, cleApi: '' } };
      const blob = new Blob([JSON.stringify(copie, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sauvegarde-marketing-${todayISO()}.json`;
      link.click(); URL.revokeObjectURL(link.href); break;
    }
    case 'reset':
      askConfirm('Effacer TOUTES les données (clients, plans, factures) de ce navigateur ?', () =>
        askConfirm('Confirmer : cette action est irréversible.', () => { data = defaultData(); persist(true); go('#/dashboard'); render(); }, 'Tout effacer'), 'Continuer');
      break;
  }
});

// Touche Entrée dans un champ : même traitement que le bouton de validation.
document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  handleForm(form);
});

function formValide(form) {
  for (const input of form.querySelectorAll('input,select,textarea')) {
    if (input.required && !String(input.value).trim()) {
      toast('Veuillez remplir tous les champs obligatoires (*).', 'err'); input.focus(); return false;
    }
    if (input.type === 'email' && input.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
      toast('Adresse email invalide.', 'err'); input.focus(); return false;
    }
  }
  return true;
}

function handleForm(form) {
  if (!form || !formValide(form)) return;
  const fd = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'client') {
    const id = form.dataset.id;
    const fields = { nom: fd.nom.trim(), secteur: fd.secteur, taille: fd.taille, contact: fd.contact, telephone: fd.telephone, email: fd.email, nif: fd.nif, adresse: fd.adresse, siteWeb: fd.siteWeb };
    if (id) { Object.assign(clientById(id), fields); persist(true); closeModal(); render(); toast('Entreprise enregistrée.'); return; }
    const c = normaliserFiche({ id: uid(), ...fields });
    data.clients.push(c); persist(true); closeModal();
    go(`#/client/${c.id}`); toast('Entreprise enregistrée. Remplissez sa fiche pour adapter les plans.');
  } else if (kind === 'plan') {
    if (fd.motif === 'autre' && !fd.motifDetail.trim()) { toast('Précisez la raison du plan.', 'err'); form.querySelector('[name=motifDetail]').focus(); return; }
    if (fd.fin < fd.debut) { toast('La date de fin doit être après la date de début.', 'err'); return; }
    const creer = () => { const p = nouveauPlan({ ...fd, prefill: !!fd.prefill }); data.plans.push(p); persist(true); closeModal(); go(`#/plan/${p.id}/infos`); };
    if (fd.rechercheWeb && data.settings.cleApi) rechercheWebAvant(normaliserFiche(clientById(fd.clientId))).then(ok => { creer(); if (!ok) toast('Recherche sur internet interrompue : plan créé sans ces informations.', 'err'); });
    else creer();
  } else if (kind === 'gen-facture') {
    if (!fd.honoraires && !fd.media) { toast('Cochez au moins un élément à facturer.', 'err'); return; }
    const f = creerFacture(planById(form.dataset.id), { honoraires: !!fd.honoraires, media: !!fd.media, mediaDetail: !!fd.mediaDetail, type: fd.type, acomptePct: fd.acomptePct, date: fd.date, delai: fd.delai });
    closeModal(); go(`#/facture/${f.id}`); toast(`Facture ${f.numero} créée (brouillon).`);
  } else if (kind === 'modele') {
    const p = planById(form.dataset.id);
    const n = appliquerModele(p, fd.modele, !!fd.remplacer);
    persist(true); closeModal(); rerenderKeepScroll(); toast(`Modèle appliqué : ${n} actions ajoutées. Ajustez dates et budgets si besoin.`);
  } else if (kind === 'temps') {
    const champs = { date: fd.date, duree: num(fd.duree), clientId: fd.planId ? planById(fd.planId).clientId : fd.clientId, planId: fd.planId, description: fd.description.trim() };
    const t = data.temps.find(x => x.id === form.dataset.id);
    if (t) Object.assign(t, champs); else data.temps.push({ id: form.dataset.id, ...champs });
    persist(true); closeModal(); render(); toast('Temps enregistré.');
  } else if (kind === 'publication') {
    const p = planById(form.dataset.plan);
    const champs = { date: fd.date, heure: fd.heure, canal: fd.canal.trim(), format: fd.format, titre: fd.titre.trim(), texte: fd.texte, visuel: fd.visuel, visuelPret: !!fd.visuelPret, hashtags: fd.hashtags, lien: fd.lien.trim(), responsable: fd.responsable.trim(), consignes: fd.consignes, statut: fd.statut, commentaire: fd.commentaire };
    const pub = p.publications.find(x => x.id === form.dataset.id);
    if (pub) Object.assign(pub, champs); else p.publications.push(nouvellePublication({ ...champs, id: form.dataset.id }));
    calMois[p.id] = fd.date.slice(0, 7);
    persist(true); closeModal(); rerenderKeepScroll(); toast('Publication enregistrée.');
  } else if (kind === 'recurrence') {
    const f = factureById(form.dataset.id);
    f.recurrence = { actif: !!fd.actif, frequence: fd.frequence, prochaine: fd.prochaine, fin: fd.fin, objet: fd.objet.trim() || f.objet };
    persist(true); closeModal(); verifierRecurrentes(); render();
    if (!data.factures.some(x => x.recurrenteDe === f.id && x.statut === 'brouillon')) toast(f.recurrence.actif ? `Prochaine facture le ${dateCourte(f.recurrence.prochaine)}.` : 'Facturation récurrente désactivée.');
  } else if (kind === 'paiement') {
    const f = factureById(form.dataset.id);
    const montant = num(fd.montant);
    if (montant <= 0) return;
    f.paiements = f.paiements || [];
    f.paiements.push({ date: fd.date, montant, mode: fd.mode, ref: fd.ref });
    f.montantPaye = num(f.montantPaye) + montant;
    f.statut = totauxFacture(f).reste <= 0.005 ? 'payee' : 'partielle';
    persist(true); closeModal(); render(); toast('Paiement enregistré.');
  } else if (kind === 'facture-libre') {
    const s = data.settings, date = todayISO();
    const f = {
      id: uid(), numero: nouveauNumero(date),
      planId: '', clientId: fd.clientId, date, echeance: addDays(date, num(s.delaiPaiement)), objet: fd.objet,
      lignes: [{ description: '', qte: 1, pu: 0 }], remisePct: 0, tvaPct: num(s.tvaPct), montantPaye: 0, paiements: [], statut: 'brouillon', notes: s.conditions || '',
    };
    data.factures.push(f); persist(true); closeModal(); go(`#/facture/${f.id}`);
  }
}

function onInput(e) {
  const el = e.target;
  if (el.dataset.releveCommentaire && current.plan) {
    const r = current.plan.releves.find(x => x.mois === el.dataset.releveCommentaire);
    if (r) { r.commentaire = el.value; persist(); }
    return;
  }
  if (el.dataset.filter) {
    const [liste, cle] = el.dataset.filter.split('.');
    filtres[liste][cle] = el.value;
    const pos = el.selectionStart;
    render();
    // Garder le curseur dans le champ de recherche pendant la saisie.
    const again = document.querySelector(`[data-filter="${el.dataset.filter}"]`);
    if (again && el.type === 'search') { again.focus(); try { again.setSelectionRange(pos, pos); } catch { /* ignoré */ } }
    return;
  }
  const val = el.dataset.type === 'num' ? num(el.value) : el.dataset.type === 'bool' ? el.checked : el.value;
  if (el.dataset.bind && current.plan) {
    setPath(current.plan, el.dataset.bind, val);
    persist(); updateLive(current.plan);
  } else if (el.dataset.fbind && current.facture) {
    setPath(current.facture, el.dataset.fbind, val);
    persist(); updateLiveFacture(current.facture);
  } else if (el.dataset.cbind && current.client) {
    if (el.dataset.list) {
      const arr = getPath(current.client, el.dataset.cbind);
      const i = arr.indexOf(el.dataset.list);
      if (el.checked && i < 0) arr.push(el.dataset.list); else if (!el.checked && i >= 0) arr.splice(i, 1);
    } else setPath(current.client, el.dataset.cbind, val);
    current.client.fiche.majLe = todayISO();
    persist(); updateLiveFiche(current.client);
  } else if (el.dataset.sbind) {
    setPath(data.settings, el.dataset.sbind, val);
    persist();
    if (el.dataset.sbind === 'nom') renderShell('parametres');
  }
}
document.addEventListener('input', onInput);

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind === 'clientId') { onInput(e); return; }
  // Nouveau plan : le modèle choisi propose son motif et sa durée.
  if (el.name === 'modele' && el.closest('form[data-form="plan"]')) {
    const m = MODELES[el.value], form = el.form;
    if (m) { form.elements.motif.value = m.motif; form.elements.fin.value = addMonths(form.elements.debut.value, m.mois); }
    return;
  }
  if (el.dataset.execFiltre) { filtreExec[el.dataset.execFiltre] = el.value; render(); return; }
  if (el.hasAttribute('data-exec-plan')) { go(el.value ? `#/execution/${el.value}` : '#/execution'); return; }
  if (el.dataset.tempsFiltre) { filtreTemps[el.dataset.tempsFiltre] = el.value; render(); return; }
  if (el.dataset.calFiltre) { calFiltre[el.dataset.calFiltre] = el.value; rerenderKeepScroll(); return; }
  const a = el.dataset.actionChange;
  if (a === 'action-statut') {
    planById(el.dataset.plan).actions[+el.dataset.i].statut = el.value;
    persist(true); rerenderKeepScroll(); toast('Statut mis à jour.');
  } else if (a === 'plan-statut') {
    const p = planById(el.dataset.id); p.statut = el.value;
    if (p.statut !== 'brouillon' && !p.datePresentation) p.datePresentation = todayISO();
    persist(true); render();
  } else if (a === 'logo' && el.files[0]) {
    const file = el.files[0];
    if (file.size > 400 * 1024) { toast('Logo trop lourd (max 400 Ko).', 'err'); return; }
    const r = new FileReader();
    r.onload = () => { data.settings.logo = r.result; persist(true); render(); };
    r.readAsDataURL(file);
  } else if (a === 'import-fiche' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => { try { importerFiche(JSON.parse(r.result)); } catch { toast('Fichier de fiche invalide.', 'err'); } el.value = ''; };
    r.readAsText(el.files[0]);
  } else if (a === 'import' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.plans) || !Array.isArray(d.clients)) throw new Error();
        askConfirm('Remplacer les données actuelles par cette sauvegarde ?', () => {
          const base = defaultData();
          data = { ...base, ...d, settings: { ...base.settings, ...d.settings, cleApi: data.settings.cleApi }, factures: d.factures || [] };
          data.plans.forEach(normaliserPlan); data.clients.forEach(normaliserFiche);
          persist(true); render(); toast('Sauvegarde importée.');
        }, 'Remplacer');
      } catch { toast('Fichier de sauvegarde invalide.', 'err'); }
    };
    r.readAsText(el.files[0]);
  }
});

setInterval(() => {
  const el = document.querySelector('[data-live="chrono"]');
  if (el && data.chrono) el.textContent = heures(Math.round(dureeChrono() * 100) / 100);
}, 30000);

// Infobulle des graphiques (attribut data-tip).
const bulle = document.createElement('div');
bulle.className = 'g-bulle';
document.body.appendChild(bulle);
document.addEventListener('mousemove', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { bulle.style.display = 'none'; return; }
  bulle.textContent = t.dataset.tip;
  bulle.style.display = 'block';
  bulle.style.left = Math.min(window.innerWidth - bulle.offsetWidth - 8, e.clientX + 12) + 'px';
  bulle.style.top = (e.clientY - 34) + 'px';
});

// Glisser-déposer des publications dans le calendrier.
document.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-pub]'); if (c) e.dataTransfer.setData('text/plain', c.dataset.pub); });
document.addEventListener('dragover', e => { if (e.target.closest?.('.cal-day')) e.preventDefault(); });
document.addEventListener('drop', e => {
  const jour = e.target.closest?.('.cal-day');
  const id = e.dataTransfer.getData('text/plain');
  if (!jour || !id || !current.plan) return;
  e.preventDefault();
  const pub = current.plan.publications.find(x => x.id === id);
  if (pub && pub.date !== jour.dataset.date) { pub.date = jour.dataset.date; persist(true); rerenderKeepScroll(); toast(`Publication déplacée au ${dateCourte(pub.date)}.`); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $modal.innerHTML) closeModal();
  // Entrée dans un champ de formulaire : on valide nous-mêmes (l'envoi natif peut être bloqué).
  const form = e.target.closest?.('form[data-form]');
  if (e.key === 'Enter' && form && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); handleForm(form); }
});
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

// ---------- Exemple ----------
function chargerDemo() {
  const c = { id: uid(), nom: 'Boulangerie Soleil Levant', secteur: 'restaurant', taille: 'Petite entreprise (1-10)', contact: 'Marie Joseph', telephone: '+509 3700 0000', email: 'contact@soleillevant.ht', nif: '', adresse: 'Rue Capois, Port-au-Prince', siteWeb: '' };
  normaliserFiche(c);
  Object.assign(c.fiche.activite, { description: 'Boulangerie-pâtisserie artisanale de quartier.', produits: 'Pain frais, pâtisseries, gâteaux d\'anniversaire, petits-déjeuners', prix: '25 à 3 500 HTG', anciennete: '8 ans', employes: '6', zone: 'Port-au-Prince (centre et Bourdon)', saisonnalite: 'Forte demande en décembre et pour la fête des mères' });
  Object.assign(c.fiche.clientele, { profil: 'Familles et travailleurs du quartier, 25-50 ans', decouverte: ['Bouche-à-oreille', 'Passage devant le local'], clientsMois: 1800, fideles: 55 });
  Object.assign(c.fiche.concurrence, { concurrents: 'Deux boulangeries industrielles et les marchandes de pain de rue.', avantage: 'Produits faits maison chaque matin avec des ingrédients locaux', problemes: 'Ventes concentrées le matin\nPeu de nouveaux clients' });
  Object.assign(c.fiche.enLigne.facebook, { url: 'facebook.com/soleillevant', abonnes: 1200, pubsMois: 3, interactions: 8 });
  Object.assign(c.fiche.enLigne.google, { note: 4.6, avis: 23 });
  Object.assign(c.fiche.enLigne.whatsapp, { contacts: 350 });
  Object.assign(c.fiche.moyens, { budgetMensuel: 25000, gestionnaire: 'La propriétaire, le soir', supports: { logo: true } });
  data.clients.push(c);
  const debut = todayISO();
  const p = nouveauPlan({ clientId: c.id, titre: 'Lancement de la livraison à domicile', debut, fin: addMonths(debut, 6), budgetPrevu: 150000, prefill: true });
  p.motif = 'lancement_produit';
  p.motifDetail = 'La boulangerie lance un service de livraison à domicile et de commande par WhatsApp, et veut le faire savoir rapidement dans le quartier.';
  p.resume = 'La Boulangerie Soleil Levant est appréciée pour la qualité de ses produits mais reste peu visible en ligne. Nous proposons une campagne de 6 mois pour lancer la commande via WhatsApp et la livraison à domicile, en s\'appuyant sur Facebook/Instagram et un programme de fidélité.';
  p.contexte = 'Boulangerie-pâtisserie ouverte depuis 8 ans, 6 employés.\nVentes stables mais concentrées le matin.\nPage Facebook peu active (1 200 abonnés).';
  p.messageCle = 'Du pain frais et des pâtisseries maison, livrés chez vous en moins de 45 minutes.';
  p.slogan = 'Le goût du matin, à votre porte';
  p.ton = 'Chaleureux et familial';
  const budgets = [45000, 15000, 20000, 25000];
  p.actions.forEach((a, i) => { a.budget = budgets[i] || 10000; a.responsable = 'Agence'; });
  // Résultats du premier mois, pour illustrer le suivi et les recommandations.
  const res = [
    { statut: 'en_cours', depense: 12000, portee: 18500, prospects: 140, ventes: 52000 },
    { statut: 'en_cours', depense: 3000, portee: 900, prospects: 85, ventes: 38000 },
    { statut: 'termine', depense: 20000, portee: 4000, prospects: 25, ventes: 9000 },
    { statut: 'a_faire', depense: 0, portee: 0, prospects: 0, ventes: 0 },
  ];
  p.actions.forEach((a, i) => Object.assign(a, res[i] || {}));
  p.objectifs.forEach((o, i) => { o.progression = [40, 55, 20][i] ?? 0; o.actuel = ['+10 %', '27', '+6 %'][i] ?? ''; });
  p.bilan = 'Premier mois encourageant : WhatsApp génère des commandes à très faible coût. Les flyers coûtent cher pour peu de prospects : nous proposons de réaffecter une partie de ce budget vers WhatsApp et Facebook.';
  p.honoraires = [
    { description: 'Élaboration de la stratégie et du plan marketing', qte: 1, pu: 35000 },
    { description: 'Gestion des réseaux sociaux et des campagnes (par mois)', qte: 6, pu: 12000 },
    { description: 'Création des visuels et vidéos de lancement', qte: 1, pu: 18000 },
  ];
  data.plans.push(p);
  persist(true);
  go(`#/plan/${p.id}/presentation`);
  toast('Exemple chargé : un client et un plan complet.');
}

sync.initialiser({
  donnees: () => data,
  distant: () => { save(data); rendreSiPossible(); },
  retour: appliquerRetour,
  statut: () => { renderShell(current.nav || 'dashboard'); const z = document.querySelector('[data-equipe]'); if (z && !z.contains(document.activeElement)) z.innerHTML = panneauEquipe(); },
});
verifierRecurrentes();
render();
sync.reprendre(data).then(ok => { if (ok) { save(data); data.plans.forEach(normaliserPlan); data.clients.forEach(normaliserFiche); rendreSiPossible(); } });
