import { AccessType, AccessTypes } from "./UserManager.js";

export default class Group {
    groupUid: number;
    groupName: string;
    scenes? : {scene: string, access: AccessType}[];
    members? : string[];

    constructor({ group_name, group_id, scenes, members}: StoredGroup) {
        this.groupName = group_name;
        this.groupUid = group_id;
        if (scenes) {
        this.scenes = Object.entries(scenes).map(([s, a], i) => {return {scene: s, access: AccessTypes[a+1]}});
        }
        if (members) this.members = members;
    }
}



export interface StoredGroup{
  group_id :number;
  group_name :string;
  scenes?: Object;
  members? : string[];
}