// Synchronisation avec un espace d'équipe Supabase (facultatif).
//
// L'application reste « locale d'abord » : les données vivent dans le
// navigateur et sont recopiées document par document (un client, un plan,
// une facture…) dans la table mk_donnees de l'espace. Les modifications des
// autres membres arrivent en temps réel. En cas de modification simultanée
// du même document, la dernière enregistrée l'emporte ; une modification
// faite hors ligne est renvoyée au retour de la connexion.
const CONFIG = 'lakouwon-marketing-sync';
const EMPREINTES = 'lakouwon-marketing-sync-empreintes';
const COLLECTIONS = ['clients', 'plans', 'factures', 'temps'];
// Réglages propres à chaque poste : jamais envoyés à l'espace.
const REGLAGES_LOCAUX = ['cleApi'];

let sb = null, canal = null, minuteur = null, envoiEnCours = null;
let etat = { statut: 'local', espace: null, utilisateur: null, erreur: '' };
let empreintes = lire(EMPREINTES, {});
let rappels = { donnees: () => null, distant: () => {}, retour: () => {}, statut: () => {} };

function lire(cle, defaut) { try { return JSON.parse(localStorage.getItem(cle)) ?? defaut; } catch { return defaut; } }
function ecrire(cle, val) { try { localStorage.setItem(cle, JSON.stringify(val)); } catch { /* stockage indisponible */ } }

const config = () => lire(CONFIG, { url: '', cle: '', espaceId: '' });
const etatSync = () => ({ ...etat });
const majStatut = (statut, extra = {}) => { etat = { ...etat, statut, ...extra }; rappels.statut(etatSync()); };

// Empreinte courte d'un document (détection des changements).
function empreinte(texte) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texte.length; i++) { const c = texte.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

// Données de l'application → documents de l'espace.
function versDocuments(data) {
  const docs = [];
  COLLECTIONS.forEach(col => (data[col] || []).forEach(d => docs.push({ collection: col, id: d.id, doc: d })));
  const reglages = { ...data.settings };
  REGLAGES_LOCAUX.forEach(k => delete reglages[k]);
  docs.push({ collection: 'reglages', id: 'reglages', doc: reglages });
  return docs;
}
const cleDoc = d => `${d.collection}/${d.id}`;

// Applique un document distant aux données locales.
function appliquerDistant(data, ligne) {
  if (ligne.collection === 'reglages') {
    const locaux = Object.fromEntries(REGLAGES_LOCAUX.map(k => [k, data.settings[k]]));
    data.settings = { ...data.settings, ...ligne.doc, ...locaux };
    return;
  }
  const liste = data[ligne.collection];
  if (!liste) return;
  const i = liste.findIndex(d => d.id === ligne.id);
  if (ligne.supprime) { if (i >= 0) liste.splice(i, 1); }
  else if (i >= 0) liste[i] = ligne.doc; else liste.push(ligne.doc);
}

function initialiser(r) { rappels = { ...rappels, ...r }; }

async function client(url, cle) {
  if (sb && sb.__url === url) return sb;
  const { createClient } = await import('./vendor/supabase.esm.js');
  sb = createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'lakouwon-marketing-auth' } });
  sb.__url = url;
  return sb;
}

async function configurer(url, cle) {
  url = url.trim().replace(/\/+$/, ''); cle = cle.trim();
  if (!/^https:\/\/.+/.test(url) || cle.length < 20) throw new Error('Adresse du projet ou clé invalide.');
  ecrire(CONFIG, { ...config(), url, cle });
  await client(url, cle);
  return utilisateurCourant();
}

async function utilisateurCourant() {
  const c = config();
  if (!c.url) return null;
  const s = await client(c.url, c.cle);
  const { data } = await s.auth.getSession();
  etat.utilisateur = data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null;
  return etat.utilisateur;
}

function erreurLisible(e) {
  const m = e?.message || String(e);
  if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Adresse email non confirmée : ouvrez l\'email de confirmation reçu.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cet email : connectez-vous.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Connexion impossible (internet ou adresse du projet).';
  if (/relation .* does not exist|Could not find the table/i.test(m)) return 'Les tables ne sont pas installées : exécutez marketing/supabase/marketing.sql dans Supabase.';
  return m;
}
const verifier = ({ data, error }) => { if (error) throw new Error(erreurLisible(error)); return data; };

