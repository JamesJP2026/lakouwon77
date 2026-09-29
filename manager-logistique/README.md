# Manager Logistique

Application de gestion de la chaîne logistique **Miami → Haïti** pour
votre entreprise de transport : réception à l'entrepôt de
Fort Lauderdale, consolidation en manifestes, suivi, dédouanement,
remise en succursale (Delmas 95, Route Frères / Technozi, Tabarre,
Cap-Haïtien, Jérémie, Les Cayes — Gonaïves et Saint-Marc bientôt), caisse
multi-devises et rapports.

100 % en français, JavaScript vanilla, **aucune étape de build**, comme
l'app POS Lakouwon de ce dépôt.

## Version fichier unique (double-clic, sans serveur)

`dist/Manager-Logistique.html` contient toute l'application dans un
seul fichier : copiez-le sur n'importe quel ordinateur et ouvrez-le d'un
double-clic (Chrome, Edge ou Firefox). Pas d'installation, pas d'Internet
nécessaire (seules les polices viennent de Google Fonts ; sans connexion,
le navigateur utilise ses polices système).

Après chaque modification du code, régénérez-le :

```bash
cd manager-logistique
python3 build.py
```

Les données restent enregistrées dans le navigateur de l'ordinateur qui
ouvre le fichier (utilisez Paramètres → Sauvegarde pour les transférer).

## Lancer l'application

```bash
cd manager-logistique
python3 -m http.server 8080     # ou : npx serve .
```
Ouvrez <http://localhost:8080>. Des **données de démonstration** sont
chargées au premier lancement (18 clients, 44 colis à toutes les étapes,
5 envois aériens et maritimes, dont un en retard). Paramètres → *Tout effacer* pour démarrer à vide.

## Inspiration : les meilleurs logiciels du secteur

| Logiciel | Ce qui a été repris |
|---|---|
| **Magaya** (référence des transitaires Miami–Caraïbes) | *Warehouse receipt* à la réception, étiquette code-barres, consolidation des colis en manifeste, *cargo release* au client |
| **CargoWise / GoFreight** | Un seul dossier suit chaque colis de la réception à la facture ; les jalons de suivi (*milestones*) sont horodatés avec lieu et agent |
| **Logiciels de courrier Miami–Haïti** | Code client et **adresse de réception à Miami** par client (pour Amazon, Shein…), notifications WhatsApp/SMS, paiement MonCash/NatCash/HTG |
| **Shipwell / Descartes** | Tableau de bord des flux, alertes d'exceptions et de stockage prolongé, délai porte-à-porte moyen |

## Modules

