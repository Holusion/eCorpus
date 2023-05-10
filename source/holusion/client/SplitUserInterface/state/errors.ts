
export class HTTPError extends Error{
  constructor(public code:number, message :string){
      super(message);
  }
  static async fromResponse(res :Response){
    let body = null;
    if(res.headers.get("Content-Type")?.startsWith("application/json")){
      body = await res.json();
    }
    return new HTTPError(res.status, body?.message ?? `[${res.status}]: ${await res.text()}`);
  }
}