// Recherche d'informations publiques sur une entreprise avec l'API Claude
// (outils de recherche et de lecture web côté serveur). Le résultat est
// rendu via un outil « remplir_fiche » au schéma strict, puis fusionné
// dans la fiche par app.js.
//
// La clé API de l'utilisateur est envoyée directement depuis le navigateur
// à api.anthropic.com : elle reste stockée dans ce navigateur uniquement.
import { PLATEFORMES, CHAMPS_LABELS } from './fiche.js';

const MODELE = 'claude-opus-5-5';
// Tarifs publics de Claude Opus 5.5 et de la recherche web, pour l'estimation affichée.
const PRIX = { entree: 4 / 1e6, sortie: 20 / 1e6, cacheLecture: 0.2 / 1e6, recherche: 0.01 };

// Le SDK (190 Ko) n'est chargé qu'au moment d'une recherche.
async function chargerSDK() {
  return (await import('./vendor/anthropic-sdk.esm.js')).default;
}

const texte = description => ({ type: 'string', description });
const nombre = description => ({ anyOf: [{ type: 'number' }, { type: 'null' }], description });
const objet = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

const OUTIL_FICHE = {
  name: 'remplir_fiche',
  description: 'Enregistre dans la fiche de l\'entreprise les informations trouvées sur le web. À appeler une seule fois, à la fin de la recherche.',
  strict: true,
  input_schema: objet({
    entreprise_trouvee: { type: 'boolean', description: 'true si des sources concernent bien cette entreprise (même nom et même ville ou pays).' },
    resume: texte('2 à 4 phrases : ce que fait l\'entreprise, pour qui, où. Vide si rien trouvé.'),
    activite: objet({
      description: texte('Description de l\'activité.'),
      produits: texte('Produits ou services principaux, séparés par des virgules.'),
      prix: texte('Gamme de prix publiée, avec la devise. Vide si aucune source.'),
      anciennete: texte('Ancienneté ou année de création, ex. « depuis 2018 ». Vide si inconnue.'),
      zone: texte('Zones ou villes servies.'),
    }),
    clientele: texte('Profil des clients visés, d\'après les sources.'),
    concurrents: texte('Concurrents directs identifiés, un par ligne.'),
    avantage: texte('Ce que l\'entreprise met en avant pour se distinguer.'),
    avis_clients: texte('Ce que disent les clients (avis, commentaires), en quelques lignes. Vide si rien trouvé.'),
    en_ligne: objet(Object.fromEntries(PLATEFORMES.map(p => [p.k, objet({
      url: texte(`Adresse de la page ${p.label} officielle de l'entreprise. Vide si introuvable.`),
      ...Object.fromEntries(p.champs.map(ch => [ch, nombre(`${CHAMPS_LABELS[ch]} (${p.label}), lu dans une source. null si non visible : ne jamais estimer.`)])),
    })]))),
    sources: { type: 'array', description: 'Pages utilisées.', items: objet({ titre: texte('Titre de la page.'), url: texte('Adresse de la page.') }) },
    remarques: texte('Ce qui n\'a pas pu être vérifié, doutes éventuels (homonymes, informations anciennes).'),
  }),
};

const SYSTEME = `Tu aides une agence marketing à préparer le plan marketing d'une entreprise cliente. Recherche sur le web les informations publiques sur cette entreprise : site officiel, pages Facebook, Instagram, TikTok, YouTube, LinkedIn, fiche Google (note et nombre d'avis), application mobile (Google Play, App Store : téléchargements, note, nombre d'avis), articles de presse, avis de clients.

Règles :
- Vérifie que chaque source concerne bien cette entreprise (même nom et même ville ou pays) ; écarte les homonymes.
- N'invente rien. Un chiffre (abonnés, avis, téléchargements…) n'est renseigné que s'il apparaît dans une source ; sinon mets null. Les réseaux sociaux bloquent souvent la lecture directe : les chiffres visibles dans les résultats de recherche ou les aperçus de pages sont acceptables.
- Écris en français.
- Quand tu as terminé, appelle l'outil remplir_fiche une seule fois avec tout ce que tu as trouvé.`;

