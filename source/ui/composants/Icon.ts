class Icon extends HTMLElement {
  static get observedAttributes() { return ['name']; }

  connectedCallback() {
    this.classList.add('ui-icon');
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  private render() {
    const name = (this.getAttribute('name') ?? '').replace(/[^a-z0-9_-]/gi, '');
    if (!name || name === 'empty') { this.innerHTML = ''; return; }
    this.innerHTML = `<svg aria-hidden="true"><use href="/dist/images/icons.svg#icon-${name}"></use></svg>`;
  }
}

customElements.define('ui-icon', Icon);
export default Icon;
