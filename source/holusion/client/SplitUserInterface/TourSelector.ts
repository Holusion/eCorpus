/**
 * 3D Foundation Project
 * Copyright 2019 Smithsonian Institution
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

import CustomElement, { customElement, property, html } from "@ff/ui/CustomElement";
import "@ff/ui/Button";

import Icon from "@ff/ui/Icon";
import { ITour } from "client/schema/setup";
import "./TourNavigator"
import { ELanguageType } from "client/schema/common";

////////////////////////////////////////////////////////////////////////////////

Icon.add("arrow-right", html`<svg xmlns="http://www.w3.org/2000/svg" height="48" viewBox="0 -960 960 960" width="48"><path d="m702-301-43-42 106-106H120v-60h646L660-615l42-42 178 178-178 178Z"/></svg>`)

@customElement("tour-selector")
export default class TourSelector extends CustomElement
{
    @property({ attribute: false })
    tours: ITour[];

    @property({ attribute: false })
    activeLanguage: ELanguageType;

    protected firstConnected()
    {
        super.firstConnected();
        this.classList.add("tour-selector");
    }

    
    protected renderEntry(tour: ITour, index: number)
    {
        return html`<div class="tour-entry section" @click=${e => this.onClickTour(e, index)}>
            <h2>${Object.keys(tour.titles).length > 0 ? tour.titles[ELanguageType[this.activeLanguage]] : tour.title}</h2>
            <p>${Object.keys(tour.titles).length > 0 ? tour.titles[ELanguageType[this.activeLanguage]] : tour.title}</p>
            <p style="text-align: right; font-weight:600;">Commencer la visite <ff-icon name="arrow-right"></ff-icon></p>
        </div>`;
    }

    protected render()
    {
        
        if (!this.tours||this.tours.length === 0) {
            return html`<div>
                <div></div>
                <div></div>
            </div>`;
        }
        return html`${this.tours.map((tour, index) => this.renderEntry(tour, index))}`;

        
    }

    protected onClickTour(e: MouseEvent, index: number)
    {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("select", {
            detail: { index }
        }));
    }
}