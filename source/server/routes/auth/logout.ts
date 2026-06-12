import { Request, Response } from "express";
import { getSession, getUserManager, validateRedirect } from "../../utils/locals.js";



export async function postLogout(req :Request, res :Response){
  const {redirect: unsafeRedirect} = req.body;
  const sid = getSession(req)?.sid;
  if(sid){
    //Revoke the server-side session: clearing the cookie alone would leave the credential usable
    await getUserManager(req).removeSessionBySid(sid);
  }
  req.session = null;
  if(unsafeRedirect){
    res.redirect(302, validateRedirect(req, unsafeRedirect).toString());
  }else{
    res.status(200).send({code: 200, message: "OK"});
  }
};
