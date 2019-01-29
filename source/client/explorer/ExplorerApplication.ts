/**
 * 3D Foundation Project
 * Copyright 2018 Smithsonian Institution
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import parseUrlParameter from "@ff/browser/parseUrlParameter";

import Commander from "@ff/core/Commander";

import Registry from "@ff/graph/Registry";
import System from "@ff/graph/System";
import CPulse from "@ff/graph/components/CPulse";

import CRenderer from "@ff/scene/components/CRenderer";
import CPickSelection from "@ff/scene/components/CPickSelection";

import CVLoaders from "../core/components/CVLoaders";
import CVOrbitNavigation from "../core/components/CVOrbitNavigation";

import CVInterface from "./components/CVInterface";
import CVReader from "./components/CVReader";
import CVPresentationController from "./components/CVPresentationController";

import { componentTypes as graphComponents } from "@ff/graph/components";
import { componentTypes as sceneComponents } from "@ff/scene/components";
import { componentTypes as coreComponents } from "../core/components";
import { componentTypes as explorerComponents } from "./components";

import { nodeTypes as graphNodes } from "@ff/graph/nodes";
import { nodeTypes as sceneNodes } from "@ff/scene/nodes";
import { nodeTypes as explorerNodes } from "./nodes";

import MainView from "./ui/MainView";

////////////////////////////////////////////////////////////////////////////////

/**
 * Initial properties of the Voyager Explorer main [[ExplorerApplication]].
 */
export interface IExplorerApplicationProps
{
    /** URL of the presentation to load and display at startup. */
    presentation?: string;
    /** If an item, model or geometry URL is given, optional URL of a presentation template to use with the item. */
    template?: string;
    /** URL of the item to load and display at startup. */
    item?: string;
    /** URL of a model (supported formats: gltf, glb) to load and display at startup. */
    model?: string;
    /** URL of a geometry (supported formats: obj, ply) to load and display at startup. */
    geometry?: string;
    /** If a geometry URL is given, optional URL of a color texture to use with the geometry. */
    texture?: string;
    /** When loading a model or geometry, the quality level to set for the asset.
        Valid options: "thumb", "low", "medium", "high". */
    quality?: string;
    /** Base url to use for new items or assets. */
    base?: string;
}

/**
 * Voyager Explorer main application.
 */
export default class ExplorerApplication
{
    protected static splashMessage = [
        "Voyager - 3D Explorer and Tool Suite",
        "3D Foundation Project",
        "(c) 2018 Smithsonian Institution",
        "https://3d.si.edu"
    ].join("\n");

    readonly props: IExplorerApplicationProps;
    readonly system: System;
    readonly commander: Commander;


    constructor(element?: HTMLElement, props?: IExplorerApplicationProps)
    {
        this.props = props;
        console.log(ExplorerApplication.splashMessage);

        // register components
        const registry = new Registry();

        registry.registerComponentType(graphComponents);
        registry.registerComponentType(sceneComponents);
        registry.registerComponentType(coreComponents);
        registry.registerComponentType(explorerComponents);

        registry.registerNodeType(graphNodes);
        registry.registerNodeType(sceneNodes);
        registry.registerNodeType(explorerNodes);

        this.commander = new Commander();
        const system = this.system = new System(registry);

        const explorer = system.graph.createNode("Explorer");

        explorer.createComponent(CPulse);
        explorer.createComponent(CRenderer);
        explorer.createComponent(CPickSelection).createActions(this.commander);

        explorer.createComponent(CVLoaders);
        explorer.createComponent(CVOrbitNavigation);
        explorer.createComponent(CVInterface);
        explorer.createComponent(CVReader);

        const presentations = system.graph.createNode("Presentations");
        presentations.createComponent(CVPresentationController).createActions(this.commander);

        // create main view if not given
        if (element) {
            new MainView(this).appendTo(element);
        }

        // start rendering
        explorer.components.get(CPulse).start();

        // start loading from properties
        this.startup().catch((error: Error) => {
            console.warn("application startup failed: " + error.message);
        });
    }

    protected startup(): Promise<void>
    {
        const props = this.props;
        const controller = this.system.components.safeGet(CVPresentationController);

        props.presentation = props.presentation || parseUrlParameter("presentation") || parseUrlParameter("p");
        props.item = props.item || parseUrlParameter("item") || parseUrlParameter("i");
        props.template = props.template || parseUrlParameter("template") || parseUrlParameter("t");
        props.model = props.model || parseUrlParameter("model") || parseUrlParameter("m");
        props.geometry = props.geometry || parseUrlParameter("geometry") || parseUrlParameter("g");
        props.texture = props.texture || parseUrlParameter("texture") || parseUrlParameter("tex");
        props.quality = props.quality || parseUrlParameter("quality") || parseUrlParameter("q");
        props.base = props.base || parseUrlParameter("base") || parseUrlParameter("b");


        if (props.presentation) {
            return controller.loadPresentation(props.presentation, null, props.base);
        }
        if (props.item) {
            return controller.loadItem(props.item, props.template, props.base);
        }
        if (props.model) {
            return controller.loadModel(props.model, props.quality, props.template, props.base);
        }
        if (props.geometry) {
            return controller.loadGeometryAndTexture(
                props.geometry, props.texture, props.quality, props.template, props.base);
        }

        return Promise.resolve();
    }
}

window["VoyagerExplorer"] = ExplorerApplication;