import { LitElement, html, customElement } from 'lit-element';


import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!./styles/main.scss';

import "./styles/globals.scss";


import "./composants/UploadButton";
import "./composants/navbar/NavLink";
import "./composants/navbar/Navbar";
import "./composants/navbar/UserButton";
import "./composants/navbar/ChangeLocale";
import "./screens/List";
import "./screens/Admin";
import "./screens/SceneHistory";
import "./screens/FileHistory";
import "./screens/UserSettings";
import "./screens/Home"
import "./composants/Modal";

import Notification from "./composants/Notification";

import { updateLogin, withUser } from './state/auth';
import Modal from './composants/Modal';
import i18n from './state/translate';
import { route, router } from './state/router';


@customElement("ecorpus-main")
export default class MainView extends router(i18n(withUser(LitElement))){
  @route()
  static "/ui/" =({search})=> html`<home-page .compact=${(search as URLSearchParams).has("compact")}></home-page>`;
  @route()
  static "/ui/scenes/" =({search})=> html`<corpus-list .compact=${(search as URLSearchParams).has("compact")}></corpus-list>`;
  @route()
  static "/ui/user/" = ()=> html`<user-settings></user-settings>`
  @route()
  static "/ui/admin/.*" = ()=> html`<admin-panel></admin-panel>`;
  @route()
  static "/ui/scenes/:id/" = ({parent, params}) => html`<scene-history name="${params.id}"></scene-history>`;

  connectedCallback(): void {
    super.connectedCallback();
    
    updateLogin().catch(e => {
      Modal.show({header: "Error", body: e.message});
    });
  }

  render() {

    return html`
      <corpus-navbar>
        <nav-link .selected=${this.isActive("/ui/scenes/")} href="/ui/scenes/">Collection</nav-link>
        ${(this.user?.isAdministrator)?html`<nav-link .selected=${this.isActive("/ui/admin/")} href="/ui/admin/">${this.t("ui.administration")}</nav-link>`:""}
        <div class="divider"></div>
        <user-button .selected=${this.isActive("/ui/user/")} .user=${this.user}></user-button>
      </corpus-navbar>
      <main>
        ${this.renderContent()}
      </main>
      <footer>
        <div style="margin:auto">
          <a href="https://ecorpus.eu">Project Documentation</a>
          |
          Holusion © <a href="https://github.com/Holusion/e-thesaurus/blob/main/LICENSE.md">Apache License</a>
          |
          <a href="mailto:contact@holusion.com">${this.t("ui.reportBug")}</a>
        </div>
        <change-locale style="margin:auto 4px"></change-locale>
      </footer>
      <modal-dialog></modal-dialog>
      <notification-stack></notification-stack>
    `;
  }
  static styles = [styles];
}
