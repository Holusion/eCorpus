import { once } from "node:events";
import { createConnection } from "node:net";

let port = process.env["PORT"]? parseInt(process.env["PORT"]) : 8000;
if(!Number.isInteger(port)){
  console.error("Invalid port number : "+port);
  process.exit(1);
}



const client = createConnection({
  port,
  timeout: 2000,
});

once(client, "connect").then(()=>{
  client.destroy()
}, (e)=>{
  console.error(e.message);
  process.exit(1);
});