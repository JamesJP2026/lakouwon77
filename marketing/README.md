# Plans Marketing & Facturation

Application web (100 % en français) pour créer des **plans marketing et
publicitaires** pour tout type d'entreprise, les **présenter** au client,
puis **générer la facture** correspondante.

Même principe que l'app POS : JavaScript vanilla, aucune étape de build,
aucun framework. Les données sont enregistrées dans le navigateur
(`localStorage`) et peuvent être exportées / importées en JSON.

## Lancer

```bash
cd marketing
python3 -m http.server 8080   # ou : npx serve .
```
Ouvrez http://localhost:8080 — le bouton « Charger un exemple » du tableau
de bord crée un client et un plan complet pour découvrir l'application.

## Parcours

1. **Paramètres** : nom de l'agence, logo, coordonnées, NIF, devise (HTG par
   défaut), taxe (TCA 10 % par défaut), préfixe et numérotation des factures,
   conditions de paiement, mentions (coordonnées bancaires, MonCash…).
2. **Entreprises clientes** : n'importe quel secteur (restauration, commerce,
   services, beauté, santé, immobilier, éducation, tech, tourisme, industrie,
   ONG, autre).
3. **Plan marketing** en 8 étapes, contenu saisi par l'utilisateur,
   enregistré automatiquement :
   informations & résumé · analyse & SWOT · objectifs SMART · cibles (personas)
   · stratégie (positionnement, message, slogan, marketing mix 4P)
   · actions & budget par canal · suivi (KPIs, reporting, risques)
   · honoraires. Des **suggestions adaptées au secteur** peuvent pré-remplir
   les champs vides ou être ajoutées en un clic : tout reste modifiable.
4. **Présentation** : document mis en page (couverture, SWOT, tableau des
   actions, répartition du budget, calendrier par mois, proposition
   d'honoraires) — imprimable ou enregistrable en PDF.
5. **Facture** après présentation : reprend les honoraires et/ou le budget
   publicitaire (détaillé ou global), complète ou en acompte (%).
   Brouillon modifiable (lignes, remise, taxe, dates) → émise → paiements
   (espèces, virement, MonCash, NatCash…) → payée. Impression / PDF.

## Obtenir plus de résultats

- **Score de qualité du plan** (0-100 %), affiché dans l'éditeur et la liste
  des plans, avec des conseils cliquables : objectifs non mesurables, budget
  trop concentré sur un canal, actions sans responsable, budget dépassé…
- **Étape 9 « Résultats & pilotage »** : pour chaque action, statut,
  montant dépensé, personnes touchées, prospects et ventes générées ;
  avancement de chaque objectif. Calcul automatique du budget consommé, du
  coût par prospect et du retour sur investissement (ROI).
- **Recommandations** tirées des résultats : canal le plus rentable où
  réaffecter le budget, actions qui dépensent sans résultat, dépassements,
  retards, ROI à exploiter pour proposer une hausse de budget.
- **Rapport client** : les résultats peuvent être ajoutés à la présentation
  (section « Résultats obtenus »), imprimable en PDF.

## Options de gestion

- **Suivi des actions** : toutes les actions de tous les plans, avec
  compteurs (à faire, en cours, terminées, en retard), recherche, filtres
  et changement de statut direct. Le tableau de bord signale les actions en
  retard ou à lancer dans la semaine.
- **Recherche et filtres** sur les plans et les factures (dont « en retard
  de paiement »), avec totaux.
- **Répartition automatique** du budget envisagé entre les actions.
- **Catalogue de prestations** (Paramètres) : vos services et tarifs,
  ajoutés en un clic dans les honoraires.
- **Relance de facture** : message prêt à envoyer par WhatsApp ou email.
- **Duplication de facture** (ex. facturation mensuelle).

## Fichiers

```
index.html        page unique
styles.css        styles écran + impression
js/app.js         vues, éditeur, présentation, factures, routeur
js/store.js       stockage local, formatage, calcul des totaux
js/analyse.js     score du plan, résultats, recommandations
js/secteurs.js    suggestions par secteur d'activité et liste des canaux
```

## Limites

- Données propres à chaque navigateur : exportez une sauvegarde régulièrement.
  Pour un usage multi-utilisateurs, les données pourraient être migrées vers
  Supabase comme l'app POS.
