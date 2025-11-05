---
title: Intégration dans une page Web
rank: 8
---

Les scènes Voyager hébergées sur eCorpus peuvent être intégrées dans des sites tiers sous forme d'[iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) ou de lien [oEmbed](https://oembed.com/).



## Intégration en iframe

### Pour une scène

Vous pouvez obtenir le code d'intégration complet pour votre scène dans l'interface **Voyager** en cliquant sur le bouton "Share" <img style="display:inline-block; height: 1.4rem;border-radius: 50%; background: rgba(31,36,38,.8);padding: 4px;" alt="bouton de partage de l'interf  ace Voyager-Explorer" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 448 512'%3E%3Cpath d='M352 320c-22.608 0-43.387 7.819-59.79 20.895l-102.486-64.054a96.551 96.551 0 0 0 0-41.683l102.486-64.054C308.613 184.181 329.392 192 352 192c53.019 0 96-42.981 96-96S405.019 0 352 0s-96 42.981-96 96c0 7.158.79 14.13 2.276 20.841L155.79 180.895C139.387 167.819 118.608 160 96 160c-53.019 0-96 42.981-96 96s42.981 96 96 96c22.608 0 43.387-7.819 59.79-20.895l102.486 64.054A96.301 96.301 0 0 0 256 416c0 53.019 42.981 96 96 96s96-42.981 96-96-42.981-96-96-96z' fill='white'%3E%3C/path%3E%3C/svg%3E">.

<figure>
  <img style="display:block; max-width:100%; margin: auto" alt="Scène Voyager-Explorer où la modale de partage est ouverte, permettant de copier un code iframe pointant vers la scène" src="/assets/img/doc/embed_link.webp">
  <figcaption style="text-align:center">Lien "embed" dans une vue Voyager-Explorer</figcaption>
</figure>

Exemple de code iframe:

```html
<iframe 
  name="[TITRE]"
  src="[LIEN VERS LA VUE VOYAGER]"
  width="800"
  height="450"
  allow="xr; xr-spatial-tracking; fullscreen"
></iframe>
```

#### Paramètres

Il est possible de forcer la scène à se charger dans une langue choisie en ajoutant `?lang=`, avec le code de langue approprié (`FR`, `EN`, `NL`, etc...). Si aucun paramètre n'est fourni, la scène se chargera dans la langue par défaut.

### Pour une collection

Les collections de scènes (ou "tags") peuvent aussi être intégrées, permettant d'afficher un catalogue thématique de scènes disponibles.

Utiliser directement l'URL de la page "collection" pour l'intégrer dans un bloc iframe.


Exemple de page collection: `https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux`

Intégrée dans une iframe:
```html
<iframe 
  name="Collection Lapidaire de Notre-Dame-en-Vaux"
  src="https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux"
  width="800"
  height="450"
  allow="xr; xr-spatial-tracking; fullscreen"
></iframe>
```

Donne le résultat suivant :
<div style="display:flex; justify-content:center">
  <iframe 
    name="Collection Lapidaire de Notre-Dame-en-Vaux"
    src="https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux"
    width="800"
    height="450"
    allow="xr; xr-spatial-tracking; fullscreen"
  ></iframe>
</div>


## Intégration oEmbed

Si elle est supportée par le CMS, l'intégration **oEmbed** est plus simple et plus flexible : 

Coller simplement l'URL de la scène (ex: `https://musee-archeologienationale.ecorpus.eu/ui/scenes/Os%20peint%20azilien`) ou de la collection (ex: `https://musee-archeologienationale.ecorpus.eu/ui/tags/gaule%20romaine`) choisie dans le champ `oEmbed` de votre CMS.

<figure>
  <img style="display:block; max-width:100%; margin: auto" alt="interface de création d'un média oEmbed pointant vers une scène eCorpus dans Omeka S" src="/assets/img/doc/oEmbed Omeka.webp">
  <figcaption style="text-align:center">Création d'un média oEmbed dans <a href="https://omeka.org/s/">Omeka S</a></figcaption>
</figure>

Il peut être nécessaire de *Whitelist* le domaine de votre instance eCorpus dans la configuration de votre CMS. Un [Guide pour Omeka S](https://discourse.holusion.net/t/ajouter-des-scenes-ecorpus-en-medias-sur-omeka-s/82) est disponible à cette fin.
