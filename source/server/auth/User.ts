
export enum UserLevels{
  USE=1,
  CREATE=2,
  MANAGE=3,
  ADMIN=4,
};

export interface SafeUser{
  uid :number;
  level: UserLevels;
  isDefaultUser: boolean;
  username :string;
  email ?:string;
}

export interface StoredUser{
  user_id :string;
  username :string;
  email :string|undefined;
  password :string|undefined;
  level :UserLevels;
}

export default class User implements SafeUser {
  uid :number;
  level: UserLevels = UserLevels.CREATE;
  username :string;
  email ?:string|undefined;
  password :string|undefined;

  get isDefaultUser(){
    return this.uid == 0;
  }

  constructor({username, password, uid, email, level} :{
    username:string, password?:string, uid:number, email?:string, level?: UserLevels
  } ){
    this.username = username;
    this.password = password;
    this.level = level || UserLevels.CREATE;
    this.uid = uid;
    this.email = email;
  }
  static createDefault(){
    return new User({uid: 0, username: "default", password: ""});
  }
    /**
   * Make a user safe for export and public use (remove password field)
   */
  static safe(u :Partial<User> = {}) :SafeUser{
    return {
      uid: u.uid ?? 0,
      username: u.username ?? "default",
      email: u.email,
      level: u.level || UserLevels.CREATE,
      isDefaultUser: u.isDefaultUser ?? true,
    };
  }
}