function messageInitial(c) {
  const f = c.fiche;
  const connus = PLATEFORMES.filter(p => f.enLigne[p.k].url).map(p => `- ${p.label} : ${f.enLigne[p.k].url}`);
  return [
    `Entreprise : ${c.nom}`,
    c.secteurLabel && `Secteur : ${c.secteurLabel}`,
    c.adresse && `Adresse : ${c.adresse}`,
    c.siteWeb && `Site ou réseaux indiqués : ${c.siteWeb}`,
    f.activite.description && `Description connue : ${f.activite.description}`,
    connus.length && `Liens déjà connus :\n${connus.join('\n')}`,
  ].filter(Boolean).join('\n');
}

function cumulerUsage(total, u) {
  if (!u) return;
  total.entree += u.input_tokens || 0;
  total.cacheLecture += u.cache_read_input_tokens || 0;
  total.entree += u.cache_creation_input_tokens || 0;
  total.sortie += u.output_tokens || 0;
  total.recherches += u.server_tool_use?.web_search_requests || 0;
}

// Traduit les erreurs du SDK en messages compréhensibles.
function messageErreur(Anthropic, e) {
  if (e instanceof Anthropic.APIUserAbortError) return 'Recherche annulée.';
  if (e instanceof Anthropic.AuthenticationError) return 'Clé API refusée : vérifiez la clé dans Paramètres → Recherche par IA.';
  if (e instanceof Anthropic.PermissionDeniedError) return 'Cette clé API n\'a pas accès à ce service (vérifiez votre compte sur console.anthropic.com).';
  if (e instanceof Anthropic.RateLimitError) return 'Trop de demandes en peu de temps : réessayez dans une minute.';
  if (e instanceof Anthropic.BadRequestError) return /credit|balance/i.test(e.message) ? 'Crédit insuffisant sur votre compte Anthropic : rechargez-le sur console.anthropic.com.' : `Requête refusée : ${e.message}`;
  if (e instanceof Anthropic.InternalServerError) return 'Le service est momentanément surchargé : réessayez dans quelques minutes.';
  if (e instanceof Anthropic.APIConnectionError) return 'Connexion impossible. Vérifiez internet ; si l\'application est ouverte dans un aperçu intégré, ouvrez le fichier directement dans votre navigateur.';
  return e?.message || 'Erreur inconnue.';
}

// Lance la recherche. Retourne { donnees, usage, cout } ou lève une Error au message lisible.
export async function rechercherEntreprise(client, cleApi, signal) {
  const Anthropic = await chargerSDK();
  const api = new Anthropic({ apiKey: cleApi, dangerouslyAllowBrowser: true });
  const usage = { entree: 0, cacheLecture: 0, sortie: 0, recherches: 0 };
  const messages = [{ role: 'user', content: messageInitial(client) }];

  try {
    for (let tour = 0; tour < 6; tour++) {
      const r = await api.beta.messages.create({
        model: MODELE,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEME,
        tools: [
          { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 6 },
          OUTIL_FICHE,
        ],
        tool_choice: { type: 'auto' },
        messages,
      }, { signal });
      cumulerUsage(usage, r.usage);

      if (r.stop_reason === 'refusal') throw new Error('La demande a été refusée par le service. Essayez de reformuler les informations de l\'entreprise.');
      const appel = r.content.find(b => b.type === 'tool_use' && b.name === 'remplir_fiche');
      if (appel) return { donnees: appel.input, usage, cout: coutEstime(usage) };
      if (r.stop_reason === 'max_tokens') throw new Error('La réponse a été coupée (trop longue). Réessayez.');

      messages.push({ role: 'assistant', content: r.content });
      // pause_turn : la recherche côté serveur reprend d'elle-même quand on renvoie la conversation.
      if (r.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Appelle maintenant l\'outil remplir_fiche avec ce que tu as trouvé.' });
    }
    throw new Error('La recherche n\'a pas abouti. Réessayez.');
  } catch (e) {
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.AnthropicError) throw new Error(messageErreur(Anthropic, e));
    throw e;
  }
}

export const coutEstime = u => u.entree * PRIX.entree + u.cacheLecture * PRIX.cacheLecture + u.sortie * PRIX.sortie + u.recherches * PRIX.recherche;