async function seConnecter(email, mdp, creer = false) {
  const c = config();
  const s = await client(c.url, c.cle);
  const res = creer ? await s.auth.signUp({ email, password: mdp }) : await s.auth.signInWithPassword({ email, password: mdp });
  verifier(res);
  if (!res.data.session) return { confirmation: true };
  etat.utilisateur = { id: res.data.user.id, email: res.data.user.email };
  await s.rpc('mk_accepter_invitations');
  return { utilisateur: etat.utilisateur };
}

async function seDeconnecter() {
  await quitterEspace();
  if (sb) await sb.auth.signOut();
  etat.utilisateur = null;
  majStatut('local');
}

async function listerEspaces() {
  await sb.rpc('mk_accepter_invitations');
  return verifier(await sb.from('mk_espaces').select('id, nom, cree_le').order('cree_le'));
}

async function creerEspace(nom) {
  return verifier(await sb.from('mk_espaces').insert({ nom }).select('id, nom').single());
}

// Ouvre un espace : récupère ses documents et les réconcilie avec les données locales.
// mode : 'auto' (reconnexion), 'envoyer' (données locales → espace vide), 'recevoir' (espace → navigateur).
async function ouvrirEspace(espace, data, mode = 'auto') {
  majStatut('connexion', { espace, erreur: '' });
  const lignes = verifier(await sb.from('mk_donnees').select('collection, id, doc, supprime').eq('espace_id', espace.id));
  const distants = new Map(lignes.map(l => [cleDoc(l), l]));
  if (mode === 'recevoir') {
    COLLECTIONS.forEach(col => { data[col] = []; });
    empreintes = {};
  }
  const aEnvoyer = [];
  const locaux = new Map(versDocuments(data).map(d => [cleDoc(d), d]));
  // Documents distants : on les prend, sauf si le document local a changé depuis la dernière synchro (modif hors ligne).
  for (const l of lignes) {
    const k = cleDoc(l);
    const loc = locaux.get(k);
    const hLoc = loc ? empreinte(JSON.stringify(loc.doc)) : null;
    const modifieHorsLigne = mode === 'auto' && loc && empreintes[k] && hLoc !== empreintes[k];
    if (modifieHorsLigne) { aEnvoyer.push(loc); continue; }
    if (mode === 'envoyer' && loc) { aEnvoyer.push(loc); continue; }
    appliquerDistant(data, l);
    empreintes[k] = l.supprime ? null : empreinte(JSON.stringify(l.doc));
  }
  // Documents locaux absents de l'espace : à envoyer (nouveaux), sauf s'ils ont été supprimés par un autre membre.
  for (const d of versDocuments(data)) {
    const k = cleDoc(d);
    if (!distants.has(k) && !(mode === 'auto' && empreintes[k])) aEnvoyer.push(d);
    else if (!distants.has(k) && mode === 'auto' && empreintes[k]) appliquerDistant(data, { ...d, supprime: true });
  }
  ecrire(CONFIG, { ...config(), espaceId: espace.id });
  etat.espace = espace;
  await envoyer(aEnvoyer, []);
  ecrire(EMPREINTES, empreintes);
  ecouter(espace.id);
  await traiterRetoursEnAttente();
  majStatut('synchro');
  return { recus: lignes.length, envoyes: aEnvoyer.length };
}

async function quitterEspace() {
  if (canal) { await sb?.removeChannel(canal); canal = null; }
  ecrire(CONFIG, { ...config(), espaceId: '' });
  empreintes = {}; ecrire(EMPREINTES, empreintes);
  etat.espace = null;
  majStatut(etat.utilisateur ? 'connecte' : 'local');
}

async function envoyer(maj, suppr) {
  const id = etat.espace.id;
  if (maj.length) {
    const lignes = maj.map(d => ({ espace_id: id, collection: d.collection, id: d.id, doc: d.doc, supprime: false }));
    for (let i = 0; i < lignes.length; i += 200) verifier(await sb.from('mk_donnees').upsert(lignes.slice(i, i + 200), { onConflict: 'espace_id,collection,id' }));
    maj.forEach(d => { empreintes[cleDoc(d)] = empreinte(JSON.stringify(d.doc)); });
  }
  for (const k of suppr) {
    const [collection, ...reste] = k.split('/');
    verifier(await sb.from('mk_donnees').update({ supprime: true }).match({ espace_id: id, collection, id: reste.join('/') }));
    delete empreintes[k];
  }
}

// À appeler après chaque modification locale : envoie les documents changés (regroupés).
function planifierEnvoi() {
  if (!etat.espace) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(envoyerMaintenant, 800);
}

async function envoyerMaintenant() {
  if (!etat.espace || !sb) return;
  clearTimeout(minuteur);
  if (envoiEnCours) await envoiEnCours;
  envoiEnCours = (async () => {
    const data = rappels.donnees();
    const docs = versDocuments(data);
    const presents = new Set(docs.map(cleDoc));
    const maj = docs.filter(d => empreintes[cleDoc(d)] !== empreinte(JSON.stringify(d.doc)));
    const suppr = Object.keys(empreintes).filter(k => empreintes[k] && !presents.has(k));
    if (!maj.length && !suppr.length) return;
    majStatut('envoi');
    try { await envoyer(maj, suppr); ecrire(EMPREINTES, empreintes); majStatut('synchro'); }
    catch (e) { majStatut('erreur', { erreur: erreurLisible(e) }); }
  })();
  await envoiEnCours;
  envoiEnCours = null;
}

function ecouter(espaceId) {
  if (canal) sb.removeChannel(canal);
  canal = sb.channel(`mk-${espaceId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mk_donnees', filter: `espace_id=eq.${espaceId}` }, ({ new: l }) => {
      if (!l?.collection) return;
      const k = cleDoc(l);
      const h = l.supprime ? null : empreinte(JSON.stringify(l.doc));
      if (empreintes[k] === h) return; // notre propre envoi
      const data = rappels.donnees();
      appliquerDistant(data, l);
      empreintes[k] = h; ecrire(EMPREINTES, empreintes);
      rappels.distant(l);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mk_retours', filter: `espace_id=eq.${espaceId}` }, ({ new: r }) => traiterRetour(r))
    .subscribe(s => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') majStatut('hors_ligne'); else if (s === 'SUBSCRIBED' && etat.statut === 'hors_ligne') majStatut('synchro'); });
}

async function traiterRetour(r) {
  if (!r || r.traite) return;
  rappels.retour(r);
  await sb.from('mk_retours').update({ traite: true }).eq('id', r.id);
}

async function traiterRetoursEnAttente() {
  const lignes = verifier(await sb.from('mk_retours').select('*').eq('espace_id', etat.espace.id).eq('traite', false).order('id'));
  for (const r of lignes) await traiterRetour(r);
}

// Lien de partage pour le portail client (le plan doit être envoyé avant).
async function creerPartage(planId) {
  await envoyerMaintenant();
  return verifier(await sb.from('mk_partages').insert({ espace_id: etat.espace.id, plan_id: planId }).select('token, expire_le').single());
}
async function listerPartages(planId) {
  return verifier(await sb.from('mk_partages').select('token, actif, expire_le, cree_le').eq('espace_id', etat.espace.id).eq('plan_id', planId).order('cree_le', { ascending: false }));
}
async function desactiverPartage(token) {
  verifier(await sb.from('mk_partages').update({ actif: false }).eq('token', token));
}

// Membres et invitations (administrateurs).
async function membres() {
  const m = verifier(await sb.from('mk_membres').select('user_id, email, role').eq('espace_id', etat.espace.id).order('ajoute_le'));
  const inv = await sb.from('mk_invitations').select('email, role').eq('espace_id', etat.espace.id);
  return { membres: m, invitations: inv.data || [] };
}
async function inviter(email, role) {
  verifier(await sb.from('mk_invitations').upsert({ espace_id: etat.espace.id, email: email.trim().toLowerCase(), role }));
}
async function annulerInvitation(email) {
  verifier(await sb.from('mk_invitations').delete().match({ espace_id: etat.espace.id, email }));
}
async function retirerMembre(userId) {
  verifier(await sb.from('mk_membres').delete().match({ espace_id: etat.espace.id, user_id: userId }));
}

// Reconnexion automatique au démarrage si un espace était ouvert.
async function reprendre(data) {
  const c = config();
  if (!c.url || !c.espaceId) return false;
  try {
    const u = await utilisateurCourant();
    if (!u) { majStatut('local'); return false; }
    const esp = (await listerEspaces()).find(e => e.id === c.espaceId);
    if (!esp) { await quitterEspace(); return false; }
    await ouvrirEspace(esp, data, 'auto');
    return true;
  } catch (e) {
    majStatut('hors_ligne', { erreur: erreurLisible(e) });
    return false;
  }
}


// Seul point d'entrée du module (évite les conflits de noms).
export const sync = { config, etatSync, versDocuments, initialiser, configurer, utilisateurCourant, seConnecter, seDeconnecter, listerEspaces, creerEspace, ouvrirEspace, quitterEspace, planifierEnvoi, envoyerMaintenant, creerPartage, listerPartages, desactiverPartage, membres, inviter, annulerInvitation, retirerMembre, reprendre, erreurLisible };
