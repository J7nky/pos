const fr = {
  app: { name: 'POS Produits', loading: 'Chargement...' },
  common: {
    actions: { cancel: 'Annuler', save: 'Enregistrer', delete: 'Supprimer', edit: 'Modifier', add: 'Ajouter', view: 'Voir', close: 'Fermer', export: 'Exporter', refresh: 'Rafraîchir', search: 'Rechercher', details: 'Détails' },
    status: { online: 'En ligne', offline: 'Hors ligne', synced: 'Synchronisé', unsyncedCount: '{{count}} non synchronisé(s)' },
    placeholders: { search: 'Rechercher...' },
    labels: { units: 'unités', kg: 'kg', piece: 'Pièce', box: 'Boîte', bag: 'Sac', bundle: 'Lot', dozen: 'Douzaine' },
    confirmations: { fullResyncConfirm: 'Cela effacera les données locales et retéléchargera depuis le serveur. Continuer ?' },
    alerts: { connectionRestored: 'Connexion rétablie', autoSyncingChanges: 'Synchronisation automatique de vos modifications...' }
  },
  nav: { home: 'Accueil', inventory: 'Stock', pos: 'Point de vente', customers: 'Clients', accounting: 'Comptabilité', reports: 'Rapports', settings: 'Paramètres' },
  layout: { title: 'ProducePOS', connection: { online: 'En ligne', offline: 'Hors ligne' }, unsynced: 'non synchronisé', signOut: 'Déconnexion' },
  login: {
    title: 'POS Produits', subtitle: 'ERP du marché de gros', email: 'Adresse e-mail', emailPlaceholder: 'Entrez votre e-mail', password: 'Mot de passe', passwordPlaceholder: 'Entrez votre mot de passe',
    signIn: 'Se connecter', signUp: 'Créer un compte', signingIn: 'Connexion...', signingUp: 'Création du compte...', fullName: 'Nom complet', role: 'Rôle', store: 'Magasin', selectStore: 'Sélectionnez un magasin', demoAccount: 'Compte démo',
    invalidCredentials: 'E-mail ou mot de passe invalide', signupFailed: 'Échec de la création. Réessayez.', genericError: 'Une erreur est survenue. Réessayez.'
  },
  settings: {
    header: 'Paramètres', saved: 'Paramètres enregistrés avec succès !', userInfo: 'Informations utilisateur', name: 'Nom', email: 'E-mail', role: 'Rôle',
    inventoryAlerts: 'Alertes de stock', lowStockAlerts: 'Alerte de stock faible', lowStockDescription: 'Être averti lorsque les produits sont faibles', lowStockThreshold: 'Seuil de stock faible', units: 'unités', save: 'Enregistrer', currentThreshold: 'Seuil actuel : {{value}} unités',
    commissionSettings: 'Paramètres de commission', defaultCommissionRate: 'Taux de commission par défaut', currentDefaultRate: 'Taux par défaut actuel : {{value}}%',
    currencySettings: 'Paramètres de devise', displayCurrency: 'Devise d’affichage', currentCurrency: 'Devise actuelle : {{value}}',
    systemInfo: 'Informations système', appVersion: 'Version de l’application', dataStorage: 'Stockage des données', lastSync: 'Dernière synchro', deviceType: 'Type d’appareil', webApp: 'Application Web',
    security: 'Sécurité', sessionManagement: 'Gestion de session', sessionNote: 'Votre session restera active jusqu’à déconnexion manuelle', changePassword: 'Changer le mot de passe',
    language: 'Langue', language_ar: 'Arabe', language_en: 'Anglais', language_fr: 'Français'
  },
  home: {
    welcome: 'Bon retour, {{name}}', subtitle: 'Voici ce qui se passe aujourd’hui dans votre magasin.', fastActions: 'Actions rapides', hide: 'Masquer', show: 'Afficher',
    quickSale: 'Vente rapide', quickSaleDesc: 'Commencer une nouvelle vente',
    shortcuts: 'Raccourcis',
    receiveProducts: 'Réception produits', receiveProductsDesc: 'Ajouter du stock des fournisseurs',
    addCustomer: 'Ajouter client', addCustomerDesc: 'Enregistrer un nouveau client',
    recordExpense: 'Enregistrer dépense', recordExpenseDesc: 'Enregistrer les dépenses',
    todaySales: 'Ventes du jour', todaySalesDesc: 'Voir les performances de vente',
    checkStock: 'Vérifier le stock', checkStockDesc: 'Surveiller les niveaux de stock',
    cashInDrawer: 'Caisse', notOpenedToday: 'Non ouvert aujourd’hui', openCashDrawer: 'Ouvrir la caisse', todaysExpenses: 'Dépenses du jour', lowStockItems: 'Articles à faible stock', needAttention: 'Nécessite une attention', alertsDisabled: 'Alertes désactivées', lowStockAlert: 'Alerte de stock faible', allWellStocked: 'Tous les produits sont bien approvisionnés !', recentActions: 'Actions récentes', noRecentSales: 'Aucune action récente'
  },
  inventory: { header: 'Gestion de stock', receiveProducts: 'Réception produits', addProduct: 'Ajouter produit', productReception: 'Réception de produit', stockProducts: 'Articles en stock', searchProducts: 'Rechercher des produits...', currentStockLevels: 'Niveaux de stock', outOfStock: 'Rupture de stock', lowStock: 'Stock faible', inStock: 'En stock', recentProductReceives: 'Dernières réceptions', actions: 'Actions', edit: 'Modifier', delete: 'Supprimer', noContactInfo: 'Pas d’info contact', remaining: 'restant' },
  pos: { header: 'Point de vente', newBill: 'Nouvelle facture', cartEmpty: 'Panier vide', products: 'Produits', subtotal: 'Sous-total', total: 'Total', customerName: 'Nom du client', walkInCustomer: 'Client de passage', paymentMethod: 'Mode de paiement', cash: 'Espèces', card: 'Carte', credit: 'Crédit', amountReceived: 'Montant reçu', change: 'Rendu', notesOptional: 'Notes (facultatif)', completeSale: 'Finaliser la vente', processing: 'Traitement...', addNewCustomer: 'Ajouter un client', searchCustomers: 'Rechercher des clients...', searchProducts: 'Rechercher des produits ou fournisseurs...' },
  reports: { header: 'Rapports & Analyses', exportReport: 'Exporter le rapport', generateReport: 'Générer le rapport', reportType: 'Type de rapport', startDate: 'Date de début', endDate: 'Date de fin', salesReport: 'Rapport des ventes', inventoryReport: 'Rapport de stock', customerReport: 'Rapport clients', profitAnalysis: 'Analyse du profit', totalRevenue: 'Revenu total', totalSales: 'Ventes totales', averageSale: 'Vente moyenne', customerDebt: 'Dette client', topSellingProducts: 'Produits les plus vendus', currentStockLevels: 'Niveaux de stock actuels', status: { outOfStock: 'Rupture', lowStock: 'Faible', inStock: 'En stock', never: 'Jamais' } },
  syncStatus: { header: 'Statut de synchronisation', connection: 'Connexion', lastSync: 'Dernière synchro', pendingChanges: 'Modifications en attente', items: 'éléments', manualSync: 'Synchro manuelle', fullResync: 'Réinitialisation complète', validateAndClean: 'Vérifier & Nettoyer les données', workingOffline: 'Travail hors ligne', offlineNote: 'Les modifications seront synchronisées à la reconnexion.', autoSyncEnabled: 'Synchronisation automatique activée • Se synchronise automatiquement en ligne' }
};

export default fr;