// Fusionne le résultat dans la fiche. Par défaut ne remplit que les champs vides.
// Retourne la liste des champs modifiés (libellés lisibles).
export function fusionnerResultat(c, d, remplacer = false) {
  const f = c.fiche;
  const modifs = [];
  const poser = (obj, cle, val, libelle) => {
    const v = typeof val === 'string' ? val.trim() : val;
    if (v === null || v === undefined || v === '') return;
    const actuel = obj[cle];
    if (!remplacer && actuel !== '' && actuel !== null && actuel !== undefined && actuel !== 0) return;
    if (String(actuel) === String(v)) return;
    obj[cle] = v;
    modifs.push(libelle);
  };
  poser(f.activite, 'description', d.activite.description || d.resume, 'Description de l\'activité');
  poser(f.activite, 'produits', d.activite.produits, 'Produits / services');
  poser(f.activite, 'prix', d.activite.prix, 'Gamme de prix');
  poser(f.activite, 'anciennete', d.activite.anciennete, 'Ancienneté');
  poser(f.activite, 'zone', d.activite.zone, 'Zone servie');
  poser(f.clientele, 'profil', d.clientele, 'Profil des clients');
  poser(f.concurrence, 'concurrents', d.concurrents, 'Concurrents');
  poser(f.concurrence, 'avantage', d.avantage, 'Atout distinctif');
  poser(f.bases, 'avisClients', d.avis_clients, 'Avis des clients');
  PLATEFORMES.forEach(p => {
    const src = d.en_ligne[p.k];
    if (!src) return;
    poser(f.enLigne[p.k], 'url', src.url, `${p.label} : lien`);
    p.champs.forEach(ch => poser(f.enLigne[p.k], ch, src[ch], `${p.label} : ${CHAMPS_LABELS[ch].toLowerCase()}`));
  });
  // Tout ce qui a été trouvé est conservé tel quel (même ce qui n'a pas pu entrer dans
  // une case déjà remplie), pour l'IA, la fiche et la présentation au client.
  const d0 = new Date();
  f.web = { date: `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')}`, donnees: d };
  return modifs;
}

// ---------------------------------------------------------------------------
// Rédaction assistée : propositions pour une étape du plan (ou tout le plan),
// renvoyées en JSON garanti par les sorties structurées.

const liste = (description, items) => ({ type: 'array', description, items });
const OBJ_OBJECTIF = objet({ objectif: texte('Objectif.'), indicateur: texte('Indicateur mesurable.'), cible: texte('Valeur cible chiffrée.'), echeance: texte('Échéance, ex. « 6 mois ».') });
const OBJ_CIBLE = objet({ nom: texte('Nom court du groupe.'), description: texte('Profil : âge, lieu, revenus, profession…'), besoins: texte('Besoins et motivations.'), canaux: texte('Où et comment les toucher.') });
const OBJ_ACTION = objet({
  canal: texte('Canal, de préférence dans la liste fournie.'), action: texte('Action concrète.'), description: texte('Détails : fréquence, format, zone.'),
  budget: { type: 'number', description: 'Budget en devise du plan.' },
  debut: texte('Date de début AAAA-MM-JJ, dans la période du plan.'), fin: texte('Date de fin AAAA-MM-JJ, dans la période du plan.'),
});
const PARTIES = {
  resume: { resume: texte('Résumé du plan pour le client, 4 à 6 phrases : situation, ambition, stratégie, résultats attendus.') },
  analyse: {
    contexte: texte('Situation actuelle de l\'entreprise, quelques lignes.'), concurrents: texte('Marché et concurrence.'),
    forces: liste('Forces.', texte('Une force.')), faiblesses: liste('Faiblesses.', texte('Une faiblesse.')),
    opportunites: liste('Opportunités.', texte('Une opportunité.')), menaces: liste('Menaces.', texte('Une menace.')),
  },
  objectifs: { objectifs: liste('3 à 5 objectifs SMART.', OBJ_OBJECTIF) },
  cibles: { cibles: liste('2 ou 3 cibles.', OBJ_CIBLE) },
  strategie: {
    positionnement: texte('Positionnement.'), messageCle: texte('Message clé / promesse.'), slogans: liste('3 propositions de slogan courtes.', texte('Un slogan.')),
    ton: texte('Ton de communication.'), produit: texte('Mix : produit / service.'), prix: texte('Mix : prix.'), distribution: texte('Mix : distribution.'), promotion: texte('Mix : communication.'),
  },
  actions: { actions: liste('5 à 8 actions dont la somme des budgets ne dépasse pas le budget envisagé.', OBJ_ACTION) },
  suivi: { kpis: liste('Indicateurs clés.', texte('Un indicateur.')), suivi: texte('Méthode de suivi et de reporting.'), risques: texte('Risques et plan B.') },
  bilan: { bilan: texte('Bilan pour le client : ce qui a fonctionné, ce qui sera ajusté, prochaines étapes. 5 à 8 phrases.') },
};
const CONSIGNES = {
  resume: 'Rédige le résumé du plan.',
  analyse: 'Rédige l\'analyse de la situation et le SWOT (3 à 5 éléments par case), en t\'appuyant sur la fiche et le diagnostic.',
  objectifs: 'Propose des objectifs SMART cohérents avec le motif du plan et les chiffres actuels de l\'entreprise.',
  cibles: 'Décris les cibles prioritaires.',
  strategie: 'Propose la stratégie : positionnement, message clé, 3 slogans, ton et marketing mix.',
  actions: 'Propose le plan d\'action avec budgets et dates, adapté aux moyens de l\'entreprise et à son marché.',
  suivi: 'Propose les indicateurs de suivi, la méthode de reporting et les risques.',
  bilan: 'Rédige le bilan à partir des résultats réels saisis.',
  tout: 'Rédige un brouillon complet du plan marketing (toutes les parties).',
};

