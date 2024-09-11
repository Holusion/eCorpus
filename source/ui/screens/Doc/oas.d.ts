export interface Openapi2 {
  openapi:    string;
  info:       Info;
  servers:    Server[];
  tags:       Tag[];
  paths:      Paths;
  components: Components;
}

export interface Components {
  parameters: Parameters;
  responses:  Responses;
  schemas:    Schemas;
}

export interface File {
  name:        string;
  in:          string;
  required:    boolean;
  schema:      AuthorClass;
  description: string;
  examples?:   Examples;
  example?:    string;
}

export interface Examples {
  folder:    Document;
  thumbnail: Document;
  document:  Document;
}

export interface Document {
  summary: string;
  value:   string;
}

export interface AuthorClass {
  type: Type;
}

export enum Type {
  Boolean = "boolean",
  Object = "object",
  String = "string",
}

export interface Responses {
  HTTPError: HTTPError;
}

export interface HTTPError {
  description: string;
  content:     HTTPErrorContent;
}

export interface HTTPErrorContent {
  "application/json": PurpleApplicationJSON;
  "text/plain":       TextPlain;
  "text/html":        TextHTML;
}

export interface PurpleApplicationJSON {
  schema: PurpleSchema;
}

export interface PurpleSchema {
  type:       Type;
  required:   string[];
  properties: SchemaProperties;
}

export interface SchemaProperties {
  code:    Code;
  message: AuthorClass;
}

export interface Code {
  description: string;
  type:        string;
  format:      string;
  minimum:     number;
  maximum:     number;
}

export interface TextHTML {
  schema: AuthorClass;
}

export interface TextPlain {
  schema: Username;
}

export interface Username {
  type:    Type;
  example: string;
}

export interface Schemas {
  Scene:      Scene;
  User:       User;
  Uid:        Uid;
  AccessType: AccessType;
}

export interface AccessType {
  type: Type;
  enum: string[];
}

export interface Scene {
  type:       Type;
  required:   string[];
  properties: SceneProperties;
}

export interface SceneProperties {
  ctime:     Time;
  mtime:     Time;
  author_id: AuthorID;
  author:    AuthorClass;
  id:        AuthorID;
  name:      AuthorClass;
  thumb:     Thumb;
  access:    Access;
}

export interface Access {
  type:       Type;
  required:   string[];
  properties: AccessProperties;
}

export interface AccessProperties {
  default: Any;
  any:     Any;
  user:    Any;
}

export interface Any {
  "$ref:\"#/components/schemas/AccessType\"": null;
}

export interface AuthorID {
  "$ref:\"#/components/schemas/Uid\"": null;
}

export interface Time {
  type:   Type;
  format: string;
}

export interface Thumb {
  type:       Type;
  desciption: string;
}

export interface Uid {
  type:        Type;
  pattern:     string;
  description: string;
}

export interface User {
  type:       Type;
  required:   string[];
  properties: UserProperties;
}

export interface UserProperties {
  uid:             UidElement;
  username:        Username;
  isAdministrator: AuthorClass;
}

export interface UidElement {
  $ref: string;
}

export interface Info {
  title:       string;
  version:     string;
  summary:     string;
  description: string;
  contact:     Contact;
  license:     License;
}

export interface Contact {
  name:  string;
  url:   string;
  email: string;
}

export interface License {
  name: string;
  url:  string;
}


export type Paths = Record<string, Path>;

export type Path = Record<Method, Operation> &{
  summary?: string,
  parameters: Parameters, 
};

export type Parameters = Parameter[]

export interface Parameter{
  name :string;
  in :"path"|"query";

  description :string;
}

export interface Operation {
  tags:         string[];
  operationId:  string;
  description:  string;
  responses?:   { [key: string]: Response };
  requestBody?: RequestBody;
}

export type Method = "get"|"post"|"put"|"delete"|"patch"|"x-mkcol"|"x-propfind"|"x-copy"|"x-move"

export interface RequestBody {
  description: string;
  required:    boolean;
  content:     RequestBodyContent;
}

export interface RequestBodyContent {
  "application/json"?:  TextHTML;
  "model/gltf-binary"?: ModelGltfBinary;
}

export interface ModelGltfBinary {
  schema: ModelGltfBinarySchema;
}

export interface ModelGltfBinarySchema {
  type:        Type;
  format:      string;
  description: string;
}

export interface Response {
  description?: string;
  content?:     ResponseContent;
  $ref?:        string;
}

export interface ResponseContent {
  "application/json": FluffyApplicationJSON;
}

export interface FluffyApplicationJSON {
  schema: FluffySchema;
}

export interface FluffySchema {
  type:  string;
  items: Items;
}

export interface Items {
  type?:       Type;
  required?:   string[];
  properties?: ItemsProperties;
  $ref?:       string;
}

export interface ItemsProperties {
  uid:      UidElement;
  username: AuthorClass;
  access:   UidElement;
}


export interface Server {
  url: string;
}

export interface Tag {
  name:        string;
  description: string;
}
