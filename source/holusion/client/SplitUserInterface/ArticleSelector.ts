import CustomElement, { customElement, property, html } from "@ff/ui/CustomElement";
import "@ff/ui/Button";

import { Article } from "client/components/CVReader";


////////////////////////////////////////////////////////////////////////////////

@customElement("article-selector")
export default class ArticleSelector extends CustomElement
{
    @property({ attribute: false, type:Array })
    articles: Article[];

    protected firstConnected()
    {
        super.firstConnected();
        this.classList.add("article-selector");
    }
    
    protected renderEntry(article)
    {
        return html`<div class="article-entry section" @click=${e => this.onClickArticle(e, article.id)}>
            <h2>${article.title}</h2>
            <p>${article.lead}</p>
            <p style="text-align: right; font-weight:600;">Lire l'article <ff-icon name="arrow-right"></ff-icon></p>
        </div>`;
    }

    protected render()
    {
        return html`${this.articles.map((article, index) => this.renderEntry(article))}`;
    }

    protected onClickArticle(e: MouseEvent, id: number)
    {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent("select", {
            detail: { id: id }
        }));
    }
}