export const SECTIONS_IA = Object.keys(CONSIGNES);

const SYSTEME_REDACTION = `Tu es consultant senior dans une agence marketing et publicitaire. Tu rédiges, en français clair et concret, des parties de plans marketing pour des entreprises de tout secteur, notamment en Haïti et dans la diaspora. Appuie-toi uniquement sur les informations fournies (entreprise, fiche, diagnostic, plan en cours) ; quand une information manque, fais des propositions réalistes et prudentes plutôt que d'inventer des faits ou des chiffres présentés comme réels. Les montants sont dans la devise indiquée.`;

async function appelStructure(cleApi, systeme, contenu, schema, signal, effort = 'medium') {
  const Anthropic = await chargerSDK();
  const api = new Anthropic({ apiKey: cleApi, dangerouslyAllowBrowser: true });
  try {
    const r = await api.beta.messages.create({
      model: MODELE, max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort, format: { type: 'json_schema', schema } },
      system: systeme,
      messages: [{ role: 'user', content: contenu }],
    }, { signal });
    if (r.stop_reason === 'refusal') throw new Error('La demande a été refusée par le service.');
    if (r.stop_reason === 'max_tokens') throw new Error('La réponse a été coupée (trop longue). Réessayez sur une seule étape.');
    const bloc = r.content.find(b => b.type === 'text');
    if (!bloc) throw new Error('Réponse vide. Réessayez.');
    const usage = { entree: 0, cacheLecture: 0, sortie: 0, recherches: 0 };
    cumulerUsage(usage, r.usage);
    return { donnees: JSON.parse(bloc.text), cout: coutEstime(usage) };
  } catch (e) {
    if (e instanceof Anthropic.APIError || e instanceof Anthropic.AnthropicError) throw new Error(messageErreur(Anthropic, e));
    throw e;
  }
}

// section : une clé de CONSIGNES ; contexte : texte décrivant l'entreprise et le plan.
export async function genererSection(cleApi, section, contexte, signal) {
  const props = section === 'tout'
    ? Object.assign({}, ...['resume', 'analyse', 'objectifs', 'cibles', 'strategie', 'actions', 'suivi'].map(k => PARTIES[k]))
    : PARTIES[section];
  return appelStructure(cleApi, SYSTEME_REDACTION, `${contexte}\n\nTâche : ${CONSIGNES[section]}`, objet(props), signal);
}

// Usage générique (calendrier, rapports…) : consigne libre + schéma de propriétés.
export async function genererLibre(cleApi, consigne, contexte, proprietes, signal, effort) {
  return appelStructure(cleApi, SYSTEME_REDACTION, `${contexte}\n\nTâche : ${consigne}`, objet(proprietes), signal, effort);
}
export const schema = { texte, nombre, objet, liste };
