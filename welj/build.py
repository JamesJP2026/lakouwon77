#!/usr/bin/env python3
"""Génère une version « fichier unique » de Manager Logistique.

Les navigateurs refusent de charger des modules JavaScript séparés depuis
un fichier ouvert en double-clic (file://). Ce script regroupe le CSS et
tous les modules de js/ dans un seul fichier HTML autonome :

    python3 build.py            →  dist/Manager-Logistique-WELJ.html

Aucune dépendance : Python 3 standard suffit.
"""
import re
from pathlib import Path

ROOT = Path(__file__).parent
ORDER = ["logic", "seed", "store", "ui", "app"]  # dépendances d'abord

IMPORT_NAMED = re.compile(r'import\s*\{([^}]*)\}\s*from\s*"\./(\w+)\.js";', re.S)
IMPORT_STAR = re.compile(r'import\s*\*\s*as\s+(\w+)\s+from\s*"\./(\w+)\.js";')
EXPORT_DECL = re.compile(r'^export\s+(function|const|let|class)\s+([\w$]+)', re.M)


def bundle_module(name: str) -> str:
    src = (ROOT / "js" / f"{name}.js").read_text(encoding="utf-8")
    exports = [m.group(2) for m in EXPORT_DECL.finditer(src)]
    src = EXPORT_DECL.sub(lambda m: f"{m.group(1)} {m.group(2)}", src)
    src = IMPORT_STAR.sub(lambda m: f'const {m.group(1)} = __modules["{m.group(2)}"];', src)
    src = IMPORT_NAMED.sub(lambda m: f'const {{{" ".join(m.group(1).split())}}} = __modules["{m.group(2)}"];', src)
    if re.search(r'^\s*(import|export)\b', src, re.M):
        raise SystemExit(f"{name}.js : import/export non géré par build.py")
    body = "\n".join("  " + line if line else line for line in src.splitlines())
    return f'__modules["{name}"] = (() => {{\n{body}\n  return {{ {", ".join(exports)} }};\n}})();\n'


def main() -> None:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "css" / "app.css").read_text(encoding="utf-8")
    js = "const __modules = {};\n" + "\n".join(bundle_module(n) for n in ORDER)
    if "</script" in js.lower():
        raise SystemExit("Le JavaScript contient « </script> » : impossible de l'insérer tel quel")
    html = html.replace('<link rel="stylesheet" href="css/app.css">', f"<style>\n{css}\n</style>")
    html = html.replace('<script type="module" src="js/app.js"></script>', f'<script>\n"use strict";\n{js}</script>')
    if 'src="js/app.js"' in html or 'href="css/app.css"' in html:
        raise SystemExit("index.html a changé : mettre à jour build.py")
    out = ROOT / "dist" / "Manager-Logistique-WELJ.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"{out.relative_to(ROOT)} ({out.stat().st_size // 1024} Ko)")


if __name__ == "__main__":
    main()
