/**
 * Simple health check script to mark a container as healthy when the server starts listening
 * with no additional dependencies
 * 
 * Call this with nodejs, like:
 * ```bash
 *    node "server/healthcheck.js"
 * ```
 */
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