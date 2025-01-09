import { LitElement, TemplateResult, html } from 'lit';
import { customElement } from 'lit/decorators.js';


import styles from '!lit-css-loader?{"specifier":"lit"}!sass-loader!./styles.scss';

import logo from "../../assets/images/logo-full.svg";

/**
 * Main UI view for the Voyager Explorer application.
 */
 @customElement("corpus-navbar")
 export default class Navbar extends LitElement
 {
  constructor()
  {
    super();
    this.part.add("navbar");
  }

  protected render() :TemplateResult {
  return html`<nav>
    <div class="brand">
      <a class="brand" href="/">
        <img src="${logo}" alt="Site Logo" />
      </a>
    </div>
    <div class="spacer"></div>
    <div class="navbar"><slot>no-content</slot></div>
  </nav>`;
  }
  static styles = [styles];
}
