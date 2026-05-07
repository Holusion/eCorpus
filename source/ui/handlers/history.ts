import { notify } from "./notify";

interface DiffPayload {
  src?: { size?: number; ctime?: string };
  dst?: { size?: number; ctime?: string };
  diff?: string;
}

function colorForLine(line: string): string {
  if (line.startsWith("-")) return "error";
  if (line.startsWith("+")) return "success";
  if (line.startsWith("\\")) return "warning";
  if (line.startsWith("@")) return "info";
  return "light";
}

function renderDiff(target: HTMLElement, payload: DiffPayload) {
  target.replaceChildren();
  if (payload.src && payload.dst && payload.src.size !== payload.dst.size) {
    const p = document.createElement("p");
    p.textContent = `Size changed from ${payload.src.size ?? 0} B to ${payload.dst.size ?? 0} B.`;
    target.appendChild(p);
  }
  if (payload.diff) {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    for (const line of payload.diff.split("\n")) {
      const span = document.createElement("span");
      span.className = `text-${colorForLine(line)}`;
      span.textContent = line + "\n";
      code.appendChild(span);
    }
    pre.appendChild(code);
    target.appendChild(pre);
  }
}

async function loadDiff(details: HTMLDetailsElement) {
  const body = details.querySelector<HTMLElement>(".history-entry-diff-body");
  if (!body || body.dataset.diffState === "loaded" || body.dataset.diffState === "loading") return;
  const scene = details.dataset.diffScene;
  const id = details.dataset.diffId;
  if (!scene || !id) return;

  body.dataset.diffState = "loading";
  try {
    const res = await fetch(`/history/${scene}/${id}/diff`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`[${res.status}]: ${res.statusText}`);
    const payload = await res.json();
    renderDiff(body, payload);
    body.dataset.diffState = "loaded";
  } catch (err: any) {
    body.dataset.diffState = "error";
    body.textContent = `Failed to load diff: ${err.message}`;
  }
}

function registerDiffLoaders() {
  for (const details of document.querySelectorAll<HTMLDetailsElement>("details.history-entry-diff[data-diff-id]")) {
    details.addEventListener("toggle", () => {
      if (details.open) loadDiff(details);
    });
  }
}

function registerRestoreForms() {
  for (const form of document.querySelectorAll<HTMLFormElement>("form.history-restore-form")) {
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      onRestore(form);
    });
  }
}

async function onRestore(form: HTMLFormElement) {
  const id = (form.elements.namedItem("id") as HTMLInputElement | null)?.value;
  const label = (form.elements.namedItem("label") as HTMLInputElement | null)?.value ?? id ?? "";
  if (!id) return;

  if (!confirm(`Restore to ${label}?`)) return;

  const closeNotification = notify(`Restoring to ${label}…`, "info", 0);
  try {
    const res = await fetch(form.action, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: parseInt(id, 10) }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`[${res.status}] ${text}`);
    }
    closeNotification();
    notify(`Scene restored to ${label}`, "success", 3000);
    window.location.reload();
  } catch (err: any) {
    closeNotification();
    notify(`Failed to restore: ${err.message}`, "error", 5000);
  }
}

registerDiffLoaders();
registerRestoreForms();
