import ManipTarget from "@ff/browser/ManipTarget";
import CustomElement, {
    customElement,
    html,
} from "@ff/ui/CustomElement";

@customElement("touch-controller")
export default class TouchController extends CustomElement
{

    protected manipTarget: ManipTarget;

    constructor()
    {
        super();
    }


    protected firstConnected(): void {
        this.classList.add("touch-controller");
        this.manipTarget = new ManipTarget();

        // To catch out of frame drag releases
        this.ownerDocument.addEventListener("pointerup", this.onpointerup);
        
        this.addEventListener("pointerdown", this.manipTarget.onPointerDown);
        this.addEventListener("pointermove", this.manipTarget.onPointerMove);
        this.addEventListener("pointerup", this.manipTarget.onPointerUpOrCancel);
        this.addEventListener("pointercancel", this.manipTarget.onPointerUpOrCancel);
        this.ownerDocument.addEventListener("pointermove", this.manipTarget.onPointerMove);         // To catch out of frame drag releases
        this.ownerDocument.addEventListener("pointerup", this.manipTarget.onPointerUpOrCancel);     // To catch out of frame drag releases
        this.ownerDocument.addEventListener("pointercancel", this.manipTarget.onPointerUpOrCancel); // To catch out of frame drag releases
        this.addEventListener("wheel", this.manipTarget.onWheel);
        this.addEventListener("contextmenu", this.manipTarget.onContextMenu);
        this.addEventListener("keydown", this.manipTarget.onKeyDown);
    }

    protected disconnected(): void {
        this.ownerDocument.removeEventListener("pointerup", this.onpointerup);

        this.removeEventListener("pointerdown", this.manipTarget.onPointerDown);
        this.removeEventListener("pointermove", this.manipTarget.onPointerMove);
        this.removeEventListener("pointerup", this.manipTarget.onPointerUpOrCancel);
        this.removeEventListener("pointercancel", this.manipTarget.onPointerUpOrCancel);
        this.ownerDocument.removeEventListener("pointermove", this.manipTarget.onPointerMove);         // To catch out of frame drag releases
        this.ownerDocument.removeEventListener("pointerup", this.manipTarget.onPointerUpOrCancel);     // To catch out of frame drag releases
        this.ownerDocument.removeEventListener("pointercancel", this.manipTarget.onPointerUpOrCancel); // To catch out of frame drag releases
        this.removeEventListener("wheel", this.manipTarget.onWheel);
        this.removeEventListener("contextmenu", this.manipTarget.onContextMenu);
        this.removeEventListener("keydown", this.manipTarget.onKeyDown);

        this.manipTarget = null;
    }

    onpointerdown = (ev: PointerEvent) => {
        this.classList.add("active");
    }
    
    onpointerup = (ev: PointerEvent) => {
        this.classList.remove("active");
    }

    protected firstUpdated(_changedProperties: Map<string | number | symbol, unknown>): void {
        let view = ((this.getRootNode() as ShadowRoot).querySelector(".sv-content-view") as any)?.sceneView?.view;
        if(!view) console.warn('Could not find View in :', this.getRootNode());
        this.manipTarget.next = view;
    }

    protected render()
    {
        return html`<div class="trackpad-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                <path d="M6 12 H4 q-2 0 -2 -2 V4 q0 -2 2 -2 H20 q2 0 2 2 V10 q0 2 -2 2 H18"></path>
                <path xmlns="http://www.w3.org/2000/svg" d="m9 23c-0.9-0.4-4-4-4-4-0.1-0.6 0.3-1 0.8-1 0.8-0.3 1 8e-3 2 1l1 1 0.2-13 0.4-0.3c0.5-0.4 1-0.4 2 0.03l0.5 0.4v3c0 2 0.07 3 0.2 3 0.1 0 0.2-0.07 0.2-0.1 0-0.2 0.8-0.6 1-0.6 0.6 0 1 0.8 1 1 0 0.3 0.08 0.6 0.2 0.6 0.1 0 0.2-0.07 0.2-0.1 0-0.2 0.8-0.6 1-0.6 0.6 0 1 0.8 1 2 0 0.4 0.04 0.7 0.08 0.7 0.04 0 0.3-0.2 0.5-0.4 0.5-0.5 1-0.6 2-0.08l0.5 0.4v7l-0.5 0.4z" />
            </svg>
        </div>`;

    }
}