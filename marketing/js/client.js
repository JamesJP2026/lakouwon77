// Portail client : le client ouvre le lien reçu (client.html#t=…&u=…&k=…),
// consulte la proposition, la signe, et valide ou commente les publications.
// Il n'a accès à aucune table : uniquement aux fonctions mk_partage_lire et
// mk_partage_repondre, protégées par le jeton du lien.
import { createClient } from './vendor/supabase.esm.js';
import { esc, nl2br, num, fmt, dateFr, dateCourte } from './store.js';
import { STATUTS_PUB } from './calendrier.js';

const $ = document.getElementById('portail');
const params = new URLSearchParams(location.hash.slice(1));
const token = params.get('t'), url = params.get('u'), cle = params.get('k');
let sb = null, partage = null;
const repondues = new Set();

function toast(msg, type = 'ok') {
  document.querySelectorAll('.toast').forEach(x => x.remove());
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

const erreur = msg => { $.innerHTML = `<div class="panel portail-erreur"><h2>Lien indisponible</h2><p>${esc(msg)}</p><p class="muted">Contactez votre agence pour recevoir un nouveau lien.</p></div>`; };

async function charger() {
  if (!token || !url || !cle) return erreur('Ce lien est incomplet.');
  try {
    sb = createClient(url, cle, { auth: { persistSession: false } });
    const { data, error } = await sb.rpc('mk_partage_lire', { p_token: token });
    if (error) throw error;
    if (!data) return erreur('Ce lien a expiré ou a été désactivé.');
    partage = data;
    afficher();
  } catch (e) {
    erreur(/fetch|network/i.test(e?.message || '') ? 'Connexion impossible. Vérifiez votre connexion internet puis rechargez la page.' : 'Impossible d\'ouvrir ce lien.');
  }
}

const money = n => `${fmt(n)} ${esc(partage.agence.devise || 'HTG')}`;

function afficher() {
  const { agence: a, client: c, plan: p } = partage;
  const totalHon = (p.honoraires || []).reduce((s, l) => s + num(l.qte) * num(l.pu), 0);
  const pubs = (p.publications || []).filter(x => x.statut !== 'idee').sort((x, y) => (x.date || '').localeCompare(y.date || ''));
  document.title = `${p.titre} — ${a.nom || 'Votre agence'}`;
  $.innerHTML = `
    <header class="portail-head">
      ${a.logo ? `<img src="${esc(a.logo)}" alt="" class="doc-logo">` : ''}
      <div><b>${esc(a.nom || '')}</b><div class="muted">${esc([a.telephone, a.email].filter(Boolean).join(' · '))}</div></div>
    </header>
    <section class="panel">
      <div class="cover-kicker">Plan marketing & publicitaire</div>
      <h1 class="portail-titre">${esc(p.titre)}</h1>
      <p>Préparé pour <b>${esc(c.nom || '')}</b> · du ${dateFr(p.debut)} au ${dateFr(p.fin)}</p>
      ${p.slogan ? `<blockquote><div class="slogan">« ${esc(p.slogan)} »</div>${p.messageCle ? `<div>${nl2br(p.messageCle)}</div>` : ''}</blockquote>` : ''}
      ${p.resume ? `<p>${nl2br(p.resume)}</p>` : ''}
    </section>
    ${(p.objectifs || []).length ? `<section class="panel"><h3>Objectifs</h3><ul class="portail-liste">${p.objectifs.map(o => `<li><b>${esc(o.objectif)}</b><span class="muted"> — ${esc(o.indicateur)} : ${esc(o.cible)} (${esc(o.echeance)})</span></li>`).join('')}</ul></section>` : ''}
    ${(p.actions || []).length ? `<section class="panel"><h3>Actions prévues</h3><ul class="portail-liste">${p.actions.map(x => `<li><b>${esc(x.canal)}</b> — ${esc(x.action)}<span class="muted"> · ${dateCourte(x.debut)} → ${dateCourte(x.fin)}</span></li>`).join('')}</ul></section>` : ''}
    ${(p.honoraires || []).length ? `<section class="panel"><h3>Proposition</h3><div class="table-wrap flat"><table>
      <tbody>${p.honoraires.map(l => `<tr><td>${esc(l.description)}</td><td class="r num">${money(num(l.qte) * num(l.pu))}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td class="r"><b>Total HT</b></td><td class="r num"><b>${money(totalHon)}</b></td></tr></tfoot></table></div></section>` : ''}
    <section class="panel" id="signature">${blocSignature(p, c)}</section>
    ${pubs.length ? `<section class="panel"><h3>Publications à valider</h3>
      <p class="muted">Validez chaque publication ou indiquez ce qu'il faut modifier. Votre agence reçoit vos réponses immédiatement.</p>
      ${pubs.map(carteePublication).join('')}</section>` : ''}
    <section class="panel"><h3>Un message pour l'agence ?</h3>
      <textarea id="msg" rows="3" placeholder="Une question, une remarque…"></textarea>
      <div class="row-btns mt"><button class="btn btn-primary" data-action="message">Envoyer</button></div>
    </section>
    <p class="muted c">Lien personnel valable jusqu'au ${dateFr(String(partage.expire_le).slice(0, 10))}.</p>`;
  initPad();
}

function blocSignature(p, c) {
  if (p.signature) return `<h3>Bon pour accord ✓</h3><p>Proposition signée par <b>${esc(p.signature.nom)}</b> le ${dateFr(p.signature.date)}.</p>`;
  if (repondues.has('signature')) return '<h3>Merci !</h3><p>Votre signature a bien été envoyée à l\'agence.</p>';
  return `<h3>Bon pour accord</h3>
    <p>Je soussigné(e), représentant ${esc(c.nom || 'l\'entreprise')}, accepte la proposition « ${esc(p.titre)} ».</p>
    <div class="form-grid">
      <label>Nom<input id="sig-nom" value="${esc(c.contact || '')}"></label>
      <label>Fonction<input id="sig-fonction"></label>
    </div>
    <div class="lbl-like mt">Signez dans le cadre (avec le doigt)</div>
    <canvas id="sig-pad" width="600" height="180"></canvas>
    <div class="row-btns"><button class="btn btn-sm" data-action="sig-vider">Recommencer</button><button class="btn btn-primary" data-action="signer">Je signe</button></div>`;
}

function carteePublication(x) {
  const fait = repondues.has(x.id);
  return `<div class="pub-carte">
    <div class="pub-carte-tete"><b>${dateCourte(x.date)} · ${esc(x.canal)}</b><span class="pub-chip pst-${esc(x.statut)}">${esc(STATUTS_PUB[x.statut] || x.statut)}</span></div>
    ${x.titre ? `<div><b>${esc(x.titre)}</b></div>` : ''}
    <p>${nl2br(x.texte)}</p>
    ${x.hashtags ? `<p class="muted">${esc(x.hashtags)}</p>` : ''}
    ${x.visuel ? `<p class="muted">Visuel prévu : ${esc(x.visuel)}</p>` : ''}
    ${fait ? '<p class="ok-txt">✓ Réponse envoyée</p>' : x.statut === 'publie' ? '' : `
      <textarea data-com="${esc(x.id)}" rows="2" placeholder="Commentaire (facultatif, obligatoire pour une modification)"></textarea>
      <div class="row-btns"><button class="btn btn-primary" data-action="pub" data-id="${esc(x.id)}" data-statut="valide">✓ Valider</button>
      <button class="btn" data-action="pub" data-id="${esc(x.id)}" data-statut="a_modifier">✎ À modifier</button></div>`}
  </div>`;
}

function initPad() {
  const cv = document.getElementById('sig-pad');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#132340';
  let dessine = false;
  const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.addEventListener('pointerdown', e => { dessine = true; cv.dataset.vide = 'non'; cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.moveTo(...pos(e)); });
  cv.addEventListener('pointermove', e => { if (dessine) { ctx.lineTo(...pos(e)); ctx.stroke(); } });
  ['pointerup', 'pointercancel'].forEach(t => cv.addEventListener(t, () => { dessine = false; }));
}

async function repondre(args) {
  const { error } = await sb.rpc('mk_partage_repondre', { p_token: token, ...args });
  if (error) throw new Error(error.message);
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  try {
    if (a === 'sig-vider') { const cv = document.getElementById('sig-pad'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); delete cv.dataset.vide; }
    if (a === 'signer') {
      const nom = document.getElementById('sig-nom').value.trim();
      const cv = document.getElementById('sig-pad');
      if (!nom) return toast('Indiquez votre nom.', 'err');
      if (cv.dataset.vide !== 'non') return toast('Signez dans le cadre.', 'err');
      el.disabled = true;
      await repondre({ p_type: 'signature', p_nom: nom, p_fonction: document.getElementById('sig-fonction').value.trim(), p_image: cv.toDataURL('image/png') });
      repondues.add('signature');
      document.getElementById('signature').innerHTML = blocSignature(partage.plan, partage.client);
      toast('Merci ! Votre signature a été envoyée.');
    }
    if (a === 'pub') {
      const com = document.querySelector(`[data-com="${CSS.escape(el.dataset.id)}"]`).value.trim();
      if (el.dataset.statut === 'a_modifier' && !com) return toast('Indiquez ce qu\'il faut modifier.', 'err');
      el.disabled = true;
      await repondre({ p_type: 'publication', p_cible: el.dataset.id, p_statut: el.dataset.statut, p_commentaire: com || null });
      repondues.add(el.dataset.id);
      el.closest('.pub-carte').outerHTML = carteePublication(partage.plan.publications.find(x => x.id === el.dataset.id));
      toast(el.dataset.statut === 'valide' ? 'Publication validée ✓' : 'Demande de modification envoyée.');
    }
    if (a === 'message') {
      const t = document.getElementById('msg').value.trim();
      if (!t) return;
      el.disabled = true;
      await repondre({ p_type: 'commentaire', p_commentaire: t, p_nom: partage.client.contact || null });
      document.getElementById('msg').value = '';
      toast('Message envoyé à l\'agence.');
      el.disabled = false;
    }
  } catch (err) {
    el.disabled = false;
    toast(err.message || 'Envoi impossible, réessayez.', 'err');
  }
});

charger();
