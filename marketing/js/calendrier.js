// Calendrier de publication : les actions du plan découpées en publications
// datées (réseau, texte, visuel, hashtags) avec un circuit de validation.
export const STATUTS_PUB = {
  idee: 'Idée', brouillon: 'Brouillon', a_valider: 'À valider', valide: 'Validé', publie: 'Publié',
};

export const FORMATS = [
  'Publication photo', 'Carrousel', 'Vidéo courte (Reel / TikTok)', 'Story', 'Vidéo longue', 'Direct (live)',
  'Statut WhatsApp', 'Diffusion WhatsApp', 'Email', 'SMS', 'Article / blog', 'Spot radio', 'Affichage / imprimé', 'Autre',
];

// Heure de publication conseillée par réseau (à ajuster selon les statistiques du compte).
export function heureConseillee(canal = '') {
  const c = canal.toLowerCase();
  if (c.includes('tiktok')) return '19:00';
  if (c.includes('linkedin')) return '08:30';
  if (c.includes('whatsapp') || c.includes('sms')) return '11:30';
  if (c.includes('email')) return '09:00';
  if (c.includes('radio')) return '07:00';
  return '18:00';
}

export const nouvellePublication = (champs = {}) => ({
  id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  date: '', heure: '', canal: '', format: '', titre: '', texte: '', visuel: '', hashtags: '', lien: '',
  responsable: '', consignes: '', visuelPret: false, statut: 'idee', commentaire: '', publieLe: '', ...champs,
});

// Complète les publications créées avant l'ajout des champs d'exécution.
export const normaliserPublication = x => ({ ...nouvellePublication(), ...x });

export const ajouterJours = (isoDate, n) => { const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };

// Programme d'exécution : publications, préparation des visuels (N jours avant)
// et début / fin des actions, triés par date et heure, entre deux dates incluses.
export function programme(plans, debut, fin, delaiPreparation = 2) {
  const items = [];
  for (const p of plans) {
    for (const x of p.publications || []) {
      if (!x.date || x.statut === 'idee') continue;
      if (x.date >= debut && x.date <= fin) items.push({ type: 'publication', date: x.date, heure: x.heure || heureConseillee(x.canal), plan: p, pub: x });
      const prep = ajouterJours(x.date, -delaiPreparation);
      if (delaiPreparation > 0 && x.visuel && !x.visuelPret && x.statut !== 'publie' && prep >= debut && prep <= fin)
        items.push({ type: 'preparation', date: prep, heure: '09:00', plan: p, pub: x });
    }
    for (const a of p.actions || []) {
      if (a.statut === 'termine') continue;
      const d = a.debut || p.debut, f = a.fin || p.fin;
      if (d >= debut && d <= fin) items.push({ type: 'action-debut', date: d, heure: '08:00', plan: p, action: a });
      if (f >= debut && f <= fin && f !== d) items.push({ type: 'action-fin', date: f, heure: '17:00', plan: p, action: a });
    }
  }
  return items.sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
}

// Lundi de la semaine contenant la date.
export function lundi(isoDate) {
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
}

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