| Module | Rôle |
|---|---|
| **Acheminement USA → Haïti** | Tour de contrôle globale : chaque envoi (avion ✈ ou bateau ⛴) avec son itinéraire point par point — entrepôt, aéroport/port de départ, escales, aéroport/port d'arrivée, mainlevée douane, succursale — dates **prévues et réelles**, retards, ponctualité, calendrier des mouvements sur 3 semaines, et « où sont les envois en ce moment » par point de transit |
| **Tableau de bord** | KPIs (entrepôt, en route, à remettre, livrés, encaissé, impayés), pipeline par statut, encaissements hebdomadaires, manifestes actifs, alertes |
| **Réception entrepôt — rapide (scan)** | Par lot de livraison : on choisit le livreur (Amazon, UPS, FedEx, USPS, DHL…), on saisit le **nombre de colis annoncé**, puis on **scanne le numéro de suivi** de chaque colis. Compteur en direct et **écart** annoncé/reçu, doublons et colis déjà reçus refusés, client par colis ou par défaut (sinon « Colis non identifié », à réattribuer), pièces, poids facultatif (sinon « à peser », facturé après la pesée). Chaque lot est enregistré avec sa date (historique, étiquettes du lot) |
| **Réception entrepôt — détaillée** | Saisie du colis (client, n° fournisseur, poids, dimensions, valeur, service, destination), **devis instantané** (poids volumétrique, assurance, douane), impression de l'étiquette 4×6 avec code-barres |
| **Colis** | Recherche (n° de colis, n° fournisseur, client, contenu), filtres, fiche détaillée : historique, facture, paiements, notifications, changement de statut contrôlé |
| **Voyages / Manifestes** — registre des voyages | Chaque voyage (avion ou bateau) avec sa **date d'envoi** et les **quantités chargées** (colis, pièces, poids, valeur, fret), **figées au départ** ; filtres par mois et par mode, totaux, récapitulatif mensuel, export CSV et impression du registre |
| **Manifeste (fiche)** | Création d'un envoi aérien (AWB, n° de vol) ou maritime (BL, navire/voyage, conteneur) avec son **itinéraire type**, ajout d'escales, report des dates, ajout des colis compatibles de l'entrepôt. **Valider une étape** enregistre sa date réelle, fait avancer le manifeste et ajoute le point de transit à l'historique de tous ses colis. Impression du manifeste avec l'itinéraire |
| **Transferts bureaux** | Bordereau d'envoi vers un autre bureau : on **scanne ou colle les numéros de tracking** (colis de l'app ou n'importe quel numéro), avec date/heure d'envoi, chauffeur et véhicule. Au bureau destinataire, on **scanne chaque colis reçu** : date et agent enregistrés, doublons refusés, colis hors bordereau signalés. À la clôture, les colis non reçus sont marqués **manquants** (et peuvent être confirmés plus tard s'ils arrivent). Recherche d'un tracking dans tous les transferts, alerte après 2 jours sans confirmation, bordereau imprimable à signer, export CSV |
| **Retrait & livraison** | Scan du code-barres au comptoir, files « à trier / prêts / en livraison / remis aujourd'hui », affectation d'un livreur, remise avec nom et pièce d'identité (bloquée si solde impayé, sauf admin) |
| **Clients** | Fiche client avec code `CL-0001`, adresse Miami personnalisée, historique des colis, solde, relevé de compte imprimable |
| **Caisse & paiements** | Encaissement USD / HTG / MonCash / NatCash / carte / virement avec conversion au taux du jour, reçus numérotés, totaux par méthode, soldes à recouvrer |
| **Suivi** | Vue « client » d'un colis : barre de progression et historique |
| **Rapports** | CA mensuel sur 6 mois, ventilation par service, destination et catégorie, délai moyen, journal d'activité, exports CSV |
| **Paramètres** | Coordonnées, **grille tarifaire**, **points de transit** (aéroports, ports, entrepôts), frais, taux USD→HTG, succursales, utilisateurs et rôles, sauvegarde/restauration JSON |

### Cycle de vie d'un colis

```
Reçu à l'entrepôt → Consolidé (manifeste) → En transit → En dédouanement
  → Arrivé en Haïti → Prêt pour retrait ─┬→ Livré
                                          └→ En livraison → Livré
(à tout moment : Exception / bloqué)
```

### Itinéraires types

| Mode | Étapes (jours par rapport au départ) |
|---|---|
| ✈ Avion | Chargement entrepôt Fort Lauderdale (J-1) → Départ Miami MIA (J0) → Arrivée PAP ou CAP (J0) → Mainlevée douane (J+1) → Succursale de Port-au-Prince ou du Cap (J+2) ; camion depuis Port-au-Prince pour Jérémie, Les Cayes, Gonaïves, Saint-Marc |
| ⛴ Bateau (**Solution Cargo**) | Chargement entrepôt (J-2) → Départ Port Everglades (J0) → Escale en **République dominicaine**, port de Manzanillo (J+3) → Camion jusqu'à la frontière de **Dajabón** (J+4) → Arrivée en Haïti à **Ouanaminthe** (J+5) → Mainlevée douane à Ouanaminthe (J+6) → **Camion depuis Ouanaminthe** vers la succursale : Cap-Haïtien (J+6,6), Gonaïves, Saint-Marc (sur la route), **Port-au-Prince** — Delmas 95, Route Frères, Tabarre (J+7,5) — puis Jérémie et Les Cayes via Port-au-Prince |

Les délais (J+…) sont des **estimations** à ajuster. Le port dominicain
proposé par défaut est Manzanillo (le plus proche de Dajabón) ; Puerto
Plata est aussi disponible. Chaque étape est modifiable (point, date, note) et on peut insérer des
escales ou transbordements. Les points de transit fournis (MIA, FLL,
Port Everglades, PortMiami, Toussaint Louverture, Cap-Haïtien, port de
Port-au-Prince, Lafito…) se complètent dans Paramètres. Une étape non
validée après sa date prévue est signalée **en retard** partout (tableau de
bord, acheminement, manifeste).

### Rôles

| Rôle | Accès |
|---|---|
| Administrateur | Tout |
| Agent entrepôt Miami | Réception, colis, manifestes, clients, suivi |
| Agent comptoir Haïti | Colis, retrait & livraison, clients, caisse, suivi |
| Livreur | Uniquement ses livraisons |

### Succursales

Delmas 95 (siège), Route Frères (Technozi), Tabarre, Cap-Haïtien, Jérémie,
Les Cayes. **Gonaïves et Saint-Marc** sont marquées « bientôt » : visibles
mais non sélectionnables tant que la case *Ouverte* n'est pas cochée dans
Paramètres → Succursales.

### Couleurs

Bleu roi (couleur principale), rouge, blanc et orange — définis en
variables CSS en tête de `css/app.css`.

## Tarification (à adapter)

Les **tarifs livrés sont des exemples** : remplacez-les dans
Paramètres par votre grille officielle. Le calcul :

- **Aérien** : `max(poids réel, poids volumétrique)` arrondi à la livre
  supérieure × prix/lb, avec minimum. Poids volumétrique = L×l×h (pouces)
  ÷ 166 (diviseur modifiable).
- **Maritime** : pieds cubes × prix/pi³, avec minimum.
- Plus : manutention par pièce, assurance (% de la valeur si cochée),
  frais de douane (% de la valeur au-delà d'un seuil), livraison à domicile, remise.

La facture est **figée** à la réception : changer la grille ne modifie
pas les colis déjà reçus.

## Architecture

```
manager-logistique/
  index.html        page unique
  css/app.css       styles (écran + impression étiquette/facture/manifeste)
  js/app.js         routeur, vues, actions, formulaires, impressions
  js/logic.js       statuts, tarification, numérotation, code-barres Code 39, messages
  js/store.js       persistance (seul module qui touche au stockage)
  js/seed.js        paramètres par défaut + données de démonstration
  js/ui.js          modales, toasts, impression, export CSV
```

## Limites actuelles et prochaines étapes

- **Stockage local** : les données sont dans le `localStorage` du
  navigateur — parfait pour une démo ou un seul poste, **pas** pour
  Miami et Port-au-Prince en même temps. Étape suivante : brancher
  `js/store.js` sur Supabase (Postgres + Auth + Realtime), exactement
  comme l'a fait l'app POS Lakouwon à la racine de ce dépôt.
- **Utilisateurs** : le sélecteur « Connecté en tant que » simule les
  rôles ; il n'y a pas de mot de passe tant que Supabase Auth n'est pas branché.
- **Notifications** : WhatsApp s'ouvre avec le message pré-rempli ; le
  SMS est copié dans le presse-papiers. Un envoi automatique demanderait
  un fournisseur SMS (Twilio, etc.) côté serveur.
- **Portail client en ligne** (suivi et pré-alertes par le client
  lui-même en ligne) : à construire une fois la base partagée en place.

## Coordonnées de l'entreprise

L'application ne contient le nom d'aucune entreprise : renseignez votre nom,
vos téléphones, votre adresse en Haïti et l'adresse de votre entrepôt aux
USA dans **Paramètres → Entreprise**. Ils apparaissent ensuite sur les
factures, étiquettes, bordereaux et messages aux clients. Tant que le nom
est vide, « Manager Logistique » est affiché.
