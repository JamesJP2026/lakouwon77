// Calendrier de publication : les actions du plan découpées en publications
// datées (réseau, texte, visuel, hashtags) avec un circuit de validation.
export const STATUTS_PUB = {
  idee: 'Idée', brouillon: 'Brouillon', a_valider: 'À valider', valide: 'Validé', publie: 'Publié',
};

export const nouvellePublication = (champs = {}) => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  date: '', canal: '', titre: '', texte: '', visuel: '', hashtags: '', statut: 'idee', commentaire: '', ...champs,
});

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Semaines (lundi → dimanche) couvrant le mois « AAAA-MM ».
export function grilleMois(mois) {
  const [a, m] = mois.split('-').map(Number);
  const premier = new Date(a, m - 1, 1);
  const debut = new Date(premier);
  debut.setDate(1 - ((premier.getDay() + 6) % 7));
  const semaines = [];
  const d = new Date(debut);
  do {
    const semaine = [];
    for (let i = 0; i < 7; i++) { semaine.push({ date: iso(d), dansMois: d.getMonth() === m - 1, jour: d.getDate() }); d.setDate(d.getDate() + 1); }
    semaines.push(semaine);
  } while (d.getMonth() === m - 1);
  return semaines;
}

export const moisDecale = (mois, delta) => {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const libelleMois = mois => new Date(mois + '-01T00:00:00').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

// Abréviation courte du canal pour les vignettes du calendrier.
export function abregeCanal(canal = '') {
  const c = canal.toLowerCase();
  if (c.includes('facebook') || c.includes('instagram')) return 'FB/IG';
  if (c.includes('tiktok')) return 'TT';
  if (c.includes('whatsapp')) return 'WA';
  if (c.includes('youtube')) return 'YT';
  if (c.includes('linkedin')) return 'IN';
  if (c.includes('email')) return '@';
  if (c.includes('radio')) return 'Radio';
  return canal.slice(0, 5);
}
