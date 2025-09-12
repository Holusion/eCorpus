import { Request, Response } from "express";
import sendmail from "../../../utils/mails/send.js";
import { getLocals, getUser } from "../../../utils/locals.js";
import { BadRequestError } from "../../../utils/errors.js";
import { useTemplateProperties } from "../../views/index.js";

/**
 * Send a test email
 * Exposes all possible logs from the emailer
 * This is a protected route and requires admin privileges
 */
export default async function handleRenderMail(req :Request, res :Response){
  const {name} = req.params;
  const {config} = getLocals(req);
  let {username} = req.query
  const {username:requester, email} = getUser(req) ?? {};
  if(typeof username !== "string" || !username.length){
    username = requester;
  }

  useTemplateProperties(req, res);
  const mail_content = await getLocals(req).templates.render(`emails/${name}`, {
    layout: null,
    brand: config.brand,
    hostname: config.hostname,
    name: username,
    url: "http://example.com/foo",
  });

  res.status(200).set("Content-Type", "text/html; encoding=utf-8").send(`<!DOCTYPE html><html>
    <head>
      <style type="text/css">
        html, body{
          color-scheme: light dark;
          background-color: light-dark(#eeeeee, #333333);
          pointer-events: none;
        }
      </style>
    </head>
    <body>${mail_content}</body>
  </html>`);
}