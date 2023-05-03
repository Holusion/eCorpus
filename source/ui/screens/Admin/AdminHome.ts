
import { customElement, property, html, TemplateResult, LitElement, css } from "lit-element";

import "@ff/ui/Button";

import "./UsersList";
import i18n from "../../state/translate";
import Notification from "@ff/ui/Notification";


/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("admin-home")
export default class AdminHomeScreen extends i18n(LitElement) {

  createRenderRoot() {
      return this;
  }
  
  protected render(): unknown {
    return html`
      <h2>${this.t("ui.adminSection")}</h2>

      <div class="section">
        <h3>${this.t("ui.tools")}</h3>
          <ul>
              <li>
                  <a  download href="/api/v1/scenes?format=zip">${this.t("ui.downloadZip")}</a>
              </li>
          </ul>
      </div>
    `;
  }
}