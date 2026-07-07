---
title: Embedding in a Web page
rank: 8
---

Voyager scenes hosted on eCorpus can be embedded into third-party sites as an [iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) or an [oEmbed](https://oembed.com/) link.



## Embedding with an iframe

### For a scene

You can obtain the complete embed code for your scene in the **Voyager** interface by clicking the "Share" button <img style="display:inline-block; height: 1.4rem;border-radius: 50%; background: rgba(31,36,38,.8);padding: 4px;" alt="share button of the Voyager-Explorer interface" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 448 512'%3E%3Cpath d='M352 320c-22.608 0-43.387 7.819-59.79 20.895l-102.486-64.054a96.551 96.551 0 0 0 0-41.683l102.486-64.054C308.613 184.181 329.392 192 352 192c53.019 0 96-42.981 96-96S405.019 0 352 0s-96 42.981-96 96c0 7.158.79 14.13 2.276 20.841L155.79 180.895C139.387 167.819 118.608 160 96 160c-53.019 0-96 42.981-96 96s42.981 96 96 96c22.608 0 43.387-7.819 59.79-20.895l102.486 64.054A96.301 96.301 0 0 0 256 416c0 53.019 42.981 96 96 96s96-42.981 96-96-42.981-96-96-96z' fill='white'%3E%3C/path%3E%3C/svg%3E">.

<figure>
  <img style="display:block; max-width:100%; margin: auto" alt="Voyager-Explorer scene with the share modal open, allowing you to copy an iframe code pointing to the scene" src="/assets/img/doc/embed_link.webp">
  <figcaption style="text-align:center">The "embed" link in a Voyager-Explorer view</figcaption>
</figure>

Example iframe code:

```html
<iframe 
  name="[TITRE]"
  src="[LIEN VERS LA VUE VOYAGER]"
  width="800"
  height="450"
  allow="xr; xr-spatial-tracking; fullscreen"
></iframe>
```

#### Parameters

You can force the scene to load in a chosen language by adding `?lang=`, followed by the appropriate language code (`FR`, `EN`, `NL`, etc.). If no parameter is provided, the scene will load in the default language.

### For a collection

Scene collections (or "tags") can also be embedded, allowing you to display a thematic catalog of available scenes.

Simply use the URL of the "collection" page to embed it in an iframe block.


Example of a collection page: `https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux`

Embedded in an iframe:
```html
<iframe 
  name="Collection Lapidaire de Notre-Dame-en-Vaux"
  src="https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux"
  width="800"
  height="450"
  allow="xr; xr-spatial-tracking; fullscreen"
></iframe>
```

Which gives the following result:
<div style="display:flex; justify-content:center">
  <iframe 
    name="Collection Lapidaire de Notre-Dame-en-Vaux"
    src="https://ecorpus.holusion.com/ui/tags/notre-dame-en-vaux"
    width="800"
    height="450"
    allow="xr; xr-spatial-tracking; fullscreen"
  ></iframe>
</div>


## oEmbed embedding

If it is supported by your CMS, **oEmbed** embedding is simpler and more flexible:

Simply paste the URL of the chosen scene (e.g. `https://musee-archeologienationale.ecorpus.eu/ui/scenes/Os%20peint%20azilien`) or collection (e.g. `https://musee-archeologienationale.ecorpus.eu/ui/tags/gaule%20romaine`) into the `oEmbed` field of your CMS.

<figure>
  <img style="display:block; max-width:100%; margin: auto" alt="interface for creating an oEmbed media pointing to an eCorpus scene in Omeka S" src="/assets/img/doc/oEmbed Omeka.webp">
  <figcaption style="text-align:center">Creating an oEmbed media in <a href="https://omeka.org/s/">Omeka S</a></figcaption>
</figure>

You may need to *whitelist* the domain of your eCorpus instance in your CMS configuration. A [Guide for Omeka S](https://discourse.holusion.net/t/ajouter-des-scenes-ecorpus-en-medias-sur-omeka-s/82) is available for this purpose.
