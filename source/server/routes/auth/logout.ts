import { RequestHandler } from "express";
import { validateRedirect } from "../../utils/locals.js";



export const postLogout :RequestHandler = (req, res, next)=>{
  const {redirect: unsafeRedirect} = req.body;
  req.session = null;
  if(unsafeRedirect){
    try{
      res.redirect(302, validateRedirect(req, unsafeRedirect).toString());
    }catch(e){
      next(e);
    }
  }else{
    res.status(200).send({code: 200, message: "OK"});
  }
};