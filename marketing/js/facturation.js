// Facturation récurrente (abonnements mensuels, trimestriels, annuels) et
// calendrier des relances de paiement.
import { uid, addDays } from './store.js';

export const FREQUENCES = { mensuelle: 'Chaque mois', trimestrielle: 'Chaque trimestre', annuelle: 'Chaque année' };
const MOIS = { mensuelle: 1, trimestrielle: 3, annuelle: 12 };

const isoLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jour = iso => new Date(iso + 'T00:00:00');
export const aujourdhui = () => isoLocal(new Date());
// Nombre de jours de a à b (positif si b est après a).
export const joursEntre = (a, b) => Math.round((jour(b) - jour(a)) / 86400000);

// Même jour du mois suivant (ou dernier jour du mois s'il est plus court).
export function dateSuivante(iso, frequence) {
  const d = jour(iso);
  const j = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + (MOIS[frequence] || 1));
  const dernier = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(j, dernier));
  return isoLocal(d);
}

const periode = (iso, frequence) => {
  const d = jour(iso);
  if (frequence === 'annuelle') return String(d.getFullYear());
  if (frequence === 'trimestrielle') return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
};

// Crée les brouillons des échéances arrivées. Retourne les factures créées.
export function genererRecurrentes(factures, nouveauNumero) {
  const crees = [];
  const today = aujourdhui();
  for (const f of [...factures]) {
    const r = f.recurrence;
    if (!r?.actif || !r.prochaine) continue;
    const delai = Math.max(0, joursEntre(f.date, f.echeance || f.date));
    let garde = 0;
    while (r.prochaine <= today && (!r.fin || r.prochaine <= r.fin) && garde++ < 36) {
      const date = r.prochaine;
      const copie = {
        ...structuredClone(f), id: uid(), numero: nouveauNumero(date), date, echeance: addDays(date, delai),
        objet: `${r.objet || f.objet} — ${periode(date, r.frequence)}`,
        statut: 'brouillon', montantPaye: 0, paiements: [], relances: [], recurrence: null, recurrenteDe: f.id, signature: undefined,
      };
      factures.push(copie);
      crees.push(copie);
      r.prochaine = dateSuivante(date, r.frequence);
    }
    if (r.fin && r.prochaine > r.fin) r.actif = false;
  }
  return crees;
}

// Relances à faire aujourd'hui : rappel 3 jours avant l'échéance, le jour même,
// puis une relance par semaine tant que la facture reste impayée.
export function relancesAFaire(factures) {
  const today = aujourdhui();
  return factures.filter(f => ['envoyee', 'partielle'].includes(f.statut) && f.echeance).map(f => {
    const j = joursEntre(today, f.echeance);
    const etape = j > 3 ? null : j > 0 ? 'avant' : j === 0 ? 'jour' : 'retard';
    if (!etape) return null;
    const derniere = (f.relances || []).at(-1)?.date;
    const delaiMin = etape === 'retard' ? 7 : 3;
    if (derniere && joursEntre(derniere, today) < delaiMin && !(etape === 'jour' && derniere < today)) return null;
    return { f, etape, jours: j, derniere };
  }).filter(Boolean).sort((a, b) => a.f.echeance.localeCompare(b.f.echeance));
}
