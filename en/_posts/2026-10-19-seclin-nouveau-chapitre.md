---
title: "Seclin's Archaeological Service presents its excavations at the Nouveau Chapitre"
tags: [education]
excerpt: "Preventive excavation, 3D digitisation and a touch terminal: how the City of Seclin brings almost 1,500 years of history within reach of its visitors."
server: "https://ecorpus.fr-scv.fr"
scene: "Seclin_PinceAEncens"
---

<p>
<b>To mark the opening of Seclin's new performance venue in northern France, named “Nouveau Chapitre”, a 3D mediation application reveals the city's history to visitors.</b> A look back at a project combining preventive excavation, digitisation and mediation, and at what it takes for another local authority to reproduce it.
</p>

<div class="center">
   <img class="fluid" alt="Home screen of the “Le Nouveau Chapitre, scène vivante de Seclin” application, with the entries “Remonter le temps” and “Comprendre les fouilles archéologiques”"
     src="/assets/img/post/nouveau_chapitre.jpg">
</div>

<section class="section">
    <div class="section">
        <h2>A preventive excavation in the heart of the canonical quarter</h2>
        <p>
            In 2024, construction work on the new performance venue led to a preventive archaeological excavation. The site lies in the canonical quarter of the Saint-Piat collegiate church, one of the oldest religious buildings in northern France, built over a sanctuary founded in the 7th century.
        </p>
        <p>
            Earlier excavations in this quarter and in the streets adjoining the collegiate church had already yielded remains: Early Christian burials dating from Late Antiquity and traces of medieval building sites. Buried heritage was therefore expected, which made it possible to organise the intervention before construction began.
        </p>
        <p>
            The excavation was carried out by the City's own archaeological service, part of the municipal teams. This arrangement, in which the local authority studies its own subsurface, made the rest of the project easier: the scientific results, the finds and the mediation questions stayed in the same hands, from the field through to the application.
        </p>
    </div>
</section>

<section class="section">
    <div class="section">
        <h2>An unexpected octagonal pavilion</h2>
        <p>
            The excavation revealed the foundations of an unexpected building: a large octagonal structure arranged around a central rainwater basin, in what must have been the gardens of the provost of the collegiate church.
        </p>
        <p>
            The finds confirm the prestige of the site. A finely worked copper-alloy incense tongs bearing the Gothic inscription DONA NOBIS PACEM was unearthed in 2024 on rue Jean-Jaurès, near the monumental fountain. Dated to the 16th century, it was used to handle the burning embers needed to burn incense.
        </p>
        <p>
            The whole is attributed to Jean II de Carondelet, a churchman, governor and diplomat at the court of Charles V, appointed provost of the Saint-Piat collegiate church. His provostship, between 1520 and 1545, places Seclin within the networks of the Flemish Renaissance, when the city belonged to the Burgundian Netherlands, still within the sphere of the Holy Roman Empire.
        </p>
        <p>
            Like any reconstruction, the pavilion remains a working hypothesis, built from the foundations, the basin and the finds, and not a building documented in elevation. For this reason, the application separates the tour devoted to the excavations from the one presenting the reconstruction.
        </p>
    </div>
    <div class="center">
        <img class="fluid" alt="3D reconstruction of the Renaissance octagonal pavilion, with its central basin and a human silhouette for scale"
             src="/assets/img/post/pavillon.jpg">
    </div>
</section>

<section class="section">
    <div class="section">
        <h2>From excavation to 3D collection</h2>
        <p>
            To showcase the excavation and the discoveries, the City wanted a 3D application for viewing the scans of the excavation site and the reconstruction hypotheses for the building.
        </p>
        <p>
            The project relies on eCorpus for storing and annotating the 3D scenes. Each scene can carry descriptions, annotations and illustrations, viewable in a browser without installing any software.
        </p>
        <p>
            At the same time, the archaeological material kept in the reserves was digitised by photogrammetry. These models enrich the city's digital catalogue, which brings together monuments, objects from the excavations and study documents: a panorama of almost 1,500 years of history.
        </p>
        <p>
            Each scene can be viewed independently on the 3D collections website:
        </p>
        <p>
            <a href="/en/collections/seclin/index.html">Discover the digital collection of the archaeological holdings of the city of Seclin</a>
        </p>

    {% capture scene_url %}{{page.server}}/ui/scenes/{{page.scene}}/view{% endcapture %}
    {% include voyager.html url=scene_url title="Incense tongs attributed to Jean II de Carondelet" class="h-100 larg100" %}
   </div>
</section>

<section class="section">
    <div class="section">
        <h2>A touch terminal for mediation</h2>
        <p>
            To make the 3D content accessible to visitors of the performance venue, the scenes were orchestrated into an application with simplified navigation and an interface designed for younger audiences.
        </p>
        <p>
            The application is divided into two tours. The first, “Remonter le temps” (Travel back in time), tells the city's history through excavation reports, digitised monuments and objects kept in the reserves. The second, “Comprendre les fouilles archéologiques” (Understanding the excavations), details the 2024 campaign and the reconstruction hypothesis for the octagonal pavilion, with access to the foundations and the building elements.
        </p>
        <p>
            The installation opened in the Nouveau Chapitre venue in 2026. The project receives support from the DRAC Hauts-de-France as part of the ADNI call for projects.
        </p>
    </div>
    <div class="center">
        <img class="fluid" alt="Photogrammetric 3D model of Seclin's Gothic collegiate church in the mediation application"
             src="/assets/img/post/seclin.jpg">
    </div>
</section>

<section class="section">
    <div class="section">
        <h2>Reproducing the project in your own city</h2>
        <p>
            The project can be transposed to other local authorities, provided it starts from the excavation results and involves, from the outset, the services that produce and curate the data. The steps below summarise the approach taken in Seclin.
        </p>

        <h3>1. Start from the excavation report</h3>
        <p>
            The archaeological report provides the scientific framework: chronology, plans, hypotheses. It is what separates established fact from reconstruction, and what later makes it possible to write accurate content for the public.
        </p>

        <h3>2. Document before digitising</h3>
        <p>
            A 3D model is only as good as the information that comes with it. Inventory number, dating, dimensions, place and year of discovery, description: these metadata are what make a digital collection useful, both for research and for mediation.
        </p>

        <h3>3. Digitise, and budget the post-processing</h3>
        <p>
            Photogrammetry works for buildings as well as for objects. Capture is quick, but cleaning the meshes and scaling them takes time: this step must be budgeted from the start, along with review of the models by archaeologists.
        </p>

        <h3>4. Host and annotate in a durable tool</h3>
        <p>
            The scenes are stored in eCorpus, which handles descriptions, annotations and illustrations and publishes them on the web. An open, documented tool avoids depending on a single provider for maintenance and for taking the data back.
        </p>

        <h3>5. Design the mediation before the application</h3>
        <p>
            The choice of scenes, the number of steps in a tour and the level of language are decided before development. In Seclin, the application has only two entries, the city's history and the 2024 excavations, which makes it readable within minutes by a passing visitor.
        </p>

        <h3>6. Install, train, evaluate</h3>
        <p>
            A touch terminal needs a location, a power supply, network access and maintenance. It also needs a team trained to switch it on, troubleshoot it and explain it. Early user feedback will make it possible to adjust the content and the interface.
        </p>

        <h3>Points to watch</h3>
        <p>
            Three issues come up repeatedly in this kind of project: the rights and credits for images and models, which must be stated in every record; a clear distinction between documented remains and reconstruction; and maintenance, which is often overlooked when funding is secured. In Seclin, the project received support from the DRAC Hauts-de-France under the ADNI call for projects, a lever worth identifying early by local authorities wishing to get started.
        </p>
    </div>
</section>

<section class="section">
    <div class="section">
        <p>
            Are you planning a digital project around an archaeological collection or a local heritage collection? <a href="/en/contact.html">Get in touch</a> to discuss the most suitable format together.
        </p>
    </div>
</section>
