import {
  load, save, defaultData, uid, esc, nl2br, num, fmt, todayISO, addDays, addMonths,
  dateFr, dateCourte, totauxFacture, budgetActions, totalHonoraires,
} from './store.js';
import { SECTEURS, CANAUX, suggestions } from './secteurs.js';

let data = load();
const $view = document.getElementById('view');
const $modal = document.getElementById('modal');

// ---------- Persistance ----------
let saveTimer;
function persist(now = false) {
  clearTimeout(saveTimer);
  const run = () => { if (!save(data)) toast('Impossible d\'enregistrer : stockage du navigateur plein (logo trop lourd ?).', 'err'); };
  now ? run() : (saveTimer = setTimeout(run, 300));
}

// ---------- Helpers ----------
const money = n => `${fmt(n)} ${esc(data.settings.devise || 'HTG')}`;
const clientById = id => data.clients.find(c => c.id === id);
const planById = id => data.plans.find(p => p.id === id);
const factureById = id => data.factures.find(f => f.id === id);
const secteurLabel = k => SECTEURS[k]?.label || 'Autre secteur';

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

function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { o = o?.[ks[i]]; if (o == null) return; }
  o[ks[ks.length - 1]] = val;
}
const getPath = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

const go = hash => { location.hash = hash; };

// ---------- Modèle de plan ----------
function nouveauPlan({ clientId, titre, debut, fin, budgetPrevu, prefill }) {
  const client = clientById(clientId);
  const p = {
    id: uid(), clientId, titre, statut: 'brouillon', creeLe: todayISO(), datePresentation: '',
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
  if (prefill && client) appliquerSuggestions(p, client.secteur, false);
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
  ['factures', '▤', 'Factures'],
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
    <div class="sidebar-foot">Données enregistrées dans ce navigateur.<br>Pensez à exporter une sauvegarde.</div>`;
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
      <td><b>${esc(c.nom)}</b><div class="muted">${esc(c.contact || '')}</div></td>
      <td>${esc(secteurLabel(c.secteur))}</td>
      <td>${esc(c.telephone || '')}<div class="muted">${esc(c.email || '')}</div></td>
      <td class="c">${nbPlans}</td>
      <td class="r nowrap">
        <button class="btn btn-sm" data-action="new-plan-for" data-id="${c.id}">+ Plan</button>
        <button class="btn btn-sm" data-action="edit-client" data-id="${c.id}">Modifier</button>
        <button class="btn btn-sm btn-danger" data-action="del-client" data-id="${c.id}">Supprimer</button>
      </td></tr>`;
  }).join('');
  return topbar('Entreprises clientes', 'Tout type d\'entreprise : commerce, restaurant, services, santé, ONG…',
    `<button class="btn btn-primary" data-action="edit-client">+ Nouvelle entreprise</button>`) +
    (data.clients.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Entreprise</th><th>Secteur</th><th>Contact</th><th class="c">Plans</th><th></th></tr></thead>
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
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`, true);
}

function viewPlans() {
  const plans = [...data.plans].sort((a, b) => (b.creeLe || '').localeCompare(a.creeLe || ''));
  return topbar('Plans marketing', 'Créez, présentez puis facturez vos plans marketing et publicitaires',
    `<button class="btn btn-primary" data-action="new-plan-for">+ Nouveau plan</button>`) +
    (plans.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Plan</th><th>Période</th><th class="r">Budget actions</th><th class="r">Honoraires</th><th>Statut</th><th></th></tr></thead>
      <tbody>${plans.map(p => `<tr>
        <td><b>${esc(p.titre)}</b><div class="muted">${esc(clientById(p.clientId)?.nom || '—')}</div></td>
        <td class="nowrap">${dateCourte(p.debut)} → ${dateCourte(p.fin)}</td>
        <td class="r num">${money(budgetActions(p))}</td>
        <td class="r num">${money(totalHonoraires(p))}</td>
        <td>${badge(p.statut, STATUTS_PLAN)}</td>
        <td class="r nowrap">
          <a class="btn btn-sm" href="#/plan/${p.id}/infos">Modifier</a>
          <a class="btn btn-sm btn-gold" href="#/plan/${p.id}/presentation">Présenter</a>
          <button class="btn btn-sm" data-action="dup-plan" data-id="${p.id}" title="Dupliquer">⧉</button>
          <button class="btn btn-sm btn-danger" data-action="del-plan" data-id="${p.id}" title="Supprimer">✕</button>
        </td></tr>`).join('')}</tbody></table></div>`
      : '<div class="panel muted">Aucun plan. Cliquez sur « Nouveau plan » pour commencer.</div>');
}

