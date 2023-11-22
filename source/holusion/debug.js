


module.exports = {
  debug: process.env["DEBUG"]? console.log.bind(console, "[DEBUG]") : ()=>{}
}