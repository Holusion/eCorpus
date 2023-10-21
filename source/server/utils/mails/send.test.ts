
import nodemailer from "nodemailer";


import send from "./send.js";



describe("mail.send()", function(){
  let logs :[string, string[]][];
  let sender :ReturnType<typeof nodemailer.createTransport>;
  this.beforeAll(async function(){

    // @fixme could use the stream transport instead
    sender = nodemailer.createTransport({
      jsonTransport: true
    });
  });


  this.beforeEach(function(){
    //s.clear();
    logs = [];
  });

  it("send an email", async function(){
    let info:any = await send({
      to: "foo@example.com",
      subject: "Test",
      html: "<h1>Hello</h1>",
    }, sender);
    expect(info).to.have.property("message").a("string");
    let msg = JSON.parse(info.message);
    expect(msg).to.have.property("from").to.have.property("address").to.match(/^noreply@/);
    expect(msg).to.have.property("subject", "Test");
    expect(msg).to.have.property("to").to.deep.equal([{address: "foo@example.com", name: ""}]);
    expect(msg).to.have.property("html", "<h1>Hello</h1>");
  });
  it("can wrap human-readable name in TO: field", async function(){
    let info:any = await send({
      to: "Foo <foo@example.com>",
      subject: "Test",
      html: "<h1>Hello</h1>",
    }, sender);
    expect(info).to.have.property("message").a("string");
    let msg = JSON.parse(info.message);
    expect(msg).to.have.property("to").to.deep.equal([{address: "foo@example.com", name: "Foo"}]);
  });
});