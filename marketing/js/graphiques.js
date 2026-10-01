// Histogrammes SVG (sans bibliothèque) pour les rapports mensuels.
// Règles : un seul axe, barres ≤ 24 px arrondies côté valeur et carrées sur la
// ligne de base, 2 px d'écart entre barres voisines, grille discrète,
// légende dès 2 séries, valeur détaillée au survol (attribut data-tip).

// Palette catégorielle validée (ordre fixe, jamais recyclé).
export const COULEURS = ['#2a78d6', '#eb6834', '#1baf7a'];

const echapper = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Graduation « ronde » de l'axe (1, 2 ou 5 × 10^n).
function pasRond(max, n = 4) {
  const brut = max / n || 1;
  const p = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 5, 10].map(k => k * p).find(x => x >= brut);
}

// Barre arrondie (4 px) côté valeur, carrée sur la ligne de base.
function barre(x, y, l, h) {
  if (h <= 0) return '';
  const r = Math.min(4, l / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + l - r}Q${x + l},${y} ${x + l},${y + r}V${y + h}Z`;
}

// etiquettes : libellés de l'axe X ; series : [{ nom, valeurs:[…] }] ; format : n → texte.
export function histogramme({ titre, etiquettes, series, format = String, hauteur = 220 }) {
  if (!etiquettes.length) return '';
  const L = Math.max(320, etiquettes.length * (series.length * 26 + 30) + 70);
  const marge = { h: 12, d: 8, b: 26, g: 62 };
  const lp = L - marge.g - marge.d, hp = hauteur - marge.h - marge.b;
  const max = Math.max(1, ...series.flatMap(s => s.valeurs));
  const pas = pasRond(max);
  const haut = pas * Math.ceil(max / pas);
  const y = v => marge.h + hp - (v / haut) * hp;
  const bande = lp / etiquettes.length;
  const lb = Math.min(24, (bande * 0.7 - (series.length - 1) * 2) / series.length);
  const groupe = series.length * lb + (series.length - 1) * 2;

  let svg = '';
  for (let v = 0; v <= haut + 1e-9; v += pas) {
    svg += `<line x1="${marge.g}" x2="${L - marge.d}" y1="${y(v)}" y2="${y(v)}" class="g-grille"/>`
      + `<text x="${marge.g - 6}" y="${y(v) + 4}" class="g-axe" text-anchor="end">${echapper(format(v))}</text>`;
  }
  etiquettes.forEach((et, i) => {
    const x0 = marge.g + i * bande + (bande - groupe) / 2;
    series.forEach((s, k) => {
      const v = s.valeurs[i] || 0;
      const x = x0 + k * (lb + 2);
      const tip = `${et} · ${s.nom} : ${format(v)}`;
      svg += `<path d="${barre(x, y(v), lb, y(0) - y(v))}" fill="${COULEURS[k]}"/>`
        + `<rect x="${x - 3}" y="${marge.h}" width="${lb + 6}" height="${hp}" fill="transparent" data-tip="${echapper(tip)}"/>`;
    });
    svg += `<text x="${marge.g + i * bande + bande / 2}" y="${hauteur - 8}" class="g-axe" text-anchor="middle">${echapper(et)}</text>`;
  });
  svg += `<line x1="${marge.g}" x2="${L - marge.d}" y1="${y(0)}" y2="${y(0)}" class="g-base"/>`;

  const legende = series.length > 1
    ? `<div class="g-legende">${series.map((s, k) => `<span><i style="background:${COULEURS[k]}"></i>${echapper(s.nom)}</span>`).join('')}</div>` : '';
  return `<figure class="graph"><figcaption>${echapper(titre)}</figcaption>${legende}
    <svg viewBox="0 0 ${L} ${hauteur}" role="img" aria-label="${echapper(titre)}" preserveAspectRatio="xMinYMin meet">${svg}</svg></figure>`;
}
