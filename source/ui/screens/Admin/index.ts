import { LitElement, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';


import i18n from "../../state/translate";
import { link, route, router } from "../../state/router";
import { withUser } from "../../state/auth";

import "./AdminHome";
import "./AdminStats";
import "./AdminArchives";
import "./UsersList";
import "../../composants/navbar/NavLink";
import "../../composants/Button";

import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../../styles/common.scss';

/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("admin-panel")
export default class AdminScreen extends router( withUser( i18n(LitElement) ) ) {
  path = "/ui/admin/";

  @route()
  static "/" =()=> html`<admin-home></admin-home>`;
  @route()
  static "/users" =()=> html`<users-list></users-list>`;
  @route()
  static "/stats" =()=> html`<admin-stats></admin-stats>`;
  @route()
  static "/archives"= ()=> html`<admin-archives></admin-archives>`;


  render(){
    if(!this.user?.isAdministrator){
      return html`<h1>Error</h1><div>This page is reserved to administrators</div>`
    }
    return html`
    <div class="admin-panel">
      <nav>
          <nav-link .selected=${this.isActive("", true)} href="${this.path}"><ui-icon name="tools"></ui-icon> Home</nav-link>
          <nav-link .selected=${this.isActive("users")} href="${this.path}users"><ui-icon name="users"></ui-icon> ${this.t("ui.users")}</nav-link>
          <nav-link .selected=${this.isActive("stats")} href="${this.path}stats"><ui-icon name="stats"></ui-icon> ${this.t("ui.stats")}</nav-link>
          <nav-link .selected=${this.isActive("archives")} href="${this.path}archives"><ui-icon name="folder"></ui-icon> ${this.t("ui.archive", {plural: true})}</nav-link>
      </nav>
      <section>
        ${this.renderContent()}
      </section>
    </div>`
  }
  static styles = [styles, css`
    .admin-panel{
      display:flex;
      gap: 15px;
      padding: 1rem;
    }
    nav{
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding-bottom: 10px;
      margin-top: 75px;
    }
    section{
      width:100%;
    }
    nav > nav-link{
      font-size: 1rem;
      text-align: left;
      min-width:200px;
    }
    nav-link svg{
      fill: white;
      padding-right: 2px;
    }
    nav-link ui-icon{
      width: 1.5rem !important;
      height: 1.5rem !important;
    }

    @media (max-width: 1024px){
      .admin-panel{
        flex-direction: column;
      }
      nav{
        justify-content: center;
        margin-top:0;
        border-bottom: 1px solid #103040;
      }
    }
  `];
}