# Atlas Art Minerals : site + tableau de bord /admin

## Démarrer

```
node server.js
```

- Site : http://localhost:4321
- Administration : http://localhost:4321/admin/

Connexion : identifiant `admin`, mot de passe initial dans le fichier `data/PREMIER-MOT-DE-PASSE.txt`. Changez-le dans **Paramètres › Mot de passe** (le fichier est alors supprimé).

## Le tableau de bord (menu de gauche)

**Vue d'ensemble** : chiffres clés (produits, articles, pages, médias, auteurs, versions), actions rapides, activité récente et liste « À vérifier ».

**Demandes de devis** (CRM) : chaque demande envoyée depuis la page Devis arrive ici (nom, société, pays, pièces, quantités, message). Statut Nouvelle / En cours / Devis envoyé / Gagnée / Perdue, notes internes, réponse par email ou WhatsApp en un clic, export Excel. Le nombre de nouvelles demandes s'affiche dans le menu.

**Statistiques** : visites, visiteurs, demandes de devis, inscriptions, pages et produits les plus vus, sources, langues, appareils (7, 30 ou 90 jours). Anonyme et sans cookies.

**Gestion du contenu**
- **Articles** : le Journal du site (page `journal.html`). Titre, résumé, contenu mis en forme (titres, gras, listes, citations, liens, images), image de couverture, catégorie, auteur, date, statut Brouillon / Publié, titre et description Google.
- **Pages** : l'éditeur visuel. Cliquez sur un texte pour l'écrire, sur une image pour la remplacer, sur un bouton pour changer son lien. « Masquer cette section », gestion du diaporama, titre Google de chaque page. Le menu et le pied de page se modifient sur toutes les pages à la fois.
- **Produits** : ajouter, modifier ou supprimer une pièce (photo, famille, matière, référence, tailles, description, vedette).
- **Pages produit** : chaque produit a sa propre page (`product.html?p=…`) : photos, choix de la taille, ajout à la liste de devis, tableau des tailles et de l'emballage, description longue, question WhatsApp, pièces de la même famille. Bouton « Voir ↗ » dans la liste des produits. Titre Google, image de partage et fiche produit Google sont générés automatiquement, et chaque produit est dans `sitemap.xml`. Les textes communs à toutes les fiches se modifient dans **Pages › Fiche produit (modèle commun)**.
- **Import Excel** : importez votre catalogue .xlsx tel quel, photos comprises.
  - En-têtes sur deux lignes (*Product (cm)* › *Length*…) et cellules fusionnées reconnus ; chaque colonne est proposée automatiquement et peut être corrigée.
  - Les lignes qui partagent le même **Nº** (ou le même nom) forment **un produit avec plusieurs tailles** : référence, poids, dimensions, emballage, poids emballé et volume par taille.
  - Catégories Retail / Wholesale, statut, description courte et longue sont gardés. La famille du site est déduite des catégories.
  - **Photos** : les images collées dans Excel (flottantes ou « dans la cellule ») sont extraites et optimisées ; sinon les liens des colonnes *Webp* / *Jpeg* sont téléchargés (Google Drive / Dropbox : partage « tous les utilisateurs disposant du lien »). Les photos non récupérées sont listées à la fin.
  - Réimporter le même fichier met à jour les produits (par référence ou par nom) sans créer de doublons.
  - Sur le site, la fiche rapide montre le tableau des tailles, l'emballage et la description longue.
- **Auteurs** : nom, rôle, photo et biographie (signature des articles).
- **Catégories** : catégories du journal et familles de produits (filtres de la Collection).
- **Menus** : liens du menu principal et du pied de page (ajouter, retirer, réordonner), avec un libellé par langue.
- **Traductions** : activer le français, l'arabe (de droite à gauche) et l'espagnol, choisir la langue par défaut, traduire chaque texte page par page. Export / import CSV pour un traducteur. Les visiteurs changent de langue avec le sélecteur en haut du site.

**Apparence**
- **Modèles** : 4 ambiances appliquées à tout le site : Galerie claire, Galerie nuit, Sable de l'Atlas, Pierre grise.
- **Personnalisation du modèle** : couleur d'accent, police, arrondi des coins, bandeau du haut affiché ou non, avec aperçu.

**Médias**
- **Gérer les médias** : toutes les images du site, avec taille, « Utilisé / Libre », copier le lien, optimiser, supprimer (seulement si l'image n'est utilisée nulle part).
- **Téléverser un média** : glisser-déposer plusieurs images ; elles sont optimisées puis rangées dans `assets/uploads/`.
- **Moteur d'images** : largeur maximale, qualité, conversion WebP. S'applique à chaque photo téléversée dans l'admin. Le bouton « Optimiser les images lourdes » réduit les images existantes et met à jour les liens du site automatiquement.

