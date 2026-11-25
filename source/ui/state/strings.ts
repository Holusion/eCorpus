
export type LocalizedString = {
  "fr" :string, 
  "en" :string,
  "fr_plural" ?:string,
  "en_plural" ?:string,
};
export type Language = keyof LocalizedString;

export type I18nDict = {
  [key:string]: I18nDict|LocalizedString;
}

export default {
  ui:{
    users: {
      "fr": "Utilisateurs",
      "en": "Users"
    },
    upload: {
      "fr": "Créer une scène",
      "en": "Upload a scene"
    },
    username: {
      "fr": "Nom d'utilisateur",
      "en": "Username"
    },
    password: {
      "fr": "Mot de passe",
      "en": "Password"
    },
    passwordConfirm: {
      "fr": "Confirmer le mot de passe",
      "en": "PasswordConfirm"
    },
    changePassword: {
      "fr": "Changer le mot de passe",
      "en": "Change password"
    },
    saveChanges: {
      "fr": "Enregistrer les modifications",
      "en": "Save changes"
    },
    submit: {
      "fr": "Envoyer",
      "en": "Submit",
    },
    userSettings: {
      "fr": "Paramètres utilisateur",
      "en": "User settings",
    },
    email: {
      "fr": "adresse email",
      "en": "email address"
    },
    login: {
      "fr": "Connexion",
      "en": "Sign In"
    },
    logout: {
      "fr": "Se déconnecter",
      "en": "Logout"
    },
    filename: {
      fr:"fichier{plural=s}",
      en:"filename{plural=s}",
    },
    rights: {
      "fr": "droits",
      "en": "rights"
    },
    mtime: {
      fr: "dernière modification",
      en: "modification time"
    },
    ctime: {
      fr: "dernière création",
      en: "creation time"
    },
    author: {
      fr: "auteur{plural=s}",
      en: "author{plural=s}"
    },
    history: {
      fr: "Historique",
      en: "History"
    },
    access: {
      fr: "Accès",
      en: "Access"
    },
    add: {
      fr: "Ajouter",
      en: "Add"
    },
    none: {
      fr: "aucun",
      en: "none"
    },
    read: {
      fr: "lecture",
      en: "read"
    },
    write: {
      fr: "écriture",
      en: "write"
    },
    admin: {
      fr: "admin",
      en: "admin"
    },
    administration: {
      fr: "Administration",
      en: "Administration"
    },
    reportBug: {
      fr: "Signaler un bug",
      en: "Report a bug"
    },
    editScene: {
      fr: "Éditer la scène",
      en: "Edit scene"
    },
    viewScene: {
      fr: "Afficher la scène",
      en: "View scene"
    },
    recoverPassword: {
      fr: "mot de passe oublié?",
      en: "recover your password"
    },
    createUser: {
      fr: "Nouvel utilisateur",
      en: "Create User"
    },
    archive: {
      fr: "archive{plural=s}",
      en: "archive{plural=s}",
    },
    isAdministrator: {
      fr: "Est administrateur",
      en: "Is Administrator"
    },
    create: {
      fr: "Créer",
      en: "Create"
    },
    tools: {
      fr: "Outils",
      en: "Tools"
    },
    stats: {
      fr: "Statistiques",
      en: "Statistics"
    },
    edit: {
      fr: "éditer",
      en: "edit"
    },
    view: {
      fr: "aperçu",
      en: "view"
    },
    ctimeSection:{
      fr: "Derniers ajouts",
      en: "Recently added"
    },
    mtimeSection:{
      fr: "Dernières modifications",
      en: "Recently edited"
    },
    myScenes:{
      fr: "Mes scènes",
      en: "My Scenes"
    },
    newScene:{
      fr: "Nouvelle scène",
      en: "New scene"
    },
    searchScene:{
      fr: "rechercher un modèle",
      en: "search model"
    },
    delete:{
      fr: "supprimer",
      en: "delete"
    },
    rename:{
      fr: "renommer",
      en: "rename"
    },
    cancel:{
      fr: "annuler",
      en: "cancel"
    },
    name:{
      fr: "nom",
      en: "name"
    },
    sortBy:{
      fr: "Trier par",
      en: "Sort by"
    },
    adminSection:{
      fr:"administration de l'instance eCorpus",
      en:"eCorpus instance administration"
    },
    downloadZip:{
      fr:"Télécharger toutes les scènes",
      en:"Download all scenes"
    },
    downloadScene:{
      fr:"Télécharger la scène",
      en:"Download this scene"
    },
    renameScene:{
      fr: "Renommer la scène",
      en: "Rename scene"
    },
    sendTestMail:{
      fr: "Envoyer un mail de test",
      en: "Send a test mail",
    },
    send: {
      fr: "Envoyer",
      en: "Send",
    },
    tag: {
      fr: "tag{plural=s}",
      en: "tag{plural=s}"
    },
    by: {
      fr: "par",
      en: "by",
    },
    created: {
      fr: "Créé",
      en: "Created",
    },
    modified:{
      fr: "Modifié",
      en: "Modified",
    },
    deleted:{
      fr: "Supprimé",
      en: "Deleted",
    },
  },
  info:{
    missingUploadFile:{
      fr: "{path} est manquant : {file} y fait référence",
      en: "{path} is missing: {file} refers to it",
    },
    noData:{
      fr:"Aucune donnée trouvée pour {item}",
      en:"No data available for {item}"
    },
    etAl:{
      fr:" et {count} autre{plural=s}",
      en:" and {count} other{plural=s}",
    },
    showDetails:{
      fr: "voir le détail",
      en: "show more details",
    },
    hideDetails:{
      fr: "cacher le détail",
      en: "hide details"
    },
    lead:{
      fr: "eCorpus est un modèle de base de données d'objets 3D développé par holusion et utilisant un éditeur et visualisateur enrichi issu du projet DPO-Voyager du smithsonian institute",
      en: "eCorpus is a database of 3D objects developped by holusion using and extending an open-source viewer made by the Smithsonian Institute"
    },
    useStandalone:{
      fr: "Tester le mode standalone",
      en: "Test standalone mode"
    },
    recoverPasswordLead: {
      fr: "veuillez fournir votre identifiant ou votre email et nous vous enverrons un lien de connexion",
      en: "please provide your username or email and we will send you a recovery link"
    },
    userDeleteConfirm: {
      fr : "Êtes-vous sûr de vouloir supprimer l'utilisateur {username}?",
      en : "Are you sure you want to delete user {username} ?"
    },
    sceneDeleteConfirm: {
      fr : "Êtes-vous sûr de vouloir supprimer la scène {name}?",
      en : "Are you sure you want to delete scene {name}?"
    },
    homeHeader: {
      fr: "Système de gestion de scènes 3D",
      en: "3D Scene Management System"
    },
    userManager: {
      fr: "Gestion des utilisateurs",
      en: "User Manager"
    },
    changeDay: {
      fr: "Changements du {date}",
      en: "Changes on {date}"
    },
    restoreTo: {
      fr: "restaurer à {point}",
      en: "restore to {point}"
    },
    restoredTo: {
      fr: "scène restaurée à {point}",
      en: "scene restored to {point}",
    },
    viewAtThisPoint: {
      fr: "Voir la scène à ce moment",
      en: "View scene at this point",
    }
  },
  //Voyager Story's import menu: see composants/StoryImportMenu.ts
  storyImport:{
    title: {
      fr: "Importer un fichier",
      en: "Import File",
    },
    noFiles: {
      fr: "Déposez des fichiers n'importe où dans la page, ou ajoutez-les.",
      en: "Drop files anywhere in the page, or add them.",
    },
    image: {
      fr: "Image",
      en: "Image",
    },
    checking: {
      fr: "Vérification des fichiers...",
      en: "Checking the files...",
    },
    whatToDo: {
      fr: "Qu'en faire ?",
      en: "What to do with it?",
    },
    environment: {
      fr: "Carte d'environnement",
      en: "Environment map",
    },
    overlay: {
      fr: "Carte de superposition",
      en: "Overlay map",
    },
    plane: {
      fr: "Plan image",
      en: "Image plane",
    },
    sceneFile: {
      fr: "Fichier de la scène",
      en: "Scene file",
    },
    sceneFileHint: {
      fr: "Ajouté tel quel aux fichiers de la scène : pour les articles, l'audio, les sous-titres...",
      en: "Added to the scene's files as it is: for articles, audio, captions...",
    },
    filesHint: {
      fr: "Ils seront ajoutés tels quels aux fichiers de la scène : pour les articles, l'audio, les sous-titres...",
      en: "They'll be added to the scene's files as they are: for articles, audio, captions...",
    },
    severalImages: {
      fr: "Plusieurs images ne peuvent qu'être ajoutées aux fichiers de la scène : importez-les une à une pour en faire une carte d'environnement, une carte de superposition ou un plan image.",
      en: "Several images can only be added to the scene's files: import one at a time to use it as an environment map, an overlay map or an image plane.",
    },
    hdrHint: {
      fr: "Une image HDR ne peut être qu'une carte d'environnement, ou un fichier de la scène.",
      en: "An HDR image can only be an environment map, or a scene file.",
    },
    selectChoice: {
      fr: "Choisissez quoi en faire.",
      en: "Please choose what to do with it.",
    },
    importFiles: {
      fr: "Importer",
      en: "Import",
    },
    newModel: {
      fr: "Nouveau modèle",
      en: "New model",
    },
    existingModel: {
      fr: "Ajouter à un modèle existant",
      en: "Add to existing model",
    },
    close: {
      fr: "Fermer",
      en: "Close",
    },
    name: {
      fr: "Nom",
      en: "Name",
    },
    selectModel: {
      fr: "Choisissez un modèle.",
      en: "Please select a model.",
    },
    files: {
      fr: "Fichiers",
      en: "Files",
    },
    model: {
      fr: "Modèle",
      en: "Model",
    },
    remove: {
      fr: "Retirer {path}",
      en: "Remove {path}",
    },
    addFiles: {
      fr: "Ajouter des fichiers",
      en: "Add files",
    },
    dropHint: {
      fr: "ou déposez-les n'importe où",
      en: "or drop them anywhere",
    },
    sending: {
      fr: "Envoi {percent} %",
      en: "Sending {percent}%",
    },
    sent: {
      fr: "Envoyé",
      en: "Sent",
    },
    waiting: {
      fr: "En attente",
      en: "Waiting",
    },
    missing: {
      fr: "Manquant",
      en: "Missing",
    },
    missingHint: {
      fr: "Le modèle fait référence à ces fichiers : ajoutez-les pour l'importer.",
      en: "The model refers to these files: add them to import it.",
    },
    unused: {
      fr: "Inutile ?",
      en: "Unused?",
    },
    unusedHint: {
      fr: "Le modèle ne semble pas y faire référence. Il est envoyé quand même : retirez-le s'il n'est pas utile.",
      en: "The model doesn't seem to refer to it. It's sent anyway: remove it if it's not needed.",
    },
    otherModel: {
      fr: "Autre modèle",
      en: "Another model",
    },
    otherModelHint: {
      fr: "Un seul modèle est importé à la fois : celui-ci ne le sera pas. Déposez-le seul pour l'importer.",
      en: "Only one model is imported at a time: this one won't be. Drop it on its own to import it.",
    },
    outside: {
      fr: "Hors du dossier du modèle",
      en: "Out of the model's folder",
    },
    outsideHint: {
      fr: "Le modèle ne peut faire référence qu'aux fichiers de son dossier ou en dessous : celui-ci ne sera pas envoyé.",
      en: "The model can only refer to files in its folder or below: this one won't be sent.",
    },
    qualities: {
      fr: "Qualités",
      en: "Qualities",
    },
    present: {
      fr: "Déjà dans le modèle : elle sera remplacée",
      en: "Already in the model: it will be replaced",
    },
    selectQuality: {
      fr: "Choisissez au moins une qualité.",
      en: "Please select derivative quality.",
    },
    optimize: {
      fr: "Optimiser",
      en: "Optimize",
    },
    notOptimizedHint: {
      fr: "La qualité la plus haute est le fichier tel quel",
      en: "The highest quality is the file as it is",
    },
    import: {
      fr: "Importer le modèle",
      en: "Import Model",
    },
    uploading: {
      fr: "Envoi en cours...",
      en: "Uploading...",
    },
    processing: {
      fr: "Traitement en cours...",
      en: "Processing...",
    },
    uploadFailed: {
      fr: "Échec de l'envoi",
      en: "Upload failed",
    },
  },
  errors:{
    '404':{
      fr: "Non trouvé",
      en: "Not found"
    },
    '404_text':{
      fr:"Pas de route correspondant à {route}",
      en:"No route matching {route}"
    },
    createUser: {
      fr: "Erreur à la création de l'utilisateur",
      en: "Error creating user"
    }
  }
}