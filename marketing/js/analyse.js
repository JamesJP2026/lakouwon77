// Analyse d'un plan : score de qualité, conseils pour l'améliorer, et
// calcul des résultats réels (dépenses, prospects, ventes, ROI).
import { num, todayISO } from './store.js';
import { completude, ageRechercheWeb } from './fiche.js';
import { normaliserPublication } from './calendrier.js';

const rempli = s => String(s ?? '').trim().length > 0;
const chiffre = s => /\d/.test(String(s ?? ''));

export const STATUTS_ACTION = { a_faire: 'À faire', en_cours: 'En cours', termine: 'Terminé' };

// Complète les anciens plans avec les champs ajoutés depuis.
export function normaliserPlan(p) {
  p.actions = (p.actions || []).map(a => ({ statut: 'a_faire', depense: 0, portee: 0, prospects: 0, ventes: 0, ...a }));
  p.objectifs = (p.objectifs || []).map(o => ({ actuel: '', progression: 0, ...o }));
  if (p.bilan === undefined) p.bilan = '';
  if (p.motif === undefined) p.motif = '';
  if (p.motifDetail === undefined) p.motifDetail = '';
  p.publications = (Array.isArray(p.publications) ? p.publications : []).map(x => ('consignes' in x ? x : normaliserPublication(x)));
  if (!Array.isArray(p.releves)) p.releves = [];
  if (p.afficherResultats === undefined) p.afficherResultats = false;
  return p;
}

export const actionEnRetard = (a, p) => a.statut !== 'termine' && (a.fin || p.fin) && (a.fin || p.fin) < todayISO();

// Score de 0 à 100 + liste de conseils. Chaque conseil pointe vers l'étape à corriger.
export function scorePlan(p, client) {
  const checks = [];
  const add = (ok, texte, step, poids = 1) => checks.push({ ok, texte, step, poids });
  const budget = p.actions.reduce((s, a) => s + num(a.budget), 0);

  if (client?.fiche) add(completude(client) >= 50, 'Complétez la fiche entreprise (activité, clientèle, présence en ligne) pour mieux adapter le plan.', 'fiche', 2);
  if (client?.fiche) add(ageRechercheWeb(client) <= 180 || rempli(client.fiche.recherche), 'Recherchez l\'entreprise sur internet (bouton « Rechercher avec l\'IA » ou 🔎 de la fiche) pour tenir compte de ce qui existe déjà en ligne.', 'fiche');
  add(rempli(p.motif) && (p.motif !== 'autre' || rempli(p.motifDetail)), 'Indiquez le motif du plan : pourquoi l\'entreprise a besoin de ce plan.', 'infos', 2);
  add(rempli(p.resume), 'Rédigez un résumé : c\'est la première chose que lira le client.', 'infos');
  add(rempli(p.contexte), 'Décrivez la situation actuelle de l\'entreprise.', 'analyse');
  add(['forces', 'faiblesses', 'opportunites', 'menaces'].every(k => rempli(p.swot[k])), 'Complétez les 4 cases de l\'analyse SWOT.', 'analyse');
  add(p.objectifs.length > 0, 'Ajoutez au moins un objectif.', 'objectifs', 2);
  const nonMesurables = p.objectifs.filter(o => !rempli(o.indicateur) || !chiffre(o.cible)).length;
  if (p.objectifs.length) add(!nonMesurables, `${nonMesurables} objectif(s) sans indicateur ou sans cible chiffrée : un objectif doit être mesurable.`, 'objectifs', 2);
  add(p.cibles.length > 0 && p.cibles.every(c => rempli(c.besoins)), 'Décrivez les besoins de chaque cible pour adapter les messages.', 'cibles');
  add(rempli(p.messageCle) || rempli(p.positionnement), 'Définissez un message clé ou un positionnement clair.', 'strategie');
  add(p.actions.length >= 2, 'Prévoyez au moins 2 actions : un seul canal est risqué.', 'actions', 2);
  const sansBudget = p.actions.filter(a => !num(a.budget)).length;
  if (p.actions.length) add(!sansBudget, `${sansBudget} action(s) sans budget.`, 'actions');
  const sansResp = p.actions.filter(a => !rempli(a.responsable)).length;
  if (p.actions.length) add(!sansResp, `${sansResp} action(s) sans responsable : désignez qui s'en occupe.`, 'actions');
  if (budget > 0) {
    const parCanal = {};
    p.actions.forEach(a => { parCanal[a.canal || 'Autre'] = (parCanal[a.canal || 'Autre'] || 0) + num(a.budget); });
    const [canal, max] = Object.entries(parCanal).sort((a, b) => b[1] - a[1])[0];
    add(max / budget <= 0.7, `${Math.round(max / budget * 100)} % du budget est sur « ${canal} » : diversifiez pour limiter le risque.`, 'actions');
  }
  if (num(p.budgetPrevu) > 0) {
    add(budget <= num(p.budgetPrevu), 'Le budget des actions dépasse le budget envisagé par le client.', 'actions', 2);
    add(budget >= num(p.budgetPrevu) * 0.7, 'Une grande partie du budget envisagé n\'est affectée à aucune action.', 'actions');
  }
  add(rempli(p.kpis), 'Listez les indicateurs (KPIs) qui prouveront les résultats.', 'suivi');
  add(rempli(p.suivi), 'Précisez comment et quand les résultats seront présentés au client.', 'suivi');
  add(p.honoraires.some(l => num(l.qte) * num(l.pu) > 0), 'Indiquez vos honoraires pour pouvoir facturer.', 'honoraires');

  const total = checks.reduce((s, c) => s + c.poids, 0);
  const ok = checks.filter(c => c.ok).reduce((s, c) => s + c.poids, 0);
  return { score: Math.round(ok / total * 100), conseils: checks.filter(c => !c.ok) };
}