**Marketing**
- **Abonnés newsletter** : emails inscrits depuis le pied de page du site, export Excel, désinscription.
- **SEO** : adresse du site, image de partage (réseaux sociaux), code de vérification Google Search Console, redirections (ancienne adresse → nouvelle), contrôle des titres et descriptions de chaque page. `sitemap.xml` et `robots.txt` sont générés automatiquement.

**Déploiement** : mode maintenance (page « Nous revenons bientôt » pour les visiteurs, vous voyez le site normalement), sauvegardes automatiques quotidiennes (14 gardées, téléchargeables), statut du serveur, téléchargement d'une sauvegarde complète (.json) et restauration, versions des pages (une copie avant chaque enregistrement) restaurables en un clic, check-list de mise en ligne.

**Équipe** (administrateur seulement)
- **Utilisateurs** : créer des comptes. *Administrateur* : tout. *Éditeur* : pages, articles, produits, médias, menus, traductions. *Commercial* : demandes de devis, statistiques, abonnés.
- **Journal d'activité** : qui a modifié quoi et quand.

**Mon compte** : double authentification (2FA) avec Google Authenticator ou Microsoft Authenticator. Un administrateur peut la réinitialiser si un téléphone est perdu.

**Paramètres** : contact (téléphone, WhatsApp, email, adresse), chiffres affichés, logo, texte du bandeau, bandeau cookies, mot de passe.

**Pages légales** : `legal.html` (mentions légales) et `privacy.html` (confidentialité) se modifient dans l'éditeur visuel comme les autres pages. Une page 404 personnalisée s'affiche pour les adresses introuvables.

## Où sont les données

- `data/catalog.json` : produits et familles
- `data/journal.json` : articles, auteurs, catégories
- `data/site.json` : informations, apparence, réglages du moteur d'images
- `data/users.json` : comptes, rôles et 2FA (mots de passe chiffrés)
- `data/leads.json` : demandes de devis
- `data/subscribers.json` : abonnés newsletter
- `data/i18n.json`, `data/menu.json`, `data/redirects.json` : traductions, menus, redirections
- `data/stats.json`, `data/activity.json` : statistiques et journal d'activité
- `data/backups/auto/` : sauvegardes automatiques
- `data/backups/` : versions des pages
- `assets/products/`, `assets/uploads/`, `assets/photos/` : images

La sauvegarde (**Déploiement › Télécharger une sauvegarde**, et chaque jour automatiquement) contient tout : produits, articles, textes des pages, traductions, menus, redirections, demandes, abonnés, comptes, réglages. La restauration remet tout sauf les comptes. Copiez aussi le dossier `assets/` (images). Les connexions à l'admin restent ouvertes après un redémarrage du serveur (`data/sessions.json`).

## Alertes email

Dans **Paramètres › Alertes email**, entrez les réglages SMTP de votre messagerie puis cliquez « Envoyer un email de test ». Ensuite :
- chaque nouvelle demande de devis vous est envoyée par email (« Répondre » écrit directement au client) ;
- chaque nouvel abonné reçoit un email de bienvenue avec un lien de désinscription. Ce lien figure aussi dans l'export Excel des abonnés, pour vos envois de newsletter.

Sans ces réglages, rien n'est envoyé : les demandes restent dans **Demandes de devis**.

## Mise en ligne

Hébergement **Node.js 18+** (VPS, Hostinger Node.js, Render, Railway…), aucune dépendance à installer.

- Commande : `node server.js`. Port : variable `PORT` (sinon 4321). Mot de passe initial : variable `ADMIN_PASSWORD` (optionnelle).
- **HTTPS** obligatoire en production (hébergeur ou Nginx/Caddy).
- Derrière un proxy (Nginx, Hostinger, Render…), démarrez avec la variable **`TRUST_PROXY=1`** : vraie adresse des visiteurs pour l'anti-spam, le blocage des connexions et les statistiques, et cookie de session `Secure`.
- `data/` et `assets/` sur un disque **persistant**.

Sécurité : mot de passe chiffré (scrypt), session HttpOnly, blocage après 8 essais ratés pendant 15 min, double authentification, rôles, journal d'activité, anti-spam sur les formulaires publics, `data/` et `server.js` inaccessibles depuis le web, contenus nettoyés (pas de code dans les textes ni les articles), liens dangereux refusés, images vérifiées (WEBP/JPG/PNG, 5 Mo max), suppression impossible d'une image utilisée.
