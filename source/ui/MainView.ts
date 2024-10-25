import { LitElement, html, customElement } from 'lit-element';


import styles from '!lit-css-loader?{"specifier":"lit-element"}!sass-loader!./styles/main.scss';

import "./styles/globals.scss";


import "./composants/UploadButton";
import "./composants/navbar/NavLink";
import "./composants/navbar/Navbar";
import "./composants/navbar/UserButton";
import "./composants/navbar/ChangeLocale";
import "./composants/Modal";

import "./screens/List";
import "./screens/Admin";
import "./screens/SceneHistory";
import "./screens/UserSettings";
import "./screens/Home";
import "./screens/Tags";


import Notification from "./composants/Notification";

import { updateLogin, withUser } from './state/auth';
import Modal from './composants/Modal';
import i18n from './state/translate';
import { navigate, route, router } from './state/router';


@customElement("ecorpus-main")
export default class MainView extends router(i18n(withUser(LitElement))){
  @route()
  static "/ui/" =({search})=> html`<home-page .compact=${(search as URLSearchParams).has("compact")}></home-page>`;
  @route()
  static "/ui/tags/.*" = ()=>html`<tags-screen></tags-screen>`;
  @route()
  static "/ui/scenes/" =({search: qs})=> html`<corpus-list .match=${(qs as URLSearchParams).get("search")} .compact=${(qs as URLSearchParams).has("compact")}></corpus-list>`;
  @route()
  static "/ui/user/" = ()=> html`<user-settings></user-settings>`
  @route()
  static "/ui/admin/.*" = ()=> html`<admin-panel></admin-panel>`;
  @route()
  static "/ui/scenes/:id/" = ({params}) => html`<scene-history name="${params.id}"></scene-history>`;

  connectedCallback(): void {
    super.connectedCallback();
    
    updateLogin().catch(e => {
      Modal.show({header: "Error", body: e.message});
    });
  }

  onSearch = (e:Event)=>{
    e.preventDefault();
    e.stopPropagation();
    const value = (e.target as HTMLInputElement).value;
    navigate(this,"/ui/scenes/", {search: value});
  }

  render() {

    return html`
      <corpus-navbar>
        <form class="form-item" style="display:flex; padding-right: 10px;display:flex;align-items: center" >
        <span style="height:24px;width:24px;">
            <ui-icon style="fill: var(--color-highlight);pointer-events: none;" name="search"></ui-icon>
          </span>
          <input style="height:calc(100% - 6px);margin-left:-24px; padding-left: 24px" class="search-box-input" name="search" type="search" id="model-search" @input=${this.onSearch} placeholder=${this.t("ui.searchScene")} >

        </form>
        <nav-link .selected=${this.isActive("/ui/tags/")} href="/ui/tags/">Collections</nav-link>
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
