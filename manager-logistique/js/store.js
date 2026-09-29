/* =========================================================
   STOCKAGE — Manager Logistique
   Toutes les données vivent dans un seul objet `db`, persisté
   dans localStorage. Ce module est la seule porte d'accès aux
   données : pour passer plus tard à une base partagée (Supabase,
   comme l'app POS Lakouwon), il suffit de réécrire ce fichier.
========================================================= */
import { seedData, migrate } from "./seed.js";

const KEY = "manager-logistique-db";
const ANCIENNE_CLE = "welj-express-db-v1"; // données enregistrées par les versions précédentes
let db = null;
const listeners = new Set();

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const nowIso = () => new Date().toISOString();

export function load() {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(ANCIENNE_CLE);
    db = raw ? JSON.parse(raw) : null;
  } catch { db = null; }
  if (!db || !db.version) { db = seedData(); save(); }
  else if (db.version < 10) { migrate(db); save(); }
  return db;
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.error("Sauvegarde impossible", e); alert("Sauvegarde locale impossible (stockage plein ?)."); }
  listeners.forEach(fn => fn(db));
}

export const getDb = () => db;
export const onChange = fn => listeners.add(fn);

/** Applique une mutation puis sauvegarde. */
export function mutate(fn) { const r = fn(db); save(); return r; }

export function resetDemo() { db = seedData(); save(); }
export function wipeAll() { db = seedData({ empty: true }); save(); }

export function exportJson() { return JSON.stringify(db, null, 2); }
export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || !data.version || !Array.isArray(data.colis)) throw new Error("Fichier de sauvegarde invalide");
  db = migrate(data); save();
}

/* ---------- Séquences de numérotation ---------- */
export function nextSeq(name) {
  db.seq[name] = (db.seq[name] || 0) + 1;
  return db.seq[name];
}
