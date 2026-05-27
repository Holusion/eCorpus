
import { debuglog } from "util";

import cookieSession from "cookie-session";
import express from "express";


import { HTTPError, UnauthorizedError } from "../utils/errors.js";
import { errorHandlerMdw, LogLevel, notFoundHandlerMdw } from "../utils/errorHandler.js";

import {AppLocals, AppParameters, getHost, getLocals, getUserManager, getVfs} from "../utils/locals.js";

import User from "../auth/User.js";
import Templates, { dicts } from "../utils/templates/index.js";


export default async function createServer(locals:AppParameters) :Promise<express.Application>{
  const templates = new Templates({dir: locals.config.get("templates_dir"), cache: locals.config.get("node_env") == "production"});

  const app = express();
  app.disable('x-powered-by');
  app.set("trust proxy", locals.config.get("trust_proxy"));


  app.locals  = Object.assign(app.locals, {
    sessionMaxAge: 31 * 24 * 60 * 60*1000, // 1 month, in milliseconds
    templates,
  }, locals) as AppLocals;

  app.use(cookieSession({
    name: 'session',
    keys: await locals.userManager.getKeys(),
    // Cookie Options
    maxAge: (app.locals as AppLocals).sessionMaxAge,
    sameSite: "lax"
  }));

  app.use("/", (req, res, next)=>{
    if(req.query.lang && (req.query.lang === "fr" || req.query.lang === "en")){
      req.session!.lang = req.query.lang;
    }
    next();
  })

  /**
   * Does authentication-related work like renewing and expiring session-cookies
   */
  app.use((req, res, next)=>{
    const {sessionMaxAge} = getLocals(req);
    const now = Date.now();
    if(req.session && !req.session.isNew){
      if(!req.session.expires || req.session.expires < now){
        req.session = null;
        return next(new UnauthorizedError(`Session Token expired. Please reauthenticate`));
      }else if(now < req.session.expires + sessionMaxAge*0.66){
        req.session.expires = now + sessionMaxAge;
      }
    }
    
    if(req.session?.uid) return next();
    
    let auth = req.get("Authorization");
    if(!auth) return next()
    else if(!auth.startsWith("Basic ") ||  auth.length <= "Basic ".length ) return next();
    let [username, password] = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf-8").split(":");
    if(!username || !password) return next();
    getUserManager(req).getUserByNamePassword(username, password).then((user)=>{
      Object.assign(
        req.session as any,
        {expires: now + sessionMaxAge},
        User.safe(user),
      );
      next();
    }, (e)=>{
      if((e as HTTPError).code === 404) next();
      else next(e);
    });
  });

  
  /* istanbul ignore next */
  if (locals.config.get("verbose") ||debuglog("http:requests").enabled) {
    let {default: morgan} = await import("morgan"); 
    //Requests logging is enabled only in dev mode as a proxy would handle it in production
    app.use(morgan(process.stdout.isTTY?"dev": "tiny", {
    }));
  }

  
  app.engine('.hbs', templates.middleware);
  app.set('view engine', '.hbs');
  app.set('views', templates.dir);


  app.get(["/"], (req, res)=> res.redirect("/ui/"));

  app.get("/robots.txt", (req, res)=>{
    const sitemap = new URL("/sitemap.xml", getHost(req)).toString();
    res.type("text/plain").set("Cache-Control", `max-age=${60*60}, public`).send(
`User-agent: *
Disallow: /auth/
Disallow: /admin/
Disallow: /ui/admin/
Disallow: /ui/user/
Disallow: /ui/groups/
Disallow: /ui/upload
Disallow: /ui/standalone
Disallow: /ui/design/
Disallow: /users/
Disallow: /groups/
Disallow: /tasks/
Disallow: /history/
Disallow: /ui/scenes/*/edit
Disallow: /ui/scenes/*/history
Disallow: /ui/scenes/*/settings
Disallow: /ui/scenes/*/tasks
Allow: /ui/scenes/

Sitemap: ${sitemap}
`);
  });

  app.get("/sitemap.xml", async (req, res, next)=>{
    try{
      const vfs = getVfs(req);
      const host = getHost(req);

      const queryLang = typeof req.query.lang === "string" ? req.query.lang : undefined;
      const lang = (queryLang && (dicts as readonly string[]).includes(queryLang))
        ? queryLang
        : (req.acceptsLanguages(dicts as unknown as string[]) || "en");
      res.vary("Accept-Language");

      const sceneUrl = (name: string, l?: string) => {
        const u = new URL(`/ui/scenes/${encodeURIComponent(name)}`, host);
        if(l) u.searchParams.set("lang", l);
        return u.toString();
      };

      res.status(200);
      res.set("Content-Type", "application/xml; charset=utf-8");
      res.set("Cache-Control", `max-age=${60*60}, public`);
      res.set("Content-Language", lang);

      // If the client disconnects mid-stream, stop iterating so the underlying
      // pg cursor's `finally` block runs and the pool connection is released.
      let aborted = false;
      res.on("close", () => { aborted = true; });

      res.write(`<?xml version="1.0" encoding="UTF-8"?>\n`);
      res.write(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`);

      for(const p of ["/ui/scenes/", "/ui/tags/"]){
        res.write(`  <url><loc>${xmlEscape(new URL(p, host).toString())}</loc></url>\n`);
      }

      for await (const {name, mtime, thumb} of vfs.streamPublicScenes()){
        if(aborted) break;
        const loc = sceneUrl(name);
        let chunk = `  <url>\n    <loc>${xmlEscape(loc)}</loc>\n`;
        if(mtime){
          chunk += `    <lastmod>${mtime.toISOString()}</lastmod>\n`;
        }
        for(const d of dicts){
          chunk += `    <xhtml:link rel="alternate" hreflang="${d}" href="${xmlEscape(sceneUrl(name, d))}"/>\n`;
        }
        chunk += `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(loc)}"/>\n`;
        if(thumb){
          const thumbUrl = new URL(`/scenes/${encodeURIComponent(name)}/${encodeURIComponent(thumb)}`, host).toString();
          chunk += `    <image:image><image:loc>${xmlEscape(thumbUrl)}</image:loc></image:image>\n`;
        }
        chunk += `  </url>\n`;
        if(!res.write(chunk)){
          // backpressure: wait for drain, but also bail out on socket close
          // so we don't sit on a half-written response and leak the DB cursor.
          await new Promise<void>(resolve => {
            const done = () => {
              res.off("drain", done);
              res.off("close", done);
              resolve();
            };
            res.once("drain", done);
            res.once("close", done);
          });
        }
      }
      if(!aborted) res.end(`</urlset>\n`);
    }catch(e){
      if(res.headersSent){
        // headers are out: bail out of the response, no XML error envelope
        res.destroy(e as Error);
        return;
      }
      next(e);
    }
  });

  function xmlEscape(s: string): string{
    return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"})[c]!);
  }

   //Ideally we would like a really long cache time for /dist but it requires unique filenames for each build
  //Allow CORS for assets that might get embedded
  app.use("/dist", (req, res, next)=>{
    res.set("Cache-Control", `max-age=${30*60}, public`);
    res.set("Access-Control-Allow-Origin", "*");
    next();
  });
  

  if(locals.config.get("assets_dir")){
    app.use("/dist", express.static(locals.config.get("assets_dir")));
  }

  // static file server
  app.use("/dist", express.static(locals.config.get("dist_dir")));

  app.use("/ui", (await import("./views/index.js")).default);

  //Privilege-protected routes
  app.use("/admin", (await import("./admin/index.js")).default);
  app.use("/auth", (await import("./auth/index.js")).default);
  app.use("/history", (await import("./history/index.js")).default);
  app.use("/scenes", (await import("./scenes/index.js")).default);
  app.use("/users", (await import("./users/index.js")).default);
  app.use("/tags", (await import("./tags/index.js")).default);
  app.use("/groups", (await import("./groups/index.js")).default);
  app.use("/services", (await import("./services/index.js")).default);
  app.use("/tasks", (await import("./tasks/index.js")).default);
  
  const logLevel = (locals.config.get("verbose") || debuglog("http:errors").enabled)?LogLevel.Verbose:LogLevel.InternalError;
  const isTTY = process.stderr.isTTY;

  // error handling
  //404: Not Found handler This should be last as it will match everything
  app.use(notFoundHandlerMdw());

  // istanbul ignore next
  //@ts-ignore
  app.use(errorHandlerMdw({isTTY, logLevel}));

  return app;
}
