
export enum UserLevels{
  NONE=0,
  USE=1,
  CREATE=2,
  MANAGE=3,
  ADMIN=4,
};

export const UserRoles = ["none", "use", "create", "manage", "admin"] as const;
export type UserRole = typeof UserRoles[number];

export function isUserRole(s: string) :s is UserRole{
  return UserRoles.indexOf(s as any) !== -1;
}

export function isUserAtLeast(user: SafeUser, role: UserRole) {
  return UserRoles.indexOf(user.level) >= UserRoles.indexOf(role);
}

export interface SafeUser{
  uid :number;
  level: UserRole;
  username :string;
  email ?:string;
}

export interface StoredUser{
  user_id :number;
  username :string;
  email :string|undefined;
  password :string|undefined;
  level :UserLevels;
}

export default class User implements SafeUser {
  uid :number;
  level: UserRole;
  username :string;
  email ?:string|undefined;
  password :string|undefined;


  constructor({username, password, uid, email, level} :{
    username:string, password?:string, uid:number, email?:string, level?: UserRole
  } ){
    this.username = username;
    this.password = password;
    this.level = level || "create";
    this.uid = uid;
    this.email = email;
  }

    /**
   * Make a user safe for export and public use (remove password field)
   */
  static safe(u :Partial<User> = {}) :SafeUser{
    return {
      uid: u.uid ?? 0,
      username: u.username ?? "default",
      email: u.email,
      level: u.level || "none",
    };
  }
}
