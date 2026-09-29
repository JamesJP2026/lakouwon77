// Fiche entreprise : questionnaire sur le client et audit de sa présence
// en ligne. Les réponses servent à diagnostiquer la situation et à adapter
// automatiquement le plan (contexte, SWOT, cibles, actions, objectifs).
import { num, fmt } from './store.js';

// Plateformes auditées et les chiffres demandés pour chacune.
export const PLATEFORMES = [
  { k: 'facebook', label: 'Facebook', champs: ['abonnes', 'pubsMois', 'interactions'], canal: 'Facebook / Instagram', social: true },
  { k: 'instagram', label: 'Instagram', champs: ['abonnes', 'pubsMois', 'interactions'], canal: 'Facebook / Instagram', social: true },
  { k: 'tiktok', label: 'TikTok', champs: ['abonnes', 'pubsMois', 'interactions'], canal: 'TikTok', social: true },
  { k: 'youtube', label: 'YouTube', champs: ['abonnes', 'pubsMois', 'interactions'], canal: 'YouTube', social: true },
  { k: 'linkedin', label: 'LinkedIn', champs: ['abonnes', 'pubsMois', 'interactions'], canal: 'LinkedIn', social: true },
  { k: 'google', label: 'Fiche Google (Maps)', champs: ['note', 'avis'], canal: 'Site web / SEO' },
  { k: 'site', label: 'Site web', champs: ['visites'], canal: 'Site web / SEO' },
  { k: 'whatsapp', label: 'WhatsApp Business', champs: ['contacts'], canal: 'WhatsApp Business' },
  { k: 'appli', label: 'Application mobile', champs: ['telechargements', 'note', 'avis'], canal: 'Application mobile' },
];

export const CHAMPS_LABELS = {
  abonnes: 'Abonnés', pubsMois: 'Publications / mois', interactions: 'Interactions moy. / publication',
  note: 'Note (sur 5)', avis: 'Nombre d\'avis', visites: 'Visites / mois', contacts: 'Contacts', telechargements: 'Téléchargements',
};

export const SUPPORTS = { logo: 'Logo', charte: 'Charte graphique (couleurs, polices)', photos: 'Photos professionnelles', videos: 'Vidéos', catalogue: 'Catalogue / menu / brochure', fichierClients: 'Fichier clients' };

export const DECOUVERTE = ['Bouche-à-oreille', 'Réseaux sociaux', 'Passage devant le local', 'Google / Internet', 'Radio / TV', 'Recommandation de partenaires', 'Publicité payante', 'Salons / événements'];

export function ficheVide() {
  return {
    activite: { description: '', produits: '', prix: '', anciennete: '', employes: '', zone: '', ca: '', saisonnalite: '' },
    clientele: { profil: '', decouverte: [], clientsMois: '', fideles: '' },
    concurrence: { concurrents: '', avantage: '', problemes: '' },
    enLigne: Object.fromEntries(PLATEFORMES.map(p => [p.k, { url: '', ...Object.fromEntries(p.champs.map(c => [c, ''])) }])),
    bases: { contactsClients: '', emails: '', avisClients: '', meilleuresPubs: '' },
    moyens: { budgetMensuel: '', gestionnaire: '', supports: {} },
    recherche: '', majLe: '',
  };
}

// Complète une fiche ancienne ou partielle sans rien perdre.
export function normaliserFiche(c) {
  const v = ficheVide();
  const f = c.fiche || {};
  c.fiche = {
    ...v, ...f,
    activite: { ...v.activite, ...f.activite }, clientele: { ...v.clientele, ...f.clientele },
    concurrence: { ...v.concurrence, ...f.concurrence }, bases: { ...v.bases, ...f.bases },
    moyens: { ...v.moyens, ...f.moyens, supports: { ...(f.moyens?.supports || {}) } },
    enLigne: Object.fromEntries(PLATEFORMES.map(p => [p.k, { ...v.enLigne[p.k], ...(f.enLigne?.[p.k] || {}) }])),
  };
  if (!Array.isArray(c.fiche.clientele.decouverte)) c.fiche.clientele.decouverte = [];
  return c;
}

