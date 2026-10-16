/** Stable message identifiers. French coverage can grow independently of callers. */
export const english: Record<string, string> = {
  "http.bad-request": "Bad Request",
  "http.unauthorized": "Unauthorized",
  "http.forbidden": "Forbidden",
  "http.not-found": "Not Found",
  "http.method-not-allowed": "Method Not Allowed",
  "http.conflict": "Conflict",
  "http.length-required": "Length Required",
  "http.precondition-failed": "Precondition Failed",
  "http.range-not-satisfiable": "Range Not Satisfiable",
  "http.internal-error": "Internal Server Error",
  "http.not-implemented": "Not Implemented",
  "tasks.unsupported-type": "Unsupported task type: {{type}}",
};

export const french: Record<string, string> = {
  "http.bad-request": "Requête incorrecte",
  "http.unauthorized": "Authentification requise",
  "http.forbidden": "Accès interdit",
  "http.not-found": "Ressource introuvable",
  "http.method-not-allowed": "Méthode non autorisée",
  "http.conflict": "Conflit",
  "http.length-required": "Longueur requise",
  "http.precondition-failed": "Échec de la précondition",
  "http.range-not-satisfiable": "Plage demandée non satisfaisable",
  "http.internal-error": "Erreur interne du serveur",
  "http.not-implemented": "Fonction non implémentée",
  "tasks.unsupported-type": "Type de tâche non pris en charge : {{type}}",
};
