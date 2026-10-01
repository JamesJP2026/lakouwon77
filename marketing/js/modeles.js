// Modèles de plans par type de campagne. Les actions sont placées dans la
// période du plan (debut/fin en fraction de la période, 0 → 1) et reçoivent
// une part du budget envisagé (part, en %).
export const MODELES = {
  lancement_produit: {
    label: 'Lancement d\'un produit ou service', motif: 'lancement_produit', mois: 3,
    objectifs: [
      { objectif: 'Faire connaître le nouveau produit', indicateur: 'Personnes touchées', cible: '50 000', echeance: '1 mois' },
      { objectif: 'Réaliser les premières ventes', indicateur: 'Ventes du produit', cible: '200', echeance: '3 mois' },
      { objectif: 'Recueillir des avis clients', indicateur: 'Avis / témoignages', cible: '30', echeance: '3 mois' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Teasing : « bientôt disponible », coulisses, compte à rebours', debut: 0, fin: 0.15, part: 15 },
      { canal: 'Facebook / Instagram', action: 'Publicités ciblées du lancement', debut: 0.15, fin: 0.6, part: 35 },
      { canal: 'Influenceurs', action: 'Essai du produit par 3 à 5 influenceurs locaux', debut: 0.15, fin: 0.4, part: 20 },
      { canal: 'WhatsApp Business', action: 'Offre de lancement aux clients existants', debut: 0.15, fin: 0.3, part: 5 },
      { canal: 'Événementiel', action: 'Journée de lancement / démonstration', debut: 0.15, fin: 0.2, part: 15 },
      { canal: 'Facebook / Instagram', action: 'Témoignages des premiers clients', debut: 0.5, fin: 1, part: 10 },
    ],
    kpis: 'Personnes touchées\nVentes du produit\nCoût par vente\nAvis clients collectés',
  },
  fetes: {
    label: 'Campagne de fin d\'année (Noël, Nouvel An)', motif: 'saison', mois: 2,
    objectifs: [
      { objectif: 'Augmenter les ventes de la période des fêtes', indicateur: 'Chiffre d\'affaires décembre vs novembre', cible: '+40 %', echeance: 'Fin décembre' },
      { objectif: 'Vendre des coffrets / offres cadeaux', indicateur: 'Coffrets vendus', cible: '150', echeance: 'Fin décembre' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Idées cadeaux et coffrets des fêtes', debut: 0, fin: 0.8, part: 30 },
      { canal: 'WhatsApp Business', action: 'Catalogue des fêtes et précommandes', debut: 0, fin: 0.8, part: 5 },
      { canal: 'Radio', action: 'Spots « offres des fêtes »', debut: 0.3, fin: 0.8, part: 30 },
      { canal: 'Promotion en point de vente', action: 'Décoration, emballage cadeau offert', debut: 0.2, fin: 0.85, part: 20 },
      { canal: 'Email marketing', action: 'Vœux et offre du Nouvel An aux clients', debut: 0.85, fin: 1, part: 15 },
    ],
    kpis: 'Chiffre d\'affaires de la période\nCoffrets vendus\nPrécommandes WhatsApp\nPanier moyen',
  },
  ouverture: {
    label: 'Ouverture d\'un nouveau point de vente', motif: 'ouverture', mois: 2,
    objectifs: [
      { objectif: 'Faire connaître la nouvelle adresse', indicateur: 'Personnes touchées dans la zone', cible: '30 000', echeance: 'Ouverture' },
      { objectif: 'Attirer des visiteurs dès l\'ouverture', indicateur: 'Visiteurs la 1re semaine', cible: '500', echeance: '1re semaine' },
    ],
    actions: [
      { canal: 'Affichage / panneaux', action: 'Bâche « ouverture prochaine » et panneaux dans le quartier', debut: 0, fin: 0.5, part: 20 },
      { canal: 'Flyers / prospectus', action: 'Distribution avec bon de réduction d\'ouverture', debut: 0.3, fin: 0.5, part: 15 },
      { canal: 'Facebook / Instagram', action: 'Publicités géolocalisées autour du point de vente', debut: 0.25, fin: 0.75, part: 25 },
      { canal: 'Événementiel', action: 'Inauguration : animation, dégustation, cadeaux', debut: 0.5, fin: 0.55, part: 30 },
      { canal: 'Parrainage / fidélité', action: 'Carte de fidélité offerte aux premiers clients', debut: 0.5, fin: 1, part: 10 },
    ],
    kpis: 'Visiteurs par jour\nVentes de la nouvelle adresse\nBons de réduction utilisés\nCartes de fidélité distribuées',
  },
  notoriete: {
    label: 'Notoriété de la marque', motif: 'notoriete', mois: 6,
    objectifs: [
      { objectif: 'Développer la communauté en ligne', indicateur: 'Abonnés (tous réseaux)', cible: '+50 %', echeance: '6 mois' },
      { objectif: 'Être reconnu dans sa zone', indicateur: 'Recherches du nom de l\'entreprise', cible: '+30 %', echeance: '6 mois' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Contenus réguliers : coulisses, conseils, équipe', debut: 0, fin: 1, part: 30 },
      { canal: 'TikTok', action: 'Vidéos courtes et tendances', debut: 0, fin: 1, part: 20 },
      { canal: 'Relations publiques', action: 'Articles et interviews dans la presse locale', debut: 0.2, fin: 0.8, part: 15 },
      { canal: 'Partenariats', action: 'Partenariats avec des marques ou associations', debut: 0.3, fin: 1, part: 15 },
      { canal: 'Radio', action: 'Présence dans une émission régulière', debut: 0.4, fin: 0.9, part: 20 },
    ],
    kpis: 'Abonnés\nPortée et engagement\nMentions dans la presse\nRecherches du nom',
  },
  relance_ventes: {
    label: 'Relance des ventes / promotion', motif: 'relance', mois: 1,
    objectifs: [
      { objectif: 'Relancer les ventes', indicateur: 'Ventes du mois vs mois précédent', cible: '+25 %', echeance: '1 mois' },
      { objectif: 'Faire revenir les anciens clients', indicateur: 'Clients revenus', cible: '100', echeance: '1 mois' },
    ],
    actions: [
      { canal: 'WhatsApp Business', action: 'Offre spéciale envoyée aux anciens clients', debut: 0, fin: 0.3, part: 10 },
      { canal: 'SMS', action: 'Rappel de l\'offre avant la fin', debut: 0.7, fin: 0.8, part: 10 },
      { canal: 'Facebook / Instagram', action: 'Publicités de l\'offre limitée dans le temps', debut: 0, fin: 0.9, part: 50 },
      { canal: 'Promotion en point de vente', action: 'Affichage de l\'offre et vendeurs mobilisés', debut: 0, fin: 1, part: 30 },
    ],
    kpis: 'Ventes\nClients revenus\nCoût par vente\nTaux d\'utilisation de l\'offre',
  },
  rentree: {
    label: 'Rentrée / inscriptions', motif: 'recrutement', mois: 2,
    objectifs: [
      { objectif: 'Remplir les classes / formations', indicateur: 'Inscriptions', cible: '+20 %', echeance: 'Rentrée' },
      { objectif: 'Générer des demandes d\'information', indicateur: 'Demandes reçues', cible: '400', echeance: '2 mois' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Témoignages d\'élèves et résultats', debut: 0, fin: 0.9, part: 30 },
      { canal: 'Radio', action: 'Spots pendant la période d\'inscription', debut: 0.2, fin: 0.9, part: 30 },
      { canal: 'Événementiel', action: 'Journée portes ouvertes', debut: 0.4, fin: 0.45, part: 20 },
      { canal: 'WhatsApp Business', action: 'Réponses aux parents et rappels d\'inscription', debut: 0, fin: 1, part: 5 },
      { canal: 'Flyers / prospectus', action: 'Distribution dans les quartiers et églises', debut: 0.2, fin: 0.6, part: 15 },
    ],
    kpis: 'Inscriptions\nDemandes d\'information\nVisiteurs des portes ouvertes\nCoût par inscription',
  },
  evenement: {
    label: 'Promotion d\'un événement', motif: 'evenement', mois: 1,
    objectifs: [
      { objectif: 'Remplir l\'événement', indicateur: 'Billets vendus / inscrits', cible: '500', echeance: 'Jour J' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Annonce, affiche et compte à rebours', debut: 0, fin: 0.95, part: 35 },
      { canal: 'Influenceurs', action: 'Invités et artistes relaient l\'événement', debut: 0.2, fin: 0.95, part: 20 },
      { canal: 'Radio', action: 'Spots et invitations à gagner', debut: 0.4, fin: 0.95, part: 30 },
      { canal: 'Affichage / panneaux', action: 'Affiches dans les lieux fréquentés', debut: 0.1, fin: 0.95, part: 15 },
    ],
    kpis: 'Billets vendus\nPersonnes touchées\nCoût par participant',
  },
  diaspora: {
    label: 'Conquête de la diaspora', motif: 'marche', mois: 6,
    objectifs: [
      { objectif: 'Attirer des clients de la diaspora', indicateur: 'Clients hors du pays', cible: '+100', echeance: '6 mois' },
      { objectif: 'Générer des demandes depuis l\'étranger', indicateur: 'Demandes (USA, Canada, France…)', cible: '300', echeance: '6 mois' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Publicités ciblées Miami, New York, Boston, Montréal, Paris', debut: 0, fin: 1, part: 40 },
      { canal: 'YouTube', action: 'Vidéos de présentation et témoignages', debut: 0.1, fin: 1, part: 15 },
      { canal: 'WhatsApp Business', action: 'Service client à distance et paiement facilité', debut: 0, fin: 1, part: 5 },
      { canal: 'Partenariats', action: 'Associations et églises de la diaspora', debut: 0.2, fin: 0.9, part: 20 },
      { canal: 'Radio', action: 'Radios communautaires haïtiennes à l\'étranger', debut: 0.3, fin: 0.9, part: 20 },
    ],
    kpis: 'Clients de la diaspora\nDemandes par pays\nCoût par client\nVentes à distance',
  },
  fidelisation: {
    label: 'Programme de fidélisation', motif: 'fidelisation', mois: 6,
    objectifs: [
      { objectif: 'Faire revenir les clients plus souvent', indicateur: 'Part de clients qui reviennent', cible: '50 %', echeance: '6 mois' },
      { objectif: 'Obtenir des recommandations', indicateur: 'Nouveaux clients parrainés', cible: '150', echeance: '6 mois' },
    ],
    actions: [
      { canal: 'Parrainage / fidélité', action: 'Carte de fidélité ou points', debut: 0, fin: 1, part: 35 },
      { canal: 'Parrainage / fidélité', action: 'Récompense pour chaque client parrainé', debut: 0.1, fin: 1, part: 25 },
      { canal: 'WhatsApp Business', action: 'Messages personnalisés (anniversaire, nouveautés)', debut: 0, fin: 1, part: 10 },
      { canal: 'Email marketing', action: 'Lettre mensuelle et offres réservées aux fidèles', debut: 0.1, fin: 1, part: 10 },
      { canal: 'Événementiel', action: 'Soirée ou journée clients VIP', debut: 0.6, fin: 0.65, part: 20 },
    ],
    kpis: 'Clients qui reviennent\nParrainages\nPanier moyen des clients fidèles',
  },
};

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dansPeriode(debut, fin, frac) {
  const a = new Date(debut + 'T00:00:00').getTime(), b = new Date(fin + 'T00:00:00').getTime();
  return iso(new Date(a + (b - a) * frac));
}

// Ajoute au plan les objectifs, actions (dates et budgets calculés) et KPIs du modèle.
export function appliquerModele(p, cle, remplacer = false) {
  const m = MODELES[cle];
  if (!m) return 0;
  const budget = Number(p.budgetPrevu) || 0;
  const actions = m.actions.map(a => ({
    canal: a.canal, action: a.action, description: '', responsable: '',
    debut: dansPeriode(p.debut, p.fin, a.debut), fin: dansPeriode(p.debut, p.fin, a.fin),
    budget: Math.round(budget * a.part / 100 / 100) * 100,
    statut: 'a_faire', depense: 0, portee: 0, prospects: 0, ventes: 0,
  }));
  p.objectifs = [...(remplacer ? [] : p.objectifs.filter(o => !m.objectifs.some(x => x.objectif === o.objectif))), ...m.objectifs.map(o => ({ ...o, actuel: '', progression: 0 }))];
  p.actions = [...(remplacer ? [] : p.actions), ...actions];
  if (remplacer || !p.kpis.trim()) p.kpis = m.kpis;
  if (!p.motif) p.motif = m.motif;
  p.modele = cle;
  return actions.length;
}