const rempli = v => String(v ?? '').trim().length > 0;
const plateformeActive = d => rempli(d.url) || Object.entries(d).some(([k, v]) => k !== 'url' && num(v) > 0);

// Pourcentage de complétude de la fiche (questions clés uniquement).
export function completude(c) {
  const f = c.fiche;
  const cles = [
    f.activite.description, f.activite.produits, f.activite.prix, f.activite.anciennete, f.activite.zone,
    f.clientele.profil, f.clientele.decouverte.length ? 'x' : '', f.concurrence.concurrents, f.concurrence.avantage,
    f.concurrence.problemes, f.moyens.budgetMensuel,
    PLATEFORMES.some(p => plateformeActive(f.enLigne[p.k])) ? 'x' : '',
  ];
  return Math.round(cles.filter(rempli).length / cles.length * 100);
}

// Liens de recherche pour vérifier ce qui existe déjà sur internet.
export function liensRecherche(c) {
  const q = [c.nom, (c.adresse || '').split(',').pop()?.trim()].filter(Boolean).join(' ');
  const e = encodeURIComponent;
  return [
    ['Google', `https://www.google.com/search?q=${e(q)}`],
    ['Google Maps / avis', `https://www.google.com/maps/search/${e(q)}`],
    ['Facebook', `https://www.facebook.com/search/top?q=${e(c.nom)}`],
    ['Instagram', `https://www.google.com/search?q=${e(c.nom + ' site:instagram.com')}`],
    ['TikTok', `https://www.tiktok.com/search?q=${e(c.nom)}`],
    ['Actualités', `https://www.google.com/search?tbm=nws&q=${e(c.nom)}`],
  ];
}

const nb = v => fmt(v).replace(/,00$/, '');