function modalNouveauPlan(clientId = '') {
  if (!data.clients.length) { modalClient(); toast('Ajoutez d\'abord l\'entreprise cliente.'); return; }
  const debut = todayISO();
  openModal(`<h2>Nouveau plan marketing</h2>
    <form data-form="plan">
      <div class="form-grid">
        <label class="full">Entreprise cliente *<select name="clientId" required>${data.clients.map(c => `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${esc(c.nom)} — ${esc(secteurLabel(c.secteur))}</option>`).join('')}</select></label>
        <label class="full">Titre du plan *<input name="titre" required value="Plan marketing ${new Date().getFullYear()}"></label>
        <label>Début<input type="date" name="debut" value="${debut}" required></label>
        <label>Fin<input type="date" name="fin" value="${addMonths(debut, 6)}" required></label>
        <label class="full">Budget publicitaire envisagé (${esc(data.settings.devise)})<input name="budgetPrevu" type="number" min="0" step="any" value="0"></label>
        <label class="full check"><input type="checkbox" name="prefill" checked> Pré-remplir avec des suggestions adaptées au secteur (modifiables)</label>
      </div>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn btn-primary">Créer le plan</button></div>
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
  ['suivi', 'Suivi & KPIs'],
  ['honoraires', 'Honoraires'],
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
        ${field('Entreprise cliente', `<select data-bind="clientId">${data.clients.map(c => `<option value="${c.id}" ${c.id === p.clientId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>`)}
        ${field(`Budget publicitaire envisagé (${devise})`, numInp('budgetPrevu', p.budgetPrevu))}
        ${field('Début de la campagne', inp('debut', p.debut, 'type="date"'))}
        ${field('Fin de la campagne', inp('fin', p.fin, 'type="date"'))}
        ${field('Résumé du plan (synthèse pour le client)', area('resume', p.resume, 'En quelques phrases : la situation, l\'ambition, la stratégie proposée et les résultats attendus.', 5), 'full')}
      </div>
      <div class="hint">Secteur : <b>${esc(secteurLabel(client?.secteur))}</b>.
        <button class="btn btn-sm" data-action="prefill">✦ Remplir les champs vides avec des suggestions du secteur</button></div>`;
    case 'analyse': return `
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
      <button class="btn btn-sm" data-action="add-row" data-list="actions">+ Ajouter une action</button>
      ${chips('actions', sug.actions, a => `${a.canal} : ${a.action}`)}`;
    }
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
      <div class="form-grid" style="margin-top:16px">${field('Notes / conditions de la proposition', area('notes', p.notes, 'Validité de l\'offre, modalités, ce qui est inclus ou non…', 3), 'full')}</div>`;
  }
  return '';
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
      <nav class="steps">${STEPS.map(([k, l], i) => `<a href="#/plan/${p.id}/${k}" class="step ${k === cur ? 'active' : ''}"><span class="n">${i + 1}</span>${l}</a>`).join('')}</nav>
      <div class="panel step-body">
        <h3>${idx + 1}. ${curLabel}</h3>
        ${stepContent(p, cur)}
        <div class="step-nav">
          ${prev ? `<a class="btn" href="#/plan/${p.id}/${prev[0]}">← ${prev[1]}</a>` : '<span></span>'}
          ${next ? `<a class="btn btn-primary" href="#/plan/${p.id}/${next[0]}">${next[1]} →</a>`
                 : `<a class="btn btn-gold" href="#/plan/${p.id}/presentation">Présenter le plan →</a>`}
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
}

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
    <button class="btn btn-gold" data-action="gen-facture" data-id="${p.id}">Générer la facture</button>`;

  return topbar('Présentation du plan', `${badge(p.statut, STATUTS_PLAN)}${p.datePresentation ? ` · présenté le ${dateFr(p.datePresentation)}` : ''}
    ${factures.length ? ` · Factures : ${factures.map(f => `<a href="#/facture/${f.id}">${esc(f.numero)}</a>`).join(', ')}` : ''}`, actionsBar) + `
  <article class="doc">
    <header class="cover">
      <div class="cover-top">${s.logo ? `<img src="${esc(s.logo)}" alt="" class="doc-logo">` : ''}<div><b>${esc(s.nom)}</b><div class="muted">${esc([s.telephone, s.email].filter(Boolean).join(' · '))}</div></div></div>
      <div class="cover-kicker">Plan marketing & publicitaire</div>
      <h1>${esc(p.titre)}</h1>
      <div class="cover-client">Préparé pour <b>${esc(c.nom || '')}</b> — ${esc(secteurLabel(c.secteur))}</div>
      <div class="cover-meta">
        <div><span>Période</span><b>${dateFr(p.debut)} → ${dateFr(p.fin)}</b></div>
        <div><span>Budget des actions</span><b>${money(total)}</b></div>
        <div><span>Date</span><b>${dateFr(p.datePresentation || todayISO())}</b></div>
      </div>
    </header>

    ${section(++n, 'Résumé', p.resume ? `<p class="lead">${nl2br(p.resume)}</p>` : '<p class="muted">—</p>')}

    ${section(++n, 'Analyse de la situation', para('Situation actuelle', p.contexte) + para('Marché et concurrence', p.concurrents) + `
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

    ${section(++n, 'Notre proposition', p.honoraires.length ? `
      <table class="doc-table"><thead><tr><th>Prestation</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Total</th></tr></thead>
      <tbody>${p.honoraires.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${fmt(l.qte).replace(/,00$/, '')}</td><td class="r num">${money(l.pu)}</td><td class="r num">${money(num(l.qte) * num(l.pu))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3" class="r"><b>Total honoraires HT</b></td><td class="r num"><b>${money(totalHonoraires(p))}</b></td></tr>
      ${total > 0 ? `<tr><td colspan="3" class="r muted">Budget publicitaire (achat média, hors honoraires)</td><td class="r num muted">${money(total)}</td></tr>` : ''}</tfoot></table>
      ${para('', p.notes)}` : '')}

    <footer class="doc-foot">${esc(s.nom)}${s.adresse ? ` · ${esc(s.adresse)}` : ''}${s.telephone ? ` · ${esc(s.telephone)}` : ''}${s.email ? ` · ${esc(s.email)}` : ''}</footer>
  </article>`;
}

function modalGenFacture(p) {
  const hon = totalHonoraires(p), med = budgetActions(p);
  openModal(`<h2>Générer la facture</h2>
    <form data-form="gen-facture" data-id="${p.id}">
      <p class="muted">Plan « ${esc(p.titre)} » — ${esc(clientById(p.clientId)?.nom || '')}</p>
      <label class="check"><input type="checkbox" name="honoraires" ${hon > 0 || !med ? 'checked' : ''}> Honoraires du plan (${money(hon)})</label>
      <label class="check"><input type="checkbox" name="media" ${med > 0 && !hon ? 'checked' : ''}> Budget des actions publicitaires (${money(med)})</label>
      <label class="check sub-opt"><input type="checkbox" name="mediaDetail" checked> Détailler le budget publicitaire action par action</label>
      <div class="form-grid" style="margin-top:12px">
        <label>Type de facture<select name="type"><option value="complete">Facture complète</option><option value="acompte">Facture d'acompte</option></select></label>
        <label>Pourcentage d'acompte<input type="number" name="acomptePct" min="1" max="100" value="50"></label>
        <label>Date<input type="date" name="date" value="${todayISO()}"></label>
        <label>Échéance (jours)<input type="number" name="delai" min="0" value="${num(data.settings.delaiPaiement)}"></label>
      </div>
      ${p.statut === 'brouillon' ? '<p class="hint">Le plan sera marqué comme <b>présenté</b>.</p>' : ''}
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn btn-gold">Créer la facture</button></div>
    </form>`);
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
    id: uid(), numero: `${s.prefixeFacture || 'FAC'}-${date.slice(0, 4)}-${String(num(s.prochainNumero) || 1).padStart(4, '0')}`,
    planId: p.id, clientId: p.clientId, date, echeance: addDays(date, num(opts.delai)),
    objet: `${opts.type === 'acompte' ? 'Acompte — ' : ''}${p.titre}`,
    lignes, remisePct: 0, tvaPct: num(s.tvaPct), montantPaye: 0, paiements: [], statut: 'brouillon',
    notes: s.conditions || '',
  };
  s.prochainNumero = (num(s.prochainNumero) || 1) + 1;
  if (p.statut === 'brouillon') { p.statut = 'presente'; p.datePresentation = todayISO(); }
  data.factures.push(f);
  persist(true);
  return f;
}

// ---------- Factures ----------
function viewFactures() {
  const list = [...data.factures].sort((a, b) => (b.date + b.numero).localeCompare(a.date + a.numero));
  return topbar('Factures', 'Générées à partir des plans présentés',
    `<button class="btn" data-action="new-facture-libre">+ Facture libre</button>`) +
    (list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Numéro</th><th>Client</th><th>Date</th><th>Échéance</th><th class="r">Total TTC</th><th class="r">Reste</th><th>Statut</th></tr></thead>
      <tbody>${list.map(f => {
        const t = totauxFacture(f);
        const late = !['payee', 'annulee', 'brouillon'].includes(f.statut) && f.echeance < todayISO();
        return `<tr class="rowlink" data-href="#/facture/${f.id}">
          <td><b>${esc(f.numero)}</b><div class="muted">${esc(f.objet || '')}</div></td>
          <td>${esc(clientById(f.clientId)?.nom || '—')}</td><td>${dateCourte(f.date)}</td>
          <td class="${late ? 'txt-red' : ''}">${dateCourte(f.echeance)}</td>
          <td class="r num">${money(t.total)}</td><td class="r num">${f.statut === 'annulee' ? '—' : money(t.reste)}</td>
          <td>${badge(f.statut, STATUTS_FACT)}</td></tr>`;
      }).join('')}</tbody></table></div>`
      : '<div class="panel muted">Aucune facture. Ouvrez un plan, présentez-le puis cliquez sur « Générer la facture ».</div>');
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
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn btn-primary">Enregistrer</button></div>
    </form>`);
}

function modalFactureLibre() {
  if (!data.clients.length) { modalClient(); toast('Ajoutez d\'abord l\'entreprise cliente.'); return; }
  openModal(`<h2>Facture libre</h2>
    <form data-form="facture-libre">
      <label>Entreprise cliente<select name="clientId">${data.clients.map(c => `<option value="${c.id}">${esc(c.nom)}</option>`).join('')}</select></label>
      <label>Objet<input name="objet" value="Prestations marketing" required></label>
      <div class="modal-actions"><button type="button" class="btn" data-action="close-modal">Annuler</button><button class="btn btn-primary">Créer</button></div>
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
        <label class="full">Conditions de paiement par défaut<textarea data-sbind="conditions" rows="2">${esc(s.conditions)}</textarea></label>
        <label class="full">Mentions en bas de facture (coordonnées bancaires, MonCash…)<textarea data-sbind="mentions" rows="2">${esc(s.mentions)}</textarea></label>
      </div></div>
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
    const p = planById(id); nav = 'plans'; current.plan = p;
    html = sub === 'presentation' ? viewPresentation(p) : viewPlanEditor(p, sub || 'infos');
  }
  else if (route === 'factures') html = viewFactures();
  else if (route === 'facture' && factureById(id)) { nav = 'factures'; current.facture = factureById(id); html = viewFacture(current.facture); }
  else if (route === 'parametres') html = viewParametres();
  else { nav = 'dashboard'; html = viewDashboard(); }
  renderShell(nav);
  $view.innerHTML = html;
  document.body.classList.toggle('menu-open', false);
}

function rerenderKeepScroll() { const y = window.scrollY; render(); window.scrollTo(0, y); }

// ---------- Événements ----------
document.addEventListener('click', e => {
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a,button,input,select')) { go(row.dataset.href); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'close-modal-bg') { if (e.target === el) closeModal(); return; }
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const id = el.dataset.id;
  const p = current.plan, f = current.facture;

  switch (a) {
    case 'close-modal': closeModal(); break;
    case 'toggle-menu': document.body.classList.toggle('menu-open'); break;
    case 'print': window.print(); break;
    case 'demo': chargerDemo(); break;
    case 'edit-client': modalClient(id); break;
    case 'del-client': {
      const c = clientById(id);
      if (data.plans.some(x => x.clientId === id) || data.factures.some(x => x.clientId === id)) { toast('Cette entreprise a des plans ou factures : supprimez-les d\'abord.', 'err'); break; }
      if (confirm(`Supprimer « ${c.nom} » ?`)) { data.clients = data.clients.filter(x => x.id !== id); persist(true); render(); }
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
      if (confirm(`Supprimer le plan « ${src.titre} » ?`)) {
        data.plans = data.plans.filter(x => x.id !== id);
        data.factures = data.factures.filter(x => x.planId !== id);
        persist(true); render();
      }
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
      if (confirm('Émettre la facture ? Elle ne sera plus modifiable.')) { f.statut = 'envoyee'; persist(true); render(); }
      break;
    case 'del-facture':
      if (confirm('Supprimer ce brouillon de facture ?')) { data.factures = data.factures.filter(x => x.id !== id); persist(true); go('#/factures'); }
      break;
    case 'annuler-facture':
      if (confirm('Annuler cette facture ? Elle restera dans l\'historique avec le statut « Annulée ».')) { f.statut = 'annulee'; persist(true); render(); }
      break;
    case 'paiement': modalPaiement(f); break;
    case 'del-logo': data.settings.logo = ''; persist(true); render(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sauvegarde-marketing-${todayISO()}.json`;
      link.click(); URL.revokeObjectURL(link.href); break;
    }
    case 'reset':
      if (confirm('Effacer TOUTES les données (clients, plans, factures) de ce navigateur ?') && confirm('Confirmer : cette action est irréversible.')) {
        data = defaultData(); persist(true); go('#/dashboard'); render();
      }
      break;
  }
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(form));
  const kind = form.dataset.form;
  if (kind === 'client') {
    const id = form.dataset.id;
    const fields = { nom: fd.nom.trim(), secteur: fd.secteur, taille: fd.taille, contact: fd.contact, telephone: fd.telephone, email: fd.email, nif: fd.nif, adresse: fd.adresse, siteWeb: fd.siteWeb };
    if (id) Object.assign(clientById(id), fields); else data.clients.push({ id: uid(), ...fields });
    persist(true); closeModal(); render(); toast('Entreprise enregistrée.');
  } else if (kind === 'plan') {
    if (fd.fin < fd.debut) { toast('La date de fin doit être après la date de début.', 'err'); return; }
    const p = nouveauPlan({ ...fd, prefill: !!fd.prefill });
    data.plans.push(p); persist(true); closeModal(); go(`#/plan/${p.id}/infos`);
  } else if (kind === 'gen-facture') {
    if (!fd.honoraires && !fd.media) { toast('Cochez au moins un élément à facturer.', 'err'); return; }
    const f = creerFacture(planById(form.dataset.id), { honoraires: !!fd.honoraires, media: !!fd.media, mediaDetail: !!fd.mediaDetail, type: fd.type, acomptePct: fd.acomptePct, date: fd.date, delai: fd.delai });
    closeModal(); go(`#/facture/${f.id}`); toast(`Facture ${f.numero} créée (brouillon).`);
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
      id: uid(), numero: `${s.prefixeFacture || 'FAC'}-${date.slice(0, 4)}-${String(num(s.prochainNumero) || 1).padStart(4, '0')}`,
      planId: '', clientId: fd.clientId, date, echeance: addDays(date, num(s.delaiPaiement)), objet: fd.objet,
      lignes: [{ description: '', qte: 1, pu: 0 }], remisePct: 0, tvaPct: num(s.tvaPct), montantPaye: 0, paiements: [], statut: 'brouillon', notes: s.conditions || '',
    };
    s.prochainNumero = (num(s.prochainNumero) || 1) + 1;
    data.factures.push(f); persist(true); closeModal(); go(`#/facture/${f.id}`);
  }
});

function onInput(e) {
  const el = e.target;
  const val = el.dataset.type === 'num' ? num(el.value) : el.value;
  if (el.dataset.bind && current.plan) {
    setPath(current.plan, el.dataset.bind, val);
    persist(); updateLive(current.plan);
  } else if (el.dataset.fbind && current.facture) {
    setPath(current.facture, el.dataset.fbind, val);
    persist(); updateLiveFacture(current.facture);
  } else if (el.dataset.sbind) {
    data.settings[el.dataset.sbind] = val;
    persist();
    if (el.dataset.sbind === 'nom') renderShell('parametres');
  }
}
document.addEventListener('input', onInput);

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.bind === 'clientId') { onInput(e); return; }
  const a = el.dataset.actionChange;
  if (a === 'plan-statut') {
    const p = planById(el.dataset.id); p.statut = el.value;
    if (p.statut !== 'brouillon' && !p.datePresentation) p.datePresentation = todayISO();
    persist(true); render();
  } else if (a === 'logo' && el.files[0]) {
    const file = el.files[0];
    if (file.size > 400 * 1024) { toast('Logo trop lourd (max 400 Ko).', 'err'); return; }
    const r = new FileReader();
    r.onload = () => { data.settings.logo = r.result; persist(true); render(); };
    r.readAsDataURL(file);
  } else if (a === 'import' && el.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!Array.isArray(d.plans) || !Array.isArray(d.clients)) throw new Error();
        if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
        const base = defaultData();
        data = { ...base, ...d, settings: { ...base.settings, ...d.settings }, factures: d.factures || [] };
        persist(true); render(); toast('Sauvegarde importée.');
      } catch { toast('Fichier de sauvegarde invalide.', 'err'); }
    };
    r.readAsText(el.files[0]);
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && $modal.innerHTML) closeModal(); });
window.addEventListener('hashchange', () => { closeModal(); render(); window.scrollTo(0, 0); });

// ---------- Exemple ----------
function chargerDemo() {
  const c = { id: uid(), nom: 'Boulangerie Soleil Levant', secteur: 'restaurant', taille: 'Petite entreprise (1-10)', contact: 'Marie Joseph', telephone: '+509 3700 0000', email: 'contact@soleillevant.ht', nif: '', adresse: 'Rue Capois, Port-au-Prince', siteWeb: '' };
  data.clients.push(c);
  const debut = todayISO();
  const p = nouveauPlan({ clientId: c.id, titre: 'Lancement de la livraison à domicile', debut, fin: addMonths(debut, 6), budgetPrevu: 150000, prefill: true });
  p.resume = 'La Boulangerie Soleil Levant est appréciée pour la qualité de ses produits mais reste peu visible en ligne. Nous proposons une campagne de 6 mois pour lancer la commande via WhatsApp et la livraison à domicile, en s\'appuyant sur Facebook/Instagram et un programme de fidélité.';
  p.contexte = 'Boulangerie-pâtisserie ouverte depuis 8 ans, 6 employés.\nVentes stables mais concentrées le matin.\nPage Facebook peu active (1 200 abonnés).';
  p.messageCle = 'Du pain frais et des pâtisseries maison, livrés chez vous en moins de 45 minutes.';
  p.slogan = 'Le goût du matin, à votre porte';
  p.ton = 'Chaleureux et familial';
  const budgets = [45000, 15000, 20000, 25000];
  p.actions.forEach((a, i) => { a.budget = budgets[i] || 10000; a.responsable = 'Agence'; });
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

render();
