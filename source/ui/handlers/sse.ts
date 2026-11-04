export interface SseFrame {
  event: string;
  data: string;
  /** A reconnection delay, in milliseconds, if this frame sets one */
  retry?: number;
}

/**
 * Splits a `text/event-stream` into frames, whatever the way it's been cut into chunks.
 * Only as much of the format as servers actually use: lines end with `\n`.
 */
export class SseParser {
  #buffer = "";

  /** @returns the frames completed by this chunk of text */
  feed(chunk: string): SseFrame[] {
    this.#buffer += chunk;
    const blocks = this.#buffer.split("\n\n");
    this.#buffer = blocks.pop()!;
    const frames: SseFrame[] = [];
    for (const block of blocks) {
      const frame = parseBlock(block);
      if (frame) frames.push(frame);
    }
    return frames;
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = "message", retry: number | undefined;
  const data: string[] = [];
  let useful = false;
  for (const line of block.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === 0) continue; //A comment. That's how the server pings.
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "retry" && /^\d+$/.test(value)) retry = parseInt(value, 10);
    else continue;
    useful = true;
  }
  return useful ? { event, data: data.join("\n"), retry } : null;
}
