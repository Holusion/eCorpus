---
title: Importation et exportation de données
---

# Gestion de vos données eCorpus

L'interopérabilité des données est l'une des fonctionnalités clés d'eCorpus.

Son expression la plus simple est que l'on peut facilement télécharger une partie ou la totalité des données d'une instance et les importer dans une autre.

C'est utile à des fins de sauvegarde, mais peut également être utilisé comme moyen de réutiliser des scènes d'une organisation à une autre.

## Extraire des données d'une instance eCorpus

### Utilisation de l'interface

Accédez à la page **collection** de votre instance eCorpus. Sélectionnez les scènes que vous souhaitez exporter et cliquez sur le bouton **Télécharger au format Zip**.


### Utilisation de l'API

```bash
curl -XGET https://${HOSTNAME}/api/v1/scenes?name=${NAME}&format=zip
```
Vous pouvez ajouter autant de paramètres `name="..."` que nécessaire, séparés par des caractères `&`.


## Importer des données dans votre instance eCorpus

### Utilisation de l'API

```bash
curl -XPOST https://${HOSTNAME}/api/v1/scenes --data-binary "@${ZIP_FILE}" | jq .
```

Cette requête retourne une liste des changement effectués qui peut être assez longue. Vous pouvez filtrer les échecs en utilisant `jq .fail` ou si vous n'avez pas `jq` installé, vous pouvez utiliser curl en mode silencieux et inspecter uniquement le status de la réponse: `curl -s --fail -o /dev/null -w "%{http_code}"`.