// Diagnostic : constats classés en force / faiblesse / opportunité, avec
// l'action et l'objectif à proposer dans le plan quand c'est pertinent.
export function diagnostic(c) {
  const f = c.fiche;
  const out = [];
  const add = (type, texte, extra = {}) => out.push({ type, texte, ...extra });
  const el = f.enLigne;

  const sociaux = PLATEFORMES.filter(p => p.social && num(el[p.k].abonnes) > 0)
    .map(p => ({ p, d: el[p.k], abonnes: num(el[p.k].abonnes), taux: num(el[p.k].interactions) / num(el[p.k].abonnes) * 100 }));

  if (sociaux.length) {
    const top = [...sociaux].sort((a, b) => b.abonnes - a.abonnes)[0];
    add('force', `Communauté déjà constituée sur ${top.p.label} : ${nb(top.abonnes)} abonnés.`, {
      objectif: { objectif: `Développer la communauté ${top.p.label}`, indicateur: `Abonnés ${top.p.label} (aujourd'hui ${nb(top.abonnes)})`, cible: `${nb(Math.round(top.abonnes * 1.3))} (+30 %)`, echeance: '6 mois' },
    });
  }
  sociaux.forEach(({ p, d, taux }) => {
    if (num(d.interactions) > 0) {
      if (taux >= 3) add('force', `Bon engagement sur ${p.label} (${taux.toFixed(1).replace('.', ',')} % d'interactions par publication).`);
      else if (taux < 1) add('faiblesse', `Engagement faible sur ${p.label} (${taux.toFixed(1).replace('.', ',')} %) : le contenu actuel fait peu réagir.`, {
        action: { canal: p.canal, action: `${p.label} : nouveaux formats (vidéos courtes, questions, concours, coulisses)` } });
    }
    if (rempli(d.pubsMois) && num(d.pubsMois) < 8) add('faiblesse', `Publication irrégulière sur ${p.label} (${nb(d.pubsMois)} par mois) : viser au moins 2 à 3 par semaine.`, {
      action: { canal: p.canal, action: `${p.label} : calendrier éditorial de 3 publications par semaine` } });
  });

  const absents = ['facebook', 'instagram', 'tiktok'].filter(k => !plateformeActive(el[k]));
  if (absents.length && absents.length < 3) add('opportunite', `Pas encore présent sur ${absents.map(k => PLATEFORMES.find(p => p.k === k).label).join(', ')}.`);
  if (absents.length === 3) add('faiblesse', 'Aucune présence sur les réseaux sociaux : l\'entreprise est invisible pour une grande partie des clients.', {
    action: { canal: 'Facebook / Instagram', action: 'Création et animation des pages Facebook et Instagram' } });

  const g = el.google;
  if (!plateformeActive(g)) add('opportunite', 'Pas de fiche Google : la créer (gratuit) permet d\'apparaître sur Google Maps et dans les recherches locales.', {
    action: { canal: 'Site web / SEO', action: 'Création et optimisation de la fiche Google (Maps, horaires, photos, avis)' } });
  else if (num(g.note) > 0) {
    if (num(g.note) >= 4.5 && num(g.avis) >= 10) add('force', `Excellente réputation en ligne : ${String(g.note).replace('.', ',')}/5 sur ${nb(g.avis)} avis Google.`);
    else if (num(g.note) < 4) add('faiblesse', `Note Google de ${String(g.note).replace('.', ',')}/5 : répondre à tous les avis et demander aux clients satisfaits d'en laisser.`, {
      action: { canal: 'Site web / SEO', action: 'Gestion de la réputation : réponses aux avis et collecte d\'avis clients' },
      objectif: { objectif: 'Améliorer la réputation en ligne', indicateur: `Note Google (aujourd'hui ${String(g.note).replace('.', ',')})`, cible: '4,5 / 5', echeance: '6 mois' } });
    if (num(g.avis) > 0 && num(g.avis) < 10) add('opportunite', `Seulement ${nb(g.avis)} avis Google : chaque nouvel avis renforce la confiance.`);
  }

  const app = el.appli;
  if (plateformeActive(app)) {
    add('force', `Application mobile disponible${num(app.telechargements) ? ` (${nb(app.telechargements)} téléchargements)` : ''} : un canal direct vers les clients.`, {
      action: { canal: 'Application mobile', action: 'Campagne de téléchargement de l\'application (offre sur la 1re commande, notifications)' },
      objectif: num(app.telechargements) ? { objectif: 'Augmenter les téléchargements de l\'application', indicateur: `Téléchargements (aujourd'hui ${nb(app.telechargements)})`, cible: `${nb(Math.round(num(app.telechargements) * 1.5))} (+50 %)`, echeance: '6 mois' } : undefined,
    });
    if (num(app.note) > 0 && num(app.note) < 4) add('faiblesse', `Note de l'application : ${String(app.note).replace('.', ',')}/5 : corriger les points cités dans les avis et inviter les clients satisfaits à noter l'application.`, {
      action: { canal: 'Application mobile', action: 'Amélioration de la note de l\'application (réponses aux avis, demande d\'avis après livraison)' } });
  }
  if (!plateformeActive(el.site)) add('opportunite', 'Pas de site web : une page simple ou un catalogue en ligne renforcerait la crédibilité.');

  const contacts = num(el.whatsapp.contacts) + num(f.bases.contactsClients);
  if (contacts >= 100) add('force', `Base de ${nb(contacts)} contacts clients déjà accumulée.`, {
    action: { canal: 'WhatsApp Business', action: `Diffusions WhatsApp / SMS vers les ${nb(contacts)} contacts existants (offres, nouveautés)` } });
  if (num(f.bases.emails) >= 100) add('opportunite', `${nb(f.bases.emails)} adresses email disponibles pour une lettre d'information.`, {
    action: { canal: 'Email marketing', action: 'Lettre d\'information mensuelle aux clients existants' } });

  if (f.clientele.decouverte.includes('Bouche-à-oreille')) add('force', 'Les clients recommandent déjà l\'entreprise (bouche-à-oreille).', {
    action: { canal: 'Parrainage / fidélité', action: 'Programme de parrainage : récompenser les clients qui recommandent' } });
  if (rempli(f.clientele.fideles) && num(f.clientele.fideles) < 30) add('faiblesse', `Peu de clients reviennent (${nb(f.clientele.fideles)} %) : travailler la fidélisation.`, {
    action: { canal: 'Parrainage / fidélité', action: 'Carte ou programme de fidélité' } });
  if (rempli(f.concurrence.avantage)) add('force', `Atout distinctif : ${f.concurrence.avantage.split('\n')[0]}`);
  if (rempli(f.concurrence.problemes)) f.concurrence.problemes.split('\n').filter(rempli).slice(0, 3)
    .forEach(pb => add('faiblesse', pb.trim()));
  const manque = Object.keys(SUPPORTS).filter(k => ['logo', 'photos'].includes(k) && !f.moyens.supports[k]);
  if (manque.length) add('faiblesse', `Supports manquants : ${manque.map(k => SUPPORTS[k].toLowerCase()).join(', ')}.`, {
    action: { canal: 'Relations publiques', action: `Création des supports de base (${manque.map(k => SUPPORTS[k].toLowerCase()).join(', ')})` } });
  return out;
}

