import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import HttpError from "../state/HttpError";
import "./Spinner";


type TerminalStatus = "success" | "error";
type LiveStatus = "pending" | "initializing" | "running" | "aborting";
type Status = TerminalStatus | LiveStatus;

interface TaskShape {
  task_id: number;
  type: string;
  status: Status;
  ctime: string;
  output?: any;
}

interface LogEntry {
  task_id: number;
  level: number;
  message: string;
  ctime: string;
}

interface TaskResponse {
  task: TaskShape;
  logs: LogEntry[];
}


const POLL_INTERVAL_MS = 3000;


/**
 * Polls /tasks/:id at a slow cadence (default 3s, paused while the document
 * is hidden) and renders the task's status + the tail of its log stream.
 *
 * On a terminal status (`success` / `error`) polling stops and the page is
 * reloaded once so the server can render the final state (created scenes,
 * error messages…). The `?task=<id>` URL parameter is left in place so a
 * refresh keeps showing the result; the user dismisses it explicitly via
 * the existing close button on the upload page.
 */
@customElement("task-progress")
export default class TaskProgress extends LitElement {

  @property({type: Number, attribute: "task-id"})
  taskId: number | null = null;

  @property({type: String, attribute: "task-type"})
  taskType: string = "";

  @property({type: String, attribute: "task-status"})
  initialStatus: Status = "pending";

  @state()
  private status: Status = "pending";

  @state()
  private logs: LogEntry[] = [];

  @state()
  private error: string | null = null;

  private pollTimer: number | null = null;
  private visibilityHandler = () => {
    if (document.hidden) this.stopPolling();
    else if (!this.isTerminal()) this.scheduleNextPoll(0);
  };

  connectedCallback(): void {
    super.connectedCallback();
    this.status = this.initialStatus;
    document.addEventListener("visibilitychange", this.visibilityHandler);
    if (this.taskId != null && !this.isTerminal()) {
      this.scheduleNextPoll(0);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopPolling();
    document.removeEventListener("visibilitychange", this.visibilityHandler);
  }

  private isTerminal(s: Status = this.status): s is TerminalStatus {
    return s === "success" || s === "error";
  }

  private scheduleNextPoll(delayMs: number) {
    this.stopPolling();
    if (document.hidden) return;
    this.pollTimer = window.setTimeout(() => this.poll(), delayMs);
  }

  private stopPolling() {
    if (this.pollTimer != null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll() {
    if (this.taskId == null) return;
    try {
      const res = await fetch(`/tasks/${this.taskId}`, { headers: { "Accept": "application/json" } });
      await HttpError.okOrThrow(res);
      const body: TaskResponse = await res.json();
      this.status = body.task.status;
      this.taskType = body.task.type;
      this.logs = body.logs ?? [];
      this.error = null;

      if (this.isTerminal()) {
        // Reload so the server re-renders the upload page with the final state
        // (created scenes, archive contents, or error details).
        window.location.reload();
        return;
      }
    } catch (e: any) {
      this.error = e?.message ?? String(e);
    }
    this.scheduleNextPoll(POLL_INTERVAL_MS);
  }

  render() {
    const tail = this.logs.slice(-3);
    return html`
      <div class="task-progress">
        <div class="row">
          <spin-loader inline visible></spin-loader>
          <span class="label">${this.taskType || "task"} #${this.taskId}</span>
          <span class="status status-${this.status}">${this.status}</span>
        </div>
        ${this.error ? html`<div class="error">${this.error}</div>` : null}
        ${tail.length ? html`
          <ul class="log-tail">
            ${tail.map(l => html`<li>${l.message}</li>`)}
          </ul>
        ` : null}
      </div>
    `;
  }

  static readonly styles = [css`
    :host{
      display: block;
      flex: 1 1 auto;
    }
    .task-progress{
      display: flex;
      flex-direction: column;
      gap: .25rem;
      width: 100%;
    }
    .row{
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: .5rem;
    }
    .label{
      font-weight: bolder;
    }
    .status{
      font-size: .85em;
      opacity: .8;
      text-transform: uppercase;
    }
    .status-error{
      color: var(--color-error, #c00);
    }
    .status-success{
      color: var(--color-success, #2a2);
    }
    .log-tail{
      list-style: none;
      padding: 0 0 0 1.75rem;
      margin: 0;
      font-family: monospace;
      font-size: .8em;
      opacity: .75;
      max-height: 4.5em;
      overflow: hidden;
    }
    .log-tail li{
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .error{
      color: var(--color-error, #c00);
      font-size: .85em;
    }
  `];
}
