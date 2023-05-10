import DocumentView, { customElement, property, html } from "client/ui/explorer/DocumentView";
import { unsafeHTML } from "lit-html/directives/unsafe-html";
import "@ff/ui/Button";

import CVReader from "client/components/CVReader";
import CVDocument from "client/components/CVDocument";
import CVLanguageManager from "client/components/CVLanguageManager";


////////////////////////////////////////////////////////////////////////////////

@customElement("article-navigator")
export default class ArticleNavigator extends DocumentView
{
    protected reader :CVReader;
    protected language :CVLanguageManager;

    protected firstConnected()
    {
        super.firstConnected();
        this.classList.add("article-navigator");
    }
    
    protected render()
    {
        const articles = this.reader.articles;
        const article = this.reader.activeArticle;
        let articleContent = this.reader.outs.content.value ;
        if(!article){
            return html`<article-selector .articles=${articles.map(a=>a.article)} @select=${this.onSelectArticle}></article-selector>`;
        }
        return html`<ff-button class="tour-return"  @click=${this.onClickExit} icon="close"></ff-button>
        <div class="article-info">
            <h1 class="article-title">${article.title}</h1>
            <div class="article-content">${unsafeHTML(articleContent)}</div>
        </div>`;
    }

    onSelectArticle = (ev:CustomEvent)=>{
        this.reader.ins.articleId.setValue(ev.detail.id)
    }

    protected onClickExit()
    {
        this.reader.ins.articleId.setValue(null)
    }

    
    protected onActiveDocument(previous: CVDocument, next: CVDocument)
    {
        if (previous) {
            this.reader.outs.article.off("value", this.onUpdate, this);
            this.language.outs.language.off("value", this.onUpdate, this);
            this.reader.outs.content.off("value", this.onUpdate, this);
        }
        if (next) {
            this.reader = next.setup.reader;
            this.language = next.setup.language;
            this.reader.outs.article.on("value", this.onUpdate, this);
            this.reader.outs.content.on("value", this.onUpdate, this);
            this.language.outs.language.on("value", this.onUpdate, this);
        }

        this.requestUpdate();
    }
}