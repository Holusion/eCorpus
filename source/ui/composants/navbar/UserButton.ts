import { LitElement, PropertyValues, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';


import "../Modal";
import Modal from "../Modal";
import "../UserLogin"
import { UserSession } from "../../state/auth";
import i18n from "../../state/translate";
import { navigate } from "../../state/router";
import NavLink from "./NavLink";

/**
 * Main UI view for the Voyager Explorer application.
 */
@customElement("user-button")
export default class UserMenu extends i18n(NavLink){
  @property()
  href = "/ui/user/";

  @property({type: Object})
  user :UserSession;
  
  constructor()
  {
      super();
  }

  connectedCallback(): void {
    super.connectedCallback();
  }

  override onClick = (ev :MouseEvent)=>{
    ev.preventDefault();
    if(this.user?.uid){
      navigate(this);
    }else{
      Modal.show({
        header: this.t("ui.login"),
        body: html`<user-login @close=${()=>Modal.close()}></user-login>`,
      });
    }
    return false;
  }

  protected shouldUpdate(changedProperties: PropertyValues)
  {
    let s = super.shouldUpdate(changedProperties);
    if(changedProperties.has("user") || changedProperties.has("language")){
      this.innerHTML = ((this.user?.uid)? this.user.username : this.t("ui.login"));
      return true;
    }
    return s;
  }
 
}