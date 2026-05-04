export type TestOperator = "in" | "==" | "===" | "!=" | "<" | ">" | "<=" | "=<" | ">=" | "=>" | "&&" | "||";

const LOGICAL_OPS = new Set<TestOperator>(["&&", "||"]);
const COMPARISON_OPS = new Set<TestOperator>(["in", "==", "===", "!=", "<", ">", "<=", "=<", ">=", "=>"]);

function isAmbiguousChain(op1: TestOperator, op2: TestOperator): boolean {
  // Mixing &&/|| has non-standard precedence; chaining two comparisons is semantically wrong
  return (LOGICAL_OPS.has(op1) && LOGICAL_OPS.has(op2) && op1 !== op2)
    || (COMPARISON_OPS.has(op1) && COMPARISON_OPS.has(op2));
}

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
  // Chained: test a op1 b op2 c → test a op1 (test b op2 c)
  if (args.length >= 3) {
    const [op2, c, ...rest] = args;
    if (isAmbiguousChain(op, op2 as TestOperator)) {
      console.warn('Ambiguous chained test operators "%s" "%s" in %s — use subexpressions instead', op, op2, src);
    } else {
      b = test.call(this, b, op2 as TestOperator, c, ...rest);
    }
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
