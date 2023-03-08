# Voyager Story

## Editeur de scènes pour Voyager

<style>
  h1, h3{
    color: var(--color-primary-light)
  }
  .ff-button.ff-control{
    width: 150px;
  }
  .ff-button.ff-control.ff-disabled{
    color: white !important;
  }
  .ff-button.ff-control.ff-disabled > .ff-icon{
    fill: white !important;
  }
  .ff-button.ff-control.rounded{
    width: 40px;
    height: 40px;
    border-radius: 20px;
  }
  .inline{
    display:inline-block;
  }
  li{
    margin: 0.2rem;
    list-style: none;
  }
  li a{
    color: var(--color-light);
    text-decoration: none;
  }
  li a:hover{
    color: white;
  }
  img{
    max-width: 100%;
  }
</style>

### Edit your scene

<ul>
  <li><span class="inline"><ff-button text="Pose" icon="move" disabled></ff-button></span> Move and resize models.</li>
  <li><span class="inline"><ff-button text="Capture" icon="camera" disabled></ff-button></span> Take screenshots and capture a scene state.<li>
  <li><span class="inline"><ff-button text="Derivatives" icon="hierarchy" disabled></ff-button></span> Manager model derivatives and Levels of Detail.</li>
  <li><span class="inline"><ff-button text="Annotations" icon="comment" disabled></ff-button></span> Create and edit annotations.</li>
  <li><span class="inline"><ff-button text="Articles" icon="file" disabled></ff-button></span> Create and edit articles.</li>
  <li><span class="inline"><ff-button text="Visites" icon="globe" disabled></ff-button></span> Create and edit guided tours.</li>
  <li><span class="inline"><ff-button text="Audio" icon="audio" disabled></ff-button></span> Add and manage audio files.</li>
  <li><span class="inline"><ff-button text="Paramètres" icon="eye" disabled></ff-button></span> Edit the scene properties.</li>
</ul>

### Explore your scene

<ul>
  <li><span class="inline"><ff-button class="rounded" icon="globe" disabled></ff-button></span> Choose and start a tour.</li>
  <li><span class="inline"><ff-button class="rounded" icon="file" disabled></ff-button></span> View the articles list.</li>
  <li><span class="inline"><ff-button class="rounded" icon="comment" disabled></ff-button></span> Show and hide annotations based on their tags.</li>
  <li><span class="inline"><ff-button class="rounded" icon="share" disabled></ff-button></span> Share the scene.</li>
  <li><span class="inline"><ff-button class="rounded" icon="expand" disabled></ff-button></span> Display the scene in full screen.</li>
  <li><span class="inline"><ff-button class="rounded" icon="tools" disabled></ff-button></span> Set up the scene (environment, lighting, measurement tools...).</li>
</ul>
