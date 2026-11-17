import { translateErrorMessage } from "../../i18n.js";

/**
 * Handlebars helper: `errorMessage`
 *
 * Why a task failed, from its output, in the language of the page: what a notification says of it
 * (see notifications/outcomes.ts). Empty when there's no message to tell, so that it can be tested with `#if` or `#with`.
 *
 * Template syntax:
 *   {{errorMessage output}}
 *   {{#with (errorMessage output) as |reason|}}...{{/with}}
 *
 * Uses `context.lang`, or English when it isn't set.
 *
 * @param error   A failed task's output: a serialized error (see tasks/errors.ts)
 * @param args    Handlebars options (last)
 */
export function errorMessage(this: any, error: unknown, ...args: any[]): string {
  const context = args.pop();
  if (!error || typeof error !== "object" || typeof (error as any).message !== "string") return "";
  return translateErrorMessage(error as { message: string }, context?.data?.root?.lang ?? "en");
}
