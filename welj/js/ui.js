/* =========================================================
   UTILITAIRES D'INTERFACE — échappement, modales, toasts,
   impression, export CSV.
========================================================= */

export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- Modale ---------- */
export function openModal(html, { wide = false, onMount } = {}) {
  closeModal();
  const bg = document.createElement("div");
  bg.className = "modal-bg"; bg.id = "modal-bg";
  bg.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener("mousedown", e => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  const first = bg.querySelector("input:not([type=hidden]),select,textarea");
  if (first) first.focus();
  onMount?.(bg.firstElementChild);
  return bg.firstElementChild;
}
export function closeModal() { document.getElementById("modal-bg")?.remove(); }
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

export function confirmBox(message) { return window.confirm(message); }

/* ---------- Toast ---------- */
export function toast(msg, tone = "good") {
  document.querySelectorAll(".toast").forEach(t => t.remove());
  const el = document.createElement("div");
  el.className = `toast ${tone}`; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 2600);
  setTimeout(() => el.remove(), 3000);
}

/* ---------- Formulaires ---------- */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "number") out[el.name] = el.value === "" ? "" : +el.value;
    else out[el.name] = el.value.trim();
  }
  return out;
}
export const opt = (value, label, selected) => `<option value="${esc(value)}" ${selected ? "selected" : ""}>${esc(label)}</option>`;

/* ---------- Impression ----------
   Le document à imprimer est injecté dans #print-area ; la
   feuille @media print masque tout le reste de l'application. */
export function printHtml(html, { format = "a4" } = {}) {
  const area = document.getElementById("print-area");
  area.className = `print-${format}`;
  area.innerHTML = html;
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
}

/* ---------- Export CSV ---------- */
export function downloadCsv(filename, rows) {
  const cell = v => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + rows.map(r => r.map(cell).join(";")).join("\n");
  download(filename, csv, "text/csv;charset=utf-8");
}
export function download(filename, content, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