// Résultats réels saisis au fil de la campagne.
export function resultats(p) {
  const r = { budget: 0, depense: 0, portee: 0, prospects: 0, ventes: 0, terminees: 0, enRetard: 0, nb: p.actions.length };
  p.actions.forEach(a => {
    r.budget += num(a.budget); r.depense += num(a.depense); r.portee += num(a.portee);
    r.prospects += num(a.prospects); r.ventes += num(a.ventes);
    if (a.statut === 'termine') r.terminees++;
    if (actionEnRetard(a, p)) r.enRetard++;
  });
  r.coutProspect = r.prospects ? r.depense / r.prospects : 0;
  r.roi = r.depense ? (r.ventes - r.depense) / r.depense * 100 : 0;
  r.progression = p.objectifs.length ? p.objectifs.reduce((s, o) => s + Math.min(100, num(o.progression)), 0) / p.objectifs.length : 0;
  r.aDesDonnees = r.depense > 0 || r.prospects > 0 || r.ventes > 0 || r.portee > 0;
  return r;
}

// Recommandations d'optimisation tirées des résultats réels.
export function recommandations(p, money) {
  const out = [];
  const r = resultats(p);
  const mesurees = p.actions.filter(a => num(a.depense) > 0 && num(a.prospects) > 0)
    .map(a => ({ a, cpp: num(a.depense) / num(a.prospects) }))
    .sort((x, y) => x.cpp - y.cpp);
  if (mesurees.length >= 2) {
    const best = mesurees[0], worst = mesurees[mesurees.length - 1];
    if (worst.cpp > best.cpp * 1.5) out.push({ type: 'ok', texte: `« ${best.a.canal} » est le canal le plus rentable (${money(best.cpp)} par prospect, contre ${money(worst.cpp)} pour « ${worst.a.canal} »). Envisagez d'y réaffecter du budget.` });
  }
  p.actions.filter(a => num(a.depense) > 0 && !num(a.prospects) && !num(a.ventes))
    .forEach(a => out.push({ type: 'warn', texte: `« ${a.canal} » a dépensé ${money(a.depense)} sans prospect ni vente enregistrés : vérifiez le suivi ou changez d'approche.` }));
  p.actions.filter(a => num(a.budget) > 0 && num(a.depense) > num(a.budget))
    .forEach(a => out.push({ type: 'err', texte: `« ${a.canal} » dépasse son budget de ${money(num(a.depense) - num(a.budget))}.` }));
  p.actions.filter(a => actionEnRetard(a, p))
    .forEach(a => out.push({ type: 'err', texte: `« ${a.canal} — ${a.action} » devait être terminée : mettez à jour son statut ou prolongez-la.` }));
  if (r.depense > 0 && r.ventes > 0 && r.roi < 0) out.push({ type: 'warn', texte: `Le retour sur investissement est négatif (${Math.round(r.roi)} %) : concentrez le budget sur les actions qui vendent.` });
  if (r.depense > 0 && r.ventes > 0 && r.roi >= 100) out.push({ type: 'ok', texte: `Excellent retour sur investissement (${Math.round(r.roi)} %) : c'est le moment de proposer au client d'augmenter le budget.` });
  if (!r.aDesDonnees) out.push({ type: 'info', texte: 'Saisissez les dépenses, prospects et ventes de chaque action au fil de la campagne pour obtenir des recommandations.' });
  return out;
}
