// Suggestions par secteur d'activité. Elles servent à pré-remplir un plan
// ou à proposer des idées en un clic : l'utilisateur garde la main sur
// tout le contenu et peut tout modifier.

// Raisons pour lesquelles une entreprise commande un plan marketing.
export const MOTIFS = {
  lancement_entreprise: 'Lancement d\'une nouvelle entreprise',
  lancement_produit: 'Lancement d\'un nouveau produit ou service',
  ventes: 'Augmenter les ventes',
  notoriete: 'Faire connaître la marque (notoriété)',
  ouverture: 'Ouverture d\'un nouveau point de vente / d\'une succursale',
  saison: 'Promotion saisonnière (fêtes, rentrée, carnaval…)',
  evenement: 'Promotion d\'un événement',
  image: 'Changer ou moderniser l\'image de marque',
  relance: 'Relancer une activité en baisse / reconquérir des clients',
  marche: 'Conquérir un nouveau marché (autre ville, diaspora, export)',
  fidelisation: 'Fidéliser la clientèle',
  collecte: 'Collecte de fonds / mobilisation (ONG, église)',
  recrutement: 'Recrutement / inscriptions',
  autre: 'Autre (à préciser)',
};

export const CANAUX = [
  'Facebook / Instagram', 'TikTok', 'WhatsApp Business', 'Google Ads', 'Site web / SEO',
  'Email marketing', 'SMS', 'Radio', 'Télévision', 'Presse écrite', 'Affichage / panneaux',
  'Flyers / prospectus', 'Événementiel', 'Influenceurs', 'Partenariats', 'Relations publiques',
  'Parrainage / fidélité', 'Promotion en point de vente', 'LinkedIn', 'YouTube', 'Application mobile',
];

const COMMUN = {
  objectifs: [
    { objectif: 'Augmenter la notoriété de la marque', indicateur: 'Abonnés / portée des publications', cible: '+30 %', echeance: '6 mois' },
    { objectif: 'Augmenter le chiffre d\'affaires', indicateur: 'Ventes mensuelles', cible: '+20 %', echeance: '12 mois' },
    { objectif: 'Fidéliser la clientèle existante', indicateur: 'Taux de clients qui reviennent', cible: '40 %', echeance: '6 mois' },
  ],
  kpis: 'Portée et engagement sur les réseaux sociaux\nNombre de demandes / prospects générés\nCoût par prospect\nChiffre d\'affaires mensuel\nRetour sur investissement publicitaire (ROI)',
  suivi: 'Rapport mensuel des résultats avec le client.\nRéunion de bilan à mi-parcours pour ajuster les actions et le budget.',
  risques: 'Budget insuffisant sur un canal : réaffecter vers les canaux les plus performants.\nFaible engagement en ligne : tester de nouveaux formats (vidéo courte, concours).',
};

