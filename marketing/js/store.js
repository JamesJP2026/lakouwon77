// Persistance locale (localStorage) + petits utilitaires partagés.
const KEY = 'lakouwon-marketing-v1';

export const defaultData = () => ({
  settings: {
    nom: 'Mon Agence Marketing', adresse: '', telephone: '', email: '', nif: '',
    logo: '', devise: 'HTG', tvaPct: 10, prefixeFacture: 'FAC', prochainNumero: 1,
    delaiPaiement: 15,
    conditions: 'Paiement à réception de facture. Merci de mentionner le numéro de facture lors du règlement.',
    mentions: '',
  },
  clients: [],
  plans: [],
  factures: [],
});

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = defaultData();
      return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
    }
  } catch (e) { /* stockage indisponible : on repart d'un jeu vide */ }
  return defaultData();
}

export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Texte multi-ligne → HTML sûr avec retours à la ligne.
export const nl2br = s => esc(s).replace(/\n/g, '<br>');

export const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
export const fmt = n => (Number(n) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso, d) => { const t = new Date(iso + 'T00:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10); };
export const addMonths = (iso, m) => { const t = new Date(iso + 'T00:00:00'); t.setMonth(t.getMonth() + m); t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10); };
export const dateFr = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
export const dateCourte = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR') : '—';

// Totaux d'une facture (source de vérité unique pour l'écran et l'impression).
export function totauxFacture(f) {
  const sousTotal = (f.lignes || []).reduce((s, l) => s + num(l.qte) * num(l.pu), 0);
  const remise = sousTotal * num(f.remisePct) / 100;
  const base = sousTotal - remise;
  const tva = base * num(f.tvaPct) / 100;
  const total = base + tva;
  const paye = num(f.montantPaye);
  return { sousTotal, remise, base, tva, total, paye, reste: Math.max(0, total - paye) };
}

export const budgetActions = p => (p.actions || []).reduce((s, a) => s + num(a.budget), 0);
export const totalHonoraires = p => (p.honoraires || []).reduce((s, l) => s + num(l.qte) * num(l.pu), 0);
