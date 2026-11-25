import { run } from "./exec.js";
import type { ITaskLogger } from "../tasks/types.js";

/**
 * Calls to meshtinker, which inspects, converts and optimizes glTF models.
 * Every command is run with `--json`: its report is one JSON object on stdout, even when it fails.
 *
 * @see https://github.com/Holusion/meshtinker docs/inspect-report.md for the reports' shape
 */

/** A counted warning or error of a report. `message` is in english only: `code` is stable */
export interface MeshtinkerDiagnostic {
  code: string;
  severity: "warning" | "error";
  count: number;
  message: string;
  examples: string[];
  /** For `optimize`: the step that raised it */
  step?: string;
}

export interface MeshtinkerImage {
  index: number;
  name: string | null;
  /** The file it's read from, as its uri names it. null when embedded */
  file: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
  uses: Array<{ material: number, slot: string, texture: number }>;
  occupancy: number | null;
}

/** `meshtinker inspect --json`'s report */
export interface InspectReport {
  /** Whether the files the model refers to were read: always for this report */
  data?: true;
  format: number;
  tool: { name: string, version: string };
  input: {
    byteSize: number;
    files: Array<{ role: "gltf" | "glb" | "buffer" | "image", name: string, byteSize: number }>;
  };
  extensions: { used: string[], required: string[] };
  /** null when the model has no scene */
  scene: {
    index: number;
    name: string | null;
    firstNamedRootNode: string | null;
    /** null when it can't be computed exactly, or there's no geometry */
    bounds: { min: [number, number, number], max: [number, number, number] } | null;
  } | null;
  geometry: {
    meshes: number;
    primitives: number;
    vertices: number;
    faces: number;
  };
  images: MeshtinkerImage[];
  diagnostics: MeshtinkerDiagnostic[];
}

/**
 * `meshtinker inspect --no-data --json`'s report: the model's JSON alone, without the files it refers to.
 * Only what eCorpus reads of it.
 */
export interface InspectNoDataReport {
  data: false;
  /**
   * For each file the model needs (every buffer, then every image the scene uses), the paths it is looked for at,
   * in order, relative to the model's folder. It is met by the first that exists.
   * A full read rejects the model if any is missing.
   */
  requires: string[][];
  diagnostics: MeshtinkerDiagnostic[];
}

/** `meshtinker optimize --json`'s report. Only what eCorpus reads of it */
export interface OptimizeReport {
  settings: { preset: string, quality: string };
  steps: Array<{ command: string, exitCode: number, seconds: number }>;
  input: { byteSize: number };
  output: { byteSize: number };
  seconds: number;
  diagnostics: MeshtinkerDiagnostic[];
}

/**
 * A meshtinker command that failed.
 * `exitCode` 1 means the input was rejected: the model is at fault, and `message` can be shown to whoever supplied it.
 * Anything else is about the machine, or a bug.
 */
export class MeshtinkerError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    /** The report's `error.code`, if any */
    readonly code?: string,
  ) {
    super(message);
    this.name = "MeshtinkerError";
  }

  /** Whether the model was rejected, rather than the command failing for another reason */
  get rejected() {
    return this.exitCode === 1;
  }
}

export interface MeshtinkerOptions {
  signal?: AbortSignal;
  /** Gets meshtinker's warnings, as they're printed on stderr */
  logger?: Pick<ITaskLogger, "warn" | "debug">;
}

/**
 * Run a meshtinker command with `--json` and give its report
 * @throws {MeshtinkerError} when meshtinker is missing, or the command fails
 */
export async function meshtinker<T>(command: string, args: string[], { signal, logger }: MeshtinkerOptions = {}): Promise<T> {
  let result: Awaited<ReturnType<typeof run>>;
  try {
    result = await run("meshtinker", [command, "--json", ...args], { signal });
  } catch (e: any) {
    if (e.code === "ENOENT") throw new MeshtinkerError(`meshtinker is not installed`, 127);
    throw e;
  }
  for (const line of result.stderr.split("\n").map(l => l.trim()).filter(l => l)) {
    if (/: (?:warning|error):/.test(line)) logger?.warn(line);
    else logger?.debug(line);
  }
  let report: any;
  try {
    report = JSON.parse(result.stdout);
  } catch (e) {
    const lastLine = result.stderr.trim().split("\n").at(-1);
    throw new MeshtinkerError(`meshtinker ${command} gave no report (exit code ${result.code})${lastLine ? `: ${lastLine}` : ""}`, result.code || 70);
  }
  if (result.code !== 0 || report?.error) {
    const { message = `exit code ${result.code}`, code } = report?.error ?? {};
    throw new MeshtinkerError(message, result.code || report?.error?.exitCode || 70, code);
  }
  return report as T;
}
