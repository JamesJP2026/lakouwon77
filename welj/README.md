# Manager Logistique — WELJ Express Services

Application de gestion de la chaîne logistique **Miami → Haïti** pour
**WELJ Express Services** (welj-ht.com) : réception à l'entrepôt de
Fort Lauderdale, consolidation en manifestes, suivi, dédouanement,
remise en succursale (Delmas 95, Jérémie, Cap-Haïtien), caisse
multi-devises et rapports.

100 % en français, JavaScript vanilla, **aucune étape de build**, comme
l'app POS Lakouwon de ce dépôt.

## Lancer l'application

```bash
cd welj
python3 -m http.server 8080     # ou : npx serve .
```
Ouvrez <http://localhost:8080>. Des **données de démonstration** sont
chargées au premier lancement (18 clients, 41 colis à toutes les étapes,
4 manifestes). Paramètres → *Tout effacer* pour démarrer à vide.

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
| **Tableau de bord** | KPIs (entrepôt, en route, à remettre, livrés, encaissé, impayés), pipeline par statut, encaissements hebdomadaires, manifestes actifs, alertes |
| **Réception entrepôt** | Saisie du colis (client, n° fournisseur, poids, dimensions, valeur, service, destination), **devis instantané** (poids volumétrique, assurance, douane), impression de l'étiquette 4×6 avec code-barres |
| **Colis** | Recherche (n° WELJ, n° fournisseur, client, contenu), filtres, fiche détaillée : historique, facture, paiements, notifications, changement de statut contrôlé |
| **Manifestes / Envois** | Création d'un envoi aérien (AWB) ou maritime (BL/conteneur), ajout des colis compatibles de l'entrepôt, **mise à jour en masse** de tous les colis quand le manifeste avance (fermé → transit → douane → arrivé), impression du manifeste |
| **Retrait & livraison** | Scan du code-barres au comptoir, files « à trier / prêts / en livraison / remis aujourd'hui », affectation d'un livreur, remise avec nom et pièce d'identité (bloquée si solde impayé, sauf admin) |
| **Clients** | Fiche client avec code `WELJ-0001`, adresse Miami personnalisée, historique des colis, solde, relevé de compte imprimable |
| **Caisse & paiements** | Encaissement USD / HTG / MonCash / NatCash / carte / virement avec conversion au taux du jour, reçus numérotés, totaux par méthode, soldes à recouvrer |
| **Suivi** | Vue « client » d'un colis : barre de progression et historique |
| **Rapports** | CA mensuel sur 6 mois, ventilation par service, destination et catégorie, délai moyen, journal d'activité, exports CSV |
| **Paramètres** | Coordonnées, **grille tarifaire**, frais, taux USD→HTG, succursales, utilisateurs et rôles, sauvegarde/restauration JSON |

### Cycle de vie d'un colis

```
Reçu à l'entrepôt → Consolidé (manifeste) → En transit → En dédouanement
  → Arrivé en Haïti → Prêt pour retrait ─┬→ Livré
                                          └→ En livraison → Livré
(à tout moment : Exception / bloqué)
```

### Rôles

| Rôle | Accès |
|---|---|
| Administrateur | Tout |
| Agent entrepôt Miami | Réception, colis, manifestes, clients, suivi |
| Agent comptoir Haïti | Colis, retrait & livraison, clients, caisse, suivi |
| Livreur | Uniquement ses livraisons |

## Tarification (à adapter)

Les **tarifs livrés sont des exemples** : remplacez-les dans
Paramètres par la grille officielle de WELJ. Le calcul :

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
welj/
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
  lui-même sur welj-ht.com) : à construire une fois la base partagée en place.
- Le site welj-ht.com n'était pas accessible depuis l'environnement de
  développement ; les informations de l'entreprise proviennent de
  sources publiques et sont modifiables dans Paramètres.