export const SECTEURS = {
  restaurant: {
    label: 'Restauration / Alimentation',
    swot: { forces: 'Qualité et goût des plats\nEmplacement', faiblesses: 'Faible présence en ligne\nCapacité limitée', opportunites: 'Livraison à domicile\nÉvénements et traiteur', menaces: 'Concurrence des autres restaurants\nHausse du prix des matières premières' },
    objectifs: [
      { objectif: 'Augmenter la fréquentation en semaine', indicateur: 'Couverts par jour', cible: '+25 %', echeance: '3 mois' },
      { objectif: 'Lancer la livraison / commande en ligne', indicateur: 'Commandes WhatsApp par semaine', cible: '50', echeance: '3 mois' },
    ],
    cibles: [
      { nom: 'Travailleurs du quartier', description: '25-45 ans, travaillent à proximité', besoins: 'Repas rapide, bon rapport qualité-prix à midi', canaux: 'WhatsApp, flyers, Facebook' },
      { nom: 'Familles le week-end', description: 'Parents avec enfants', besoins: 'Ambiance conviviale, menus familles', canaux: 'Facebook, Instagram, radio' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Photos et vidéos des plats 4 fois / semaine' },
      { canal: 'WhatsApp Business', action: 'Catalogue du menu et commandes en ligne' },
      { canal: 'Flyers / prospectus', action: 'Distribution dans les bureaux voisins' },
      { canal: 'Parrainage / fidélité', action: 'Carte de fidélité : 10e repas offert' },
    ],
    positionnement: 'Le restaurant de référence du quartier pour une cuisine savoureuse, rapide et abordable.',
  },
  commerce: {
    label: 'Commerce / Boutique',
    swot: { forces: 'Choix de produits\nRelation client de proximité', faiblesses: 'Pas de vente en ligne\nVitrine peu visible', opportunites: 'Vente via réseaux sociaux\nPériodes de fêtes', menaces: 'Grandes surfaces\nVente en ligne internationale' },
    objectifs: [
      { objectif: 'Développer la vente en ligne', indicateur: 'Commandes via réseaux sociaux / mois', cible: '100', echeance: '6 mois' },
      { objectif: 'Augmenter le panier moyen', indicateur: 'Panier moyen', cible: '+15 %', echeance: '6 mois' },
    ],
    cibles: [
      { nom: 'Clients réguliers du quartier', description: 'Habitants à proximité', besoins: 'Disponibilité, prix justes, crédit de confiance', canaux: 'WhatsApp, promotions en boutique' },
      { nom: 'Acheteurs en ligne', description: '18-35 ans, actifs sur les réseaux', besoins: 'Commander facilement, livraison', canaux: 'Instagram, TikTok, Facebook' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Publication des nouveautés et promotions' },
      { canal: 'TikTok', action: 'Vidéos courtes de présentation produits' },
      { canal: 'Promotion en point de vente', action: 'Soldes saisonniers et offres groupées' },
      { canal: 'Parrainage / fidélité', action: 'Programme de points de fidélité' },
    ],
    positionnement: 'La boutique de confiance où l\'on trouve ce qu\'il faut, au bon prix, avec un service humain.',
  },
  services: {
    label: 'Services aux entreprises / Conseil',
    swot: { forces: 'Expertise de l\'équipe\nRéférences clients', faiblesses: 'Peu de visibilité\nDépendance à quelques gros clients', opportunites: 'Digitalisation des PME\nAppels d\'offres', menaces: 'Concurrence à bas prix\nConjoncture économique' },
    objectifs: [
      { objectif: 'Générer des prospects qualifiés', indicateur: 'Demandes de devis / mois', cible: '20', echeance: '6 mois' },
      { objectif: 'Renforcer l\'image d\'expert', indicateur: 'Publications / conférences', cible: '2 / mois', echeance: '12 mois' },
    ],
    cibles: [
      { nom: 'Dirigeants de PME', description: 'Propriétaires ou gérants, 30-60 ans', besoins: 'Gagner du temps, réduire les coûts, fiabilité', canaux: 'LinkedIn, email, événements' },
    ],
    actions: [
      { canal: 'LinkedIn', action: 'Articles d\'expertise et études de cas' },
      { canal: 'Site web / SEO', action: 'Refonte du site + page de prise de rendez-vous' },
      { canal: 'Email marketing', action: 'Newsletter mensuelle aux prospects' },
      { canal: 'Événementiel', action: 'Petit-déjeuner d\'affaires trimestriel' },
    ],
    positionnement: 'Le partenaire fiable qui aide les entreprises à se développer avec des résultats mesurables.',
  },
  beaute: {
    label: 'Beauté / Mode / Bien-être',
    swot: { forces: 'Savoir-faire\nClientèle fidèle', faiblesses: 'Prise de rendez-vous manuelle\nPeu de contenus visuels', opportunites: 'Tendances sur TikTok / Instagram\nMariages et événements', menaces: 'Nouveaux salons concurrents\nPrestataires à domicile' },
    objectifs: [
      { objectif: 'Remplir l\'agenda en semaine', indicateur: 'Taux d\'occupation', cible: '80 %', echeance: '3 mois' },
      { objectif: 'Développer la communauté Instagram', indicateur: 'Abonnés', cible: '+2 000', echeance: '6 mois' },
    ],
    cibles: [
      { nom: 'Jeunes femmes actives', description: '20-40 ans, urbaines', besoins: 'Être belle pour le travail et les sorties, gain de temps', canaux: 'Instagram, TikTok, WhatsApp' },
    ],
    actions: [
      { canal: 'Instagram', action: 'Avant / après et coulisses du salon' },
      { canal: 'Influenceurs', action: 'Collaboration avec 3 micro-influenceuses locales' },
      { canal: 'WhatsApp Business', action: 'Prise de rendez-vous et rappels' },
      { canal: 'Parrainage / fidélité', action: 'Réduction pour chaque amie parrainée' },
    ],
    positionnement: 'L\'adresse tendance où chaque cliente repart plus belle et plus confiante.',
  },
  sante: {
    label: 'Santé / Clinique / Pharmacie',
    swot: { forces: 'Personnel qualifié\nConfiance des patients', faiblesses: 'Délais d\'attente\nCommunication limitée', opportunites: 'Prévention et dépistage\nTéléconsultation', menaces: 'Réglementation\nConcurrence des grands centres' },
    objectifs: [
      { objectif: 'Faire connaître les nouveaux services', indicateur: 'Nouveaux patients / mois', cible: '+15 %', echeance: '6 mois' },
      { objectif: 'Sensibiliser à la prévention', indicateur: 'Participants aux journées de dépistage', cible: '300', echeance: '12 mois' },
    ],
    cibles: [
      { nom: 'Familles de la zone', description: 'Parents, 25-55 ans', besoins: 'Soins accessibles, fiables et proches', canaux: 'Radio, Facebook, bouche-à-oreille' },
    ],
    actions: [
      { canal: 'Radio', action: 'Chronique santé hebdomadaire' },
      { canal: 'Événementiel', action: 'Journée de dépistage gratuit' },
      { canal: 'Facebook / Instagram', action: 'Conseils santé et présentation de l\'équipe' },
    ],
    positionnement: 'Des soins de qualité, humains et accessibles, près de chez vous.',
  },
  immobilier: {
    label: 'Immobilier / Construction',
    swot: { forces: 'Portefeuille de biens\nConnaissance du terrain', faiblesses: 'Cycle de vente long\nVisuels de faible qualité', opportunites: 'Diaspora qui investit\nVisites virtuelles', menaces: 'Insécurité foncière\nInstabilité économique' },
    objectifs: [
      { objectif: 'Générer des contacts acheteurs', indicateur: 'Leads qualifiés / mois', cible: '40', echeance: '6 mois' },
      { objectif: 'Toucher la diaspora', indicateur: 'Leads hors du pays', cible: '30 %', echeance: '12 mois' },
    ],
    cibles: [
      { nom: 'Diaspora', description: '30-60 ans, vivant à l\'étranger', besoins: 'Investir en toute sécurité, suivi à distance', canaux: 'Facebook, YouTube, WhatsApp' },
      { nom: 'Jeunes ménages', description: '28-45 ans', besoins: 'Premier logement, facilités de paiement', canaux: 'Facebook, radio, salons' },
    ],
    actions: [
      { canal: 'YouTube', action: 'Visites vidéo des biens et chantiers' },
      { canal: 'Facebook / Instagram', action: 'Campagnes ciblées diaspora (USA, Canada, France)' },
      { canal: 'Événementiel', action: 'Portes ouvertes et salon de l\'immobilier' },
    ],
    positionnement: 'L\'expert immobilier de confiance pour investir sereinement, ici ou depuis l\'étranger.',
  },
  education: {
    label: 'Éducation / Formation',
    swot: { forces: 'Qualité des formateurs\nRésultats des élèves', faiblesses: 'Inscriptions concentrées sur une période\nPeu de visibilité en ligne', opportunites: 'Formations en ligne\nFormations professionnelles courtes', menaces: 'Écoles concurrentes\nPouvoir d\'achat des familles' },
    objectifs: [
      { objectif: 'Augmenter les inscriptions', indicateur: 'Nombre d\'inscrits', cible: '+20 %', echeance: 'Rentrée' },
    ],
    cibles: [
      { nom: 'Parents d\'élèves', description: '30-55 ans', besoins: 'Réussite et sécurité de leurs enfants', canaux: 'Radio, Facebook, réunions' },
      { nom: 'Jeunes adultes', description: '18-30 ans en recherche d\'emploi', besoins: 'Compétences pratiques et diplôme reconnu', canaux: 'TikTok, Instagram, WhatsApp' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Témoignages d\'anciens élèves' },
      { canal: 'Événementiel', action: 'Journée portes ouvertes' },
      { canal: 'Radio', action: 'Spots pendant la période d\'inscription' },
    ],
    positionnement: 'L\'établissement qui prépare vraiment à la réussite.',
  },
  tech: {
    label: 'Technologie / Digital',
    swot: { forces: 'Innovation\nÉquipe technique', faiblesses: 'Offre difficile à expliquer\nNotoriété faible', opportunites: 'Transformation digitale\nMarchés régionaux', menaces: 'Solutions internationales\nConnexion internet limitée' },
    objectifs: [
      { objectif: 'Acquérir des utilisateurs', indicateur: 'Inscriptions / mois', cible: '500', echeance: '6 mois' },
      { objectif: 'Convertir en clients payants', indicateur: 'Taux de conversion', cible: '5 %', echeance: '6 mois' },
    ],
    cibles: [
      { nom: 'Early adopters', description: '18-35 ans, connectés', besoins: 'Outils simples et modernes', canaux: 'TikTok, Instagram, YouTube' },
    ],
    actions: [
      { canal: 'Google Ads', action: 'Campagne de recherche sur mots-clés métier' },
      { canal: 'YouTube', action: 'Tutoriels et démonstrations' },
      { canal: 'Site web / SEO', action: 'Page d\'atterrissage + essai gratuit' },
    ],
    positionnement: 'La solution simple et locale qui fait gagner du temps au quotidien.',
  },
  tourisme: {
    label: 'Tourisme / Hôtellerie / Loisirs',
    swot: { forces: 'Cadre et paysages\nAccueil', faiblesses: 'Saisonnalité\nRéservations peu digitalisées', opportunites: 'Tourisme local et diaspora\nÉvénements culturels', menaces: 'Image du pays à l\'étranger\nConcurrence régionale' },
    objectifs: [
      { objectif: 'Augmenter le taux d\'occupation', indicateur: 'Nuitées / mois', cible: '+25 %', echeance: '12 mois' },
    ],
    cibles: [
      { nom: 'Diaspora en vacances', description: 'Familles, séjours de fin d\'année et d\'été', besoins: 'Confort, sécurité, activités', canaux: 'Facebook, Instagram, WhatsApp' },
      { nom: 'Entreprises locales', description: 'Séminaires et team-building', besoins: 'Salles, restauration, forfaits', canaux: 'LinkedIn, email, démarchage' },
    ],
    actions: [
      { canal: 'Instagram', action: 'Photos et reels du site, contenus d\'influenceurs voyage' },
      { canal: 'Partenariats', action: 'Offres avec agences de voyage et compagnies aériennes' },
      { canal: 'Email marketing', action: 'Offres saisonnières aux anciens clients' },
    ],
    positionnement: 'Une expérience authentique et inoubliable, dans un cadre sûr et chaleureux.',
  },
  industrie: {
    label: 'Industrie / Agriculture / Production',
    swot: { forces: 'Production locale\nQualité des produits', faiblesses: 'Réseau de distribution limité\nPackaging', opportunites: 'Consommer local\nExportation', menaces: 'Importations bon marché\nCoût de l\'énergie' },
    objectifs: [
      { objectif: 'Élargir le réseau de distributeurs', indicateur: 'Points de vente', cible: '+30', echeance: '12 mois' },
    ],
    cibles: [
      { nom: 'Revendeurs / grossistes', description: 'Commerçants et supermarchés', besoins: 'Marge, régularité des livraisons', canaux: 'Démarchage, WhatsApp, salons' },
      { nom: 'Consommateurs finaux', description: 'Ménages', besoins: 'Produits de qualité, locaux, abordables', canaux: 'Radio, TV, promotion en magasin' },
    ],
    actions: [
      { canal: 'Promotion en point de vente', action: 'Dégustations / démonstrations en supermarché' },
      { canal: 'Radio', action: 'Campagne « Consommons local »' },
      { canal: 'Événementiel', action: 'Participation aux foires commerciales' },
    ],
    positionnement: 'Le meilleur de la production locale, de qualité constante.',
  },
  logistique: {
    label: 'Logistique / Transport / Livraison',
    swot: { forces: 'Flotte de véhicules et chauffeurs expérimentés\nConnaissance des routes et des zones', faiblesses: 'Suivi des colis peu visible pour les clients\nDépendance au prix du carburant', opportunites: 'Essor du commerce en ligne et des livraisons à domicile\nEnvois de la diaspora (colis, transferts)\nEntreprises qui externalisent leur transport', menaces: 'Insécurité sur certaines routes\nConcurrence des livreurs indépendants à moto\nHausse du carburant et des pièces' },
    objectifs: [
      { objectif: 'Signer de nouveaux clients entreprises', indicateur: 'Contrats signés', cible: '+10', echeance: '6 mois' },
      { objectif: 'Augmenter le volume de livraisons', indicateur: 'Livraisons / mois', cible: '+30 %', echeance: '6 mois' },
      { objectif: 'Réduire les délais et les réclamations', indicateur: 'Livraisons à l\'heure', cible: '95 %', echeance: '3 mois' },
    ],
    cibles: [
      { nom: 'Commerces et boutiques en ligne', description: 'Vendeurs sur Instagram / WhatsApp, boutiques, supermarchés', besoins: 'Livraison rapide et fiable, paiement à la livraison, suivi', canaux: 'Instagram, WhatsApp, démarchage' },
      { nom: 'Entreprises et importateurs', description: 'PME, distributeurs, industriels', besoins: 'Transport régulier, entreposage, dédouanement, respect des délais', canaux: 'LinkedIn, email, rendez-vous, salons' },
      { nom: 'Diaspora et particuliers', description: 'Familles qui envoient ou reçoivent des colis', besoins: 'Sécurité, prix clair, suivi du colis', canaux: 'Facebook, WhatsApp, radio' },
    ],
    actions: [
      { canal: 'WhatsApp Business', action: 'Prise de commande et suivi des colis en temps réel' },
      { canal: 'LinkedIn', action: 'Prospection des entreprises et présentation des offres B2B' },
      { canal: 'Affichage / panneaux', action: 'Habillage des véhicules aux couleurs de l\'entreprise' },
      { canal: 'Partenariats', action: 'Accords avec les boutiques en ligne et les plateformes de vente' },
      { canal: 'Facebook / Instagram', action: 'Témoignages clients et promotion des tarifs de livraison' },
    ],
    positionnement: 'Le partenaire logistique fiable qui livre à temps, en toute sécurité, avec un suivi clair.',
  },
  ong: {
    label: 'ONG / Association / Église',
    swot: { forces: 'Mission claire\nBénévoles engagés', faiblesses: 'Budget limité\nCommunication irrégulière', opportunites: 'Dons en ligne\nPartenaires internationaux', menaces: 'Lassitude des donateurs\nConcurrence pour les financements' },
    objectifs: [
      { objectif: 'Augmenter les dons', indicateur: 'Montant collecté', cible: '+25 %', echeance: '12 mois' },
      { objectif: 'Mobiliser des bénévoles', indicateur: 'Bénévoles actifs', cible: '50', echeance: '6 mois' },
    ],
    cibles: [
      { nom: 'Donateurs', description: 'Particuliers et diaspora', besoins: 'Voir l\'impact concret de leur don', canaux: 'Facebook, email, WhatsApp' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Histoires de bénéficiaires et rapports d\'impact' },
      { canal: 'Email marketing', action: 'Lettre trimestrielle aux donateurs' },
      { canal: 'Événementiel', action: 'Gala / collecte annuelle' },
    ],
    positionnement: 'Chaque contribution change concrètement la vie de la communauté.',
  },
  autre: {
    label: 'Autre secteur',
    swot: { forces: '', faiblesses: '', opportunites: '', menaces: '' },
    objectifs: [],
    cibles: [
      { nom: 'Client principal', description: 'Âge, lieu, revenus, profession…', besoins: 'Ce qu\'il recherche, ses problèmes', canaux: 'Où le toucher' },
    ],
    actions: [
      { canal: 'Facebook / Instagram', action: 'Présence régulière et publicités ciblées' },
      { canal: 'WhatsApp Business', action: 'Service client et catalogue' },
    ],
    positionnement: '',
  },
};

export function suggestions(secteurKey) {
  const s = SECTEURS[secteurKey] || SECTEURS.autre;
  return { ...s, objectifs: [...s.objectifs, ...COMMUN.objectifs], kpis: COMMUN.kpis, suivi: COMMUN.suivi, risques: COMMUN.risques };
}
