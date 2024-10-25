import { LitElement, css, customElement, html, property } from "lit-element";




@customElement("tag-list")
export default class TagList extends LitElement{
  /** List of tag names to display */
  @property({attribute: false})
  tags :string[] = [];

  /** show add/remove elements */
  @property({attribute: true, reflect: true, type: Boolean})
  editable :boolean;
  
  @property({attribute: false, type: Number})
  selected :number;

  private onAdd = (e:Event)=>{
    e.preventDefault();
    e.stopPropagation();
    const target = (e.target as HTMLFormElement);
    const data = new FormData(target);
    this.dispatchEvent(new CustomEvent("add", {detail: data.get("tag")}));
    target.reset();
  }
  

  private onRemove = (e:Event)=>{
    this.dispatchEvent(new CustomEvent("remove", {detail:(e.target as HTMLButtonElement).name}));
  }

  private onClick = (index :number, ev :Event)=>{
    ev.preventDefault();
    ev.stopPropagation();
    this.dispatchEvent(new CustomEvent("click", {detail: {name: this.tags[index], index}}));
  }

  render(){
    return html`<div class="tags-list">
      ${this.tags.map((t, index)=>html`<span @click=${this.onClick.bind(this, index)} class="tag${this.selected=== index?" selected":""}">
        <span class="tag-name">${t}</span>
        ${this.editable? html`<button name=${t} class="tag-delete" @click=${this.onRemove}>×</button>`:null}
      </span>`)}
      ${this.editable? html`<form class="add-tag" @submit=${this.onAdd}>
        <input type="text" name="tag" placeholder="add tag" required minlength="1" maxlength="20">
        <input type="submit" value="✓">
      </form>`: null}
    </div>`
  }

  static styles = css`
    .tags-list{
      display: flex;
      gap: 2px;
    }

    .tag, .add-tag{
      color: white;
      padding: .125em;
      border-radius: .75em;
      border: 1px solid var(--color-secondary);
      background: var(--color-highlight);
    }
    .tag:hover, .tag.selected{
      background-color: var(--color-secondary);
    }

    .tag .tag-name{
      padding-left: .375em;
      cursor: pointer;
    }

    .tag .tag-name:last-child{
      padding-right: .375em;
    }

    .tag .tag-delete{
      display: inline;
      background-color: var(--color-highlight);
      color: white;
      border: 1px solid transparent;
      border-radius: .75em;
      padding: 1px 4.5px;
      margin: 1px;
      box-sizing: border-box;
      cursor: pointer;
      transition: background-color .1s ease;
    }

    .tag .tag-delete:hover{
      background-color: var(--color-secondary);
      border-color: var(--color-secondary-light);
    }

    .add-tag{
      position: relative;
    }

    .add-tag input{
      color: inherit;
      border: none;
      background: none;
      height: 100%;
      box-sizing: border-box;
    }

    .add-tag input:focus-visible{
      outline: none;
    }

    .add-tag input[type="text"]{
      max-width:12ch;
    }

    .add-tag input[type="submit"]{
      cursor: pointer;
      opacity: 0;
    }
    
    .add-tag:valid input[type="submit"]{
      opacity: 1;
    }

    .add-tag input[type="submit"]:hover{
      color: var(--color-success);
      background-color: var(--color-secondary); 
      border-radius: .75em;
    }
  `;
}