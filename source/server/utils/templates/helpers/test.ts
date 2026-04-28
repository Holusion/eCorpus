export type TestOperator = "in" | "==" | "===" | "!=" | "<" | ">" | "<=" | "=<" | ">=" | "=>" | "&&" | "||";

/**
 * Handlebars helper: `test`
 *
 * Evaluates a binary comparison and returns a boolean. Primarily useful as a
 * Handlebars **subexpression** inside `{{#if}}` or other block helpers.
 *
 * Template syntax:
 *   {{test a op b}}
 *   {{#if (test status "==" "active")}}...{{/if}}
 *   {{#if (test role "in" allowedRoles)}}...{{/if}}
 *   {{#if (test count ">=" 1)}}...{{/if}}
 *
 * Supported operators:
 *   `==`    loose equality (JS `==`)
 *   `===`   strict equality
 *   `!=`    loose inequality
 *   `<`     less than
 *   `>`     greater than
 *   `<=` / `=<`   less-than-or-equal
 *   `>=` / `=>`   greater-than-or-equal
 *   `&&`    logical AND
 *   `||`    logical OR
 *   `in`    true if `a` is in array `b`; if `b` is a scalar it is wrapped in `[b]`
 *
 * Special unary form — negation:
 *   {{test "!" value}}   →  !value
 *
 * @param a    Left-hand value
 * @param op   Operator string (see list above)
 * @param b    Right-hand value
 * @param args Remaining Handlebars arguments; options object must be last
 */
export function test(this: any, a: any, op: TestOperator, b: any, ...args: any[]): boolean {
  const options = args[args.length - 1];
  const src = options?.data?.filepath ?? "(unknown template)";
  if (typeof b === "undefined" || !args.length) {
    if (a == "!") return !op;
    console.warn("Invalid number of arguments for test helper in %s:", src, a, op, b);
    return false;
  }
  if (op === "in") return (Array.isArray(b) ? b : [b]).indexOf(a) !== -1;
  else if (op === "==") return a == b;
  else if (op === "===") return a === b;
  else if (op === "!=") return a != b;
  else if (op === "<") return a < b;
  else if (op === ">") return a > b;
  else if (op === "<=" || op === "=<") return a <= b;
  else if (op === "=>" || op === ">=") return a >= b;
  else if (op === "&&") return a && b;
  else if (op === "||") return a || b;
  else {
    console.warn('Unsupported test operator: "%s" (a=%s, b=%s) in %s', op, a, b, src);
    return false;
  }
}
