/**
 * FF Typescript Foundation Library
 * Copyright 2019 Ralph Wiedemeier, Frame Factory GmbH
 *
 * License: MIT
 */

import "./Icon";

import { customElement, property, html, PropertyValues, LitElement } from "lit-element";


////////////////////////////////////////////////////////////////////////////////

/**
 * Emitted by [[Button]] if clicked.
 * @event
 */
export interface IButtonClickEvent extends MouseEvent
{
    type: "click";
    target: Button;
}

export interface IButtonKeyboardEvent extends KeyboardEvent
{
    type: "click";
    target: Button;
}

/**
 * Custom element displaying a button with a text and/or an icon.
 */
@customElement("ui-button")
export default class Button extends LitElement
{
    /** Optional name to identify the button. */
    @property({ type: String })
    name = "";

    @property({ type: Boolean })
    disabled = false;

    /** Optional text to be displayed on the button. */
    @property()
    text: string;

    /** Optional name of the icon to be displayed on the button. */
    @property()
    icon = "";

    /** Optional role - defaults to 'button'. */
    @property()
    role = "button";

    /** If true, displays a downward facing triangle at the right side. */
    @property({ type: Boolean })
    caret = false;

    @property({ type: Boolean })
    inline = false;

    @property({ type: Boolean })
    transparent = false;

    createRenderRoot() {
        return this;
    }


    public connectedCallback()
    {
        super.connectedCallback();
        this.setAttribute("role", this.role);
        this.classList.add("btn");
    }

    protected render()
    {
        return html`${this.renderIcon()}${this.renderText()}${this.renderCaret()}`;
    }

    protected renderIcon()
    {
        return this.icon ? html`<ui-icon name=${this.icon}></ui-icon>` : null;
    }

    protected renderText()
    {
        return this.text ? html`<div class="btn-text">${this.text}</div>` : null;
    }

    protected renderCaret()
    {
        return this.caret ? html`<div class="btn-caret-down"></div>` : null;
    }
}
