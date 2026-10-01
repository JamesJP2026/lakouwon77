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
   logistique,
   ONG, autre).
3. **Plan marketing** en 8 étapes, contenu saisi par l'utilisateur,
   enregistré automatiquement :
   informations (motif du plan, résumé) · analyse & SWOT · objectifs SMART · cibles (personas)
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

## Fiche entreprise : adapter le plan au client

Chaque entreprise cliente a une **fiche** (bouton « Fiche » dans la liste),
ouverte automatiquement après sa création :

1. **Vérifier sur internet** : boutons de recherche de l'entreprise sur
   Google, Google Maps (avis), Facebook, Instagram, TikTok et actualités,
   et une case pour noter ce qui a été trouvé.
2. **Activité** : description, produits, prix, ancienneté, employés, zone,
   chiffre d'affaires, saisonnalité.
3. **Clientèle** : profil, comment les clients découvrent l'entreprise,
   clients par mois, part de clients fidèles.
4. **Concurrence et difficultés** : concurrents, atout distinctif, problèmes.
5. **Présence en ligne et données accumulées** : lien et chiffres par
   plateforme (abonnés, publications, interactions, note et avis Google,
   visites du site, contacts WhatsApp), contacts clients et emails
   collectés, avis marquants, campagnes qui ont marché.
6. **Moyens** : budget mensuel, qui gère la communication, supports
   existants (logo, photos, vidéos…).

Un **diagnostic automatique** en tire forces, faiblesses et opportunités
(taux d'engagement, régularité des publications, réputation Google, base de
contacts inexploitée, absence de fiche Google ou de site…), avec l'action
et l'objectif à proposer. À la création d'un plan, la fiche est reprise
automatiquement ; dans un plan existant, le bouton « Importer la fiche »
ajoute les nouvelles informations sans rien effacer ni dupliquer. La
présentation affiche la présence en ligne actuelle du client.

### Importer / exporter une fiche entreprise

« ⇩ Exporter la fiche » (page de la fiche) produit un fichier JSON ;
« ⇧ Importer une fiche » (liste des entreprises) l'ajoute à l'application
sans toucher aux autres données. Si l'entreprise existe déjà, la fiche
existante est complétée (champs vides seulement). Exemple :
`exemples/fiche-welj-express-services.json` (informations publiques
vérifiées le 01/10/2026, points non confirmés signalés).

### Recherche automatique par IA (facultatif)

Le bouton **« Rechercher avec l'IA »** de la fiche fait chercher l'entreprise
sur le web par Claude (API Anthropic, modèle `claude-opus-5-5`, outils de
recherche et de lecture web côté serveur) : site, réseaux sociaux, fiche
Google, application mobile, avis, presse. Le résultat remplit les champs
vides de la fiche (ou tous, si « Remplacer » est coché), et le résumé et les
sources sont notés dans la fiche. Les chiffres non visibles dans une source
restent vides : l'IA a pour consigne de ne jamais les estimer.

Mise en place : créer une clé sur console.anthropic.com (paiement à
l'usage, limite de dépense conseillée) et la coller dans Paramètres →
Recherche par IA. La clé reste dans le navigateur (appel direct à
api.anthropic.com) et n'est jamais incluse dans les sauvegardes exportées.
Le coût estimé est affiché après chaque recherche.

**Prise en compte des informations trouvées sur internet** : le résultat
complet de chaque recherche est conservé dans la fiche (bloc « Trouvé sur
internet », avec les sources), même ce qui n'a pas pu entrer dans une case
déjà remplie. Il est transmis à l'IA à chaque rédaction (résumé, concurrents,
avis des clients, présence en ligne, points à vérifier), repris dans le
contexte du plan (sans les adresses des sources) et affiché dans la
présentation (avis des clients en ligne, sources consultées). Une recherche
préalable est proposée à la création d'un plan et avant un brouillon
complet si l'entreprise n'a pas été recherchée depuis plus de 60 jours ; le
score du plan le rappelle aussi.

Le SDK officiel `@anthropic-ai/sdk` (licence MIT) est embarqué dans
`js/vendor/anthropic-sdk.esm.js` (assemblé avec esbuild) et chargé
seulement au moment d'une recherche.

Sans clé API, les boutons 🔎 ouvrent les recherches manuelles et les
chiffres sont recopiés à la main (les réseaux sociaux bloquent la lecture
directe par une page web).

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

## Rédaction par IA

Avec la clé API (Paramètres → Recherche par IA) : bouton **« ✨ Proposer avec
l'IA »** sur chaque étape du plan (résumé, SWOT, objectifs, cibles,
stratégie avec 3 slogans au choix, actions avec budgets et dates, suivi,
bilan) et **« Rédiger tout le plan »** à partir de la fiche entreprise.
Aperçu avant application (Compléter / Remplacer), coût estimé affiché.
L'IA rédige aussi les publications du calendrier et le commentaire des
rapports mensuels.

## Signature du client

Section **« Bon pour accord »** en fin de présentation : le client signe au
doigt sur téléphone ou tablette ; le plan passe en « Accepté » et la
facture d'acompte est proposée. Lignes de signature papier à l'impression
si le client n'a pas signé à l'écran.

## Facturation avancée

- **Factures récurrentes** (mensuelles, trimestrielles, annuelles) : les
  brouillons sont préparés automatiquement à chaque échéance.
- **Relances** : rappel 3 jours avant, le jour même, puis chaque semaine en
  retard, listées sur le tableau de bord avec un message adapté.
- **Paiement** : MonCash, NatCash, virement, lien de paiement (Paramètres),
  affichés sur la facture avec un **QR code**.

## Calendrier de publication

Étape du plan : vue mensuelle, publications par réseau (texte, visuel,
hashtags), statuts idée → brouillon → à valider → validé → publié,
glisser-déposer, filtres, proposition d'un mois complet par l'IA,
calendrier à valider imprimable, publications de la semaine sur le tableau
de bord.

## Plan d'exécution interne (« À publier »)

Document **interne**, séparé de la présentation au client, pour la personne
qui exécute : semaine par semaine et jour par jour, avec l'heure, quoi
publier, sur quel réseau et dans quel format, le texte complet prêt à
copier, les hashtags, le lien, le visuel et les **consignes internes**
(boost, épinglage, réponses aux commentaires…), le responsable, et une
alerte si le client n'a pas encore validé. Il comprend aussi les visuels à
préparer (N jours avant, réglable dans les Paramètres), le début et la fin
des actions, et les publications en retard. Boutons « Marquer publié »,
« Visuel prêt », « Copier le texte » ; filtre par responsable et par plan ;
impression de la semaine avec cases à cocher ; programme du jour à envoyer
par WhatsApp. Accès : menu « À publier » (tous les plans) ou bouton
« Plan d'exécution interne » du calendrier d'un plan. Les consignes et le
responsable ne sont jamais envoyés au portail client.

## Rapports mensuels

Relevés par mois (dépensé, personnes touchées, prospects, ventes) dans
« Résultats & pilotage », graphiques d'évolution, et **rapport mensuel**
imprimable en PDF (chiffres et variations, évolution, réalisations,
objectifs, commentaire) avec résumé prêt à envoyer par WhatsApp ou email.

## Modèles de campagne

Neuf modèles (lancement, fin d'année, ouverture, notoriété, relance des
ventes, rentrée, événement, diaspora, fidélisation) : objectifs, actions
datées dans la période et budget réparti. À la création du plan ou depuis
l'étape Informations.

## Temps & rentabilité

Chronomètre et saisie du temps par client et par plan ; rentabilité par
client (honoraires facturés hors achat média, coût du temps selon le coût
horaire défini dans les Paramètres, marge, gain réel par heure).

## Équipe et portail client (Supabase, facultatif)

Pour travailler à plusieurs sur les mêmes données et faire valider les
plans par les clients en ligne :

1. Créer un projet sur supabase.com et exécuter
   `marketing/supabase/marketing.sql` dans l'éditeur SQL.
2. Paramètres → Équipe & synchronisation : adresse du projet et clé
   `anon`, puis créer son compte et l'espace de l'agence (les données
   locales y sont envoyées). Inviter les collègues par email.
3. Les modifications sont synchronisées en temps réel entre les membres ;
   l'application reste utilisable hors ligne (renvoi au retour de la
   connexion). La clé API Claude n'est jamais envoyée.
4. **Portail client** : mettre le dossier `marketing/` en ligne (Netlify,
   Vercel, GitHub Pages…), indiquer son adresse dans les Paramètres, puis
   bouton « 🔗 Lien client » dans la présentation ou le calendrier. Le
   client ouvre `client.html` sur son téléphone, signe la proposition,
   valide ou commente chaque publication et peut envoyer un message ; ses
   réponses s'appliquent automatiquement au plan.

Sécurité : toutes les tables sont protégées par RLS (accès réservé aux
membres de l'espace) ; le portail client n'accède à aucune table, seulement
à deux fonctions exigeant un jeton de partage valide (90 jours,
désactivable), qui ne renvoient pas les informations internes (notes,
résultats, temps). Le schéma a été testé sur PostgreSQL 16 avec une
simulation des rôles Supabase (28 vérifications d'accès), mais pas sur un
vrai projet Supabase.

## Fichiers

```
index.html        application
client.html       portail client (validation et signature en ligne)
styles.css        styles écran + impression
js/app.js         vues, éditeur, présentation, factures, routeur
js/store.js       stockage local, formatage, calcul des totaux
js/analyse.js     score du plan, résultats, recommandations
js/fiche.js       fiche entreprise, présence en ligne, diagnostic
js/ia.js          recherche et rédaction par IA (API Claude)
js/facturation.js factures récurrentes et calendrier des relances
js/calendrier.js  calendrier de publication
js/graphiques.js  histogrammes SVG des rapports
js/modeles.js     modèles de plans par type de campagne
js/sync.js        synchronisation avec l'espace d'équipe Supabase
js/client.js      portail client (client.html)
js/vendor/        SDK Anthropic, Supabase, générateur de QR code
supabase/marketing.sql  schéma, sécurité (RLS) et fonctions du portail
js/secteurs.js    suggestions par secteur d'activité et liste des canaux
```

## Limites

- Données propres à chaque navigateur : exportez une sauvegarde régulièrement.
  Pour un usage multi-utilisateurs, les données pourraient être migrées vers
  Supabase comme l'app POS.
