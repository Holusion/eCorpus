import { UserRoles, isUserRole } from "../../../auth/User.js";
import { AccessTypes, isAccessType } from "../../../auth/UserManager.js";

/**
 * Handlebars helper: `userLevel`
 *
 * Returns true if `level` meets or exceeds `required`. With `strict=true`,
 * returns true only on an exact match.
 *
 * Template syntax:
 *   {{userLevel user.level "admin"}}
 *   {{userLevel user.level "manage" strict=true}}
 *   {{#if (userLevel user.level "create")}}...{{/if}}
 *
 * Valid levels (ascending): none < use < create < manage < admin
 */
export function userLevel(this: any, level: any, required: any, ...args: any[]): boolean {
  const { hash, data } = args.pop();
  const normalizedLevel = level == null ? "none" : level;
  if (!isUserRole(normalizedLevel) || !isUserRole(required)) {
    console.warn(`userLevel: invalid value(s): level=${JSON.stringify(level)}, required=${JSON.stringify(required)}, template=${data?.filepath ?? "(unknown)"}`);
    return false;
  }
  if (hash?.strict) return normalizedLevel === required;
  return UserRoles.indexOf(normalizedLevel) >= UserRoles.indexOf(required);
}

/**
 * Handlebars helper: `accessLevel`
 *
 * Returns true if `level` meets or exceeds `required`. With `strict=true`,
 * returns true only on an exact match.
 *
 * Template syntax:
 *   {{accessLevel scene.access "read"}}
 *   {{accessLevel scene.access "write" strict=true}}
 *   {{#if (accessLevel scene.access "admin")}}...{{/if}}
 *
 * Valid levels (ascending): none < read < write < admin
 */
export function accessLevel(this: any, level: any, required: any, ...args: any[]): boolean {
  const { hash, data } = args.pop();
  const normalizedLevel = level == null ? "none" : level;
  if (!isAccessType(normalizedLevel) || required === null || !isAccessType(required)) {
    console.warn(`accessLevel: invalid value(s): level=${JSON.stringify(level)}, required=${JSON.stringify(required)}, template=${data?.filepath ?? "(unknown)"}`);
    return false;
  }
  if (hash?.strict) return normalizedLevel === required;
  return AccessTypes.indexOf(normalizedLevel) >= AccessTypes.indexOf(required);
}