// Texte de contexte rédigé à partir des réponses.
export function texteContexte(c) {
  const a = c.fiche.activite, cl = c.fiche.clientele, m = c.fiche.moyens;
  const l = [];
  if (a.description) l.push(a.description.trim());
  if (a.produits) l.push(`Produits / services : ${a.produits.trim()}.`);
  if (a.prix) l.push(`Gamme de prix : ${a.prix.trim()}.`);
  const faits = [a.anciennete && `${a.anciennete} d'existence`, a.employes && `${a.employes} employé(s)`, a.zone && `zone servie : ${a.zone}`].filter(Boolean);
  if (faits.length) l.push(faits.join(', ') + '.');
  if (cl.clientsMois) l.push(`Environ ${cl.clientsMois} clients par mois${cl.fideles ? `, dont ${cl.fideles} % de clients réguliers` : ''}.`);
  if (cl.decouverte.length) l.push(`Les clients découvrent l'entreprise par : ${cl.decouverte.join(', ').toLowerCase()}.`);
  if (a.saisonnalite) l.push(`Saisonnalité : ${a.saisonnalite.trim()}.`);
  if (m.gestionnaire) l.push(`Communication actuellement gérée par : ${m.gestionnaire.trim()}.`);
  if (c.fiche.recherche) l.push(`Informations trouvées en ligne : ${c.fiche.recherche.trim()}`);
  return l.join('\n');
}

// Ajoute au plan ce que la fiche apporte, sans effacer le travail existant.
export function appliquerFiche(p, c, moisCampagne) {
  const f = c.fiche;
  const diag = diagnostic(c);
  const ajoute = { swot: 0, actions: 0, objectifs: 0 };
  if (!rempli(p.contexte)) p.contexte = texteContexte(c);
  if (!rempli(p.concurrents) && rempli(f.concurrence.concurrents)) p.concurrents = f.concurrence.concurrents;
  const swotKey = { force: 'forces', faiblesse: 'faiblesses', opportunite: 'opportunites' };
  diag.forEach(d => {
    const k = swotKey[d.type];
    if (!p.swot[k].includes(d.texte)) { p.swot[k] = [p.swot[k], d.texte].filter(rempli).join('\n'); ajoute.swot++; }
    if (d.action && !p.actions.some(a => a.action === d.action.action)) {
      p.actions.push({ ...d.action, description: '', debut: p.debut, fin: p.fin, budget: 0, responsable: '', statut: 'a_faire', depense: 0, portee: 0, prospects: 0, ventes: 0 });
      ajoute.actions++;
    }
    if (d.objectif && !p.objectifs.some(o => o.objectif === d.objectif.objectif)) { p.objectifs.push({ ...d.objectif, actuel: '', progression: 0 }); ajoute.objectifs++; }
  });
  if (rempli(f.clientele.profil) && !p.cibles.some(x => x.nom === 'Clients actuels'))
    p.cibles.unshift({ nom: 'Clients actuels', description: f.clientele.profil, besoins: '', canaux: f.clientele.decouverte.join(', ') });
  if (!num(p.budgetPrevu) && num(f.moyens.budgetMensuel) && moisCampagne) p.budgetPrevu = num(f.moyens.budgetMensuel) * moisCampagne;
  return ajoute;
}
