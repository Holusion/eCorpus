import { LitElement, TemplateResult, css, html } from 'lit';
import { customElement } from 'lit/decorators.js';


import sketch from "../assets/images/sketch_ethesaurus.png";

import i18n from "../state/translate";
import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!../styles/common.scss';
import "../composants/UserLogin"

 @customElement("landing-page")
 export default class LandingPage extends i18n(LitElement)
 {

    constructor()
    {
        super();
    }
      
    protected render() :TemplateResult {

        return html`
            <div class="landing-page">
                <div class="illustration">
                    <img src="${sketch}" alt="dessin représentant l'application voyager et son utilisation dans une borne holographique">
                    <p>${this.t("info.lead")}.</p>
                    <p style="text-align:right">
                        <a href="/ui/standalone/}">${this.t("info.useStandalone")}</a>
                    </p>
                </div>
                
                <div class="user-login">
                    <h2>${this.t("ui.login")}</h2>
                    <user-login></user-login>
                </div>
            </div>
        `
    }

    static styles = [styles, css`
    .landing-page {
        display:flex;
        flex-direction: row;
        align-items: center;
        min-height: calc(100vh - 88px - 2rem);
        flex-wrap: wrap;
    }
    .illustration{
        width:67%;
        min-width:300px;
        flex: 1 1 auto;
    }
    .user-login {
        border: 1px solid var(--color-element);
        box-shadow: 0 0 5px 0 #00000088;
        border-radius: 5px;
        width: 33%;
        padding: 1rem;
        min-width:300px;
        flex: 1 1 auto;
    }
    
    img{
        display: block;
        max-width: 100%;
        height: auto;
    }
    `];
 }