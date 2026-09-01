import { randomBytes } from "crypto";

import { CONCRETE_SCOPES, expand, expandCredential, formatToken, hashSecret, isValidScope, levelScopes, makeSecret, maxFamilyScope, NON_MINTABLE_SCOPES, parseToken, PUBLIC_SCOPES, verifySecret } from "./Token.js";
import { isUserAtLeast, UserRoles } from "./User.js";


describe("Token", function(){
  describe("formatToken() / parseToken()", function(){
    it("round-trips", function(){
      for(let i = 0; i < 50; i++){
        const secret = makeSecret();
        const token = formatToken(secret);
        const parsed = parseToken(token);
        expect(parsed, token).to.be.ok;
        expect(parsed!.equals(secret), token).to.be.true;
      }
    });

    it("round-trips secrets containing the base64url underscore", function(){
      //base64url's alphabet contains "_", the same character as the token's separator:
      //parsing must not split on it
      const secret = Buffer.from("ff".repeat(32), "hex"); //0xff... → "____" prefix in base64url
      expect(secret.toString("base64url")).to.match(/^__/);
      const token = formatToken(secret);
      const parsed = parseToken(token);
      expect(parsed).to.be.ok;
      expect(parsed!.equals(secret)).to.be.true;
    });

    it("rejects malformed tokens", function(){
      const valid = formatToken(makeSecret());
      expect(parseToken(valid)).to.be.ok;
      for(const bad of [
        "",
        "ec",
        valid.slice(1),
        valid.slice(0, -1),
        valid + "a",
        "other" + valid.slice("ec".length),
        valid.replace("_", "."),
        `ec_${"!".repeat(43)}`,
      ]){
        expect(parseToken(bad), bad).to.be.null;
      }
    });
  });

  describe("hashSecret() / verifySecret()", function(){
    it("verifies a secret against its digest", function(){
      const secret = makeSecret();
      expect(verifySecret(secret, hashSecret(secret))).to.be.true;
      expect(verifySecret(makeSecret(), hashSecret(secret))).to.be.false;
    });
  });

  describe("scopes", function(){
    it("validates scope sets", function(){
      expect(isValidScope(["all"])).to.be.true;
      //The implicit baseline is redundant but requestable (pure identity token)
      expect(isValidScope(["corpus:read"])).to.be.true;
      expect(isValidScope(["scenes:read"])).to.be.true;
      expect(isValidScope(["scenes:write", "scenes:admin"])).to.be.true;
      expect(isValidScope(["corpus:write", "scenes:write"])).to.be.true;
      expect(isValidScope(["tasks:read", "tasks:write", "tasks:admin"])).to.be.true;
      //New mintable scope families
      expect(isValidScope(["users:read", "instance:read"])).to.be.true;
      expect(isValidScope(["groups:write", "account:write"])).to.be.true;
      expect(isValidScope([])).to.be.false;
      expect(isValidScope(["banana"])).to.be.false;
      //User-level names are not scopes
      expect(isValidScope(["use"])).to.be.false;
      expect(isValidScope(["admin"])).to.be.false;
      expect(isValidScope("all")).to.be.false;
      //The non-mintable top rungs must never be requestable
      expect(isValidScope(["account:admin"])).to.be.false;
      expect(isValidScope(["users:admin"])).to.be.false;
      expect(isValidScope(["instance:write"])).to.be.false;
      expect(isValidScope(["scenes:read", "account:admin"])).to.be.false;
    });

    it("maxFamilyScope(expand(s), f) is the per-resource cap a scope set implies", function(){
      const cases: Array<[string[], "none" | "read" | "write" | "admin"]> = [
        [["all"], "admin"],
        [["scenes:admin"], "admin"],
        [["scenes:write"], "write"],
        [["scenes:read"], "read"],
        [["scenes:read", "scenes:write"], "write"],
        [["scenes:read", "all"], "admin"],
        //Grants for other route families contribute no per-scene access
        [["corpus:write"], "none"],
        [["tasks:read", "tasks:write"], "none"],
        [["users:write"], "none"],
        [[], "none"],
      ];
      for(const [scope, cap] of cases){
        expect(maxFamilyScope(expand(scope), "scenes"), JSON.stringify(scope)).to.equal(cap);
      }
      //The cap is per-family: the same set reads differently off another ladder
      expect(maxFamilyScope(expand(["groups:write"]), "groups")).to.equal("write");
      expect(maxFamilyScope(expand(["groups:admin", "scenes:read"]), "groups")).to.equal("admin");
      expect(maxFamilyScope(expand(["scenes:admin"]), "groups")).to.equal("none");
    });

    it("expand() takes the downward closure of each read<write<admin ladder", function(){
      expect([...expand(["scenes:write"])].sort()).to.deep.equal(["scenes:read", "scenes:write"]);
      expect([...expand(["scenes:admin"])].sort()).to.deep.equal(["scenes:admin", "scenes:read", "scenes:write"]);
      expect([...expand(["tasks:write"])].sort()).to.deep.equal(["tasks:read", "tasks:write"]);
      expect([...expand(["tasks:admin"])].sort()).to.deep.equal(["tasks:admin", "tasks:read", "tasks:write"]);
      expect([...expand(["account:write"])].sort()).to.deep.equal(["account:read", "account:write"]);
      //corpus:write is a ladder scope like any other: it implies the baseline
      expect([...expand(["corpus:write"])].sort()).to.deep.equal(["corpus:read", "corpus:write"]);
      expect([...expand([])]).to.deep.equal([]);
    });

    it("applies the read⊆write⊆admin ladder to every family:write scope", function(){
      //The hierarchy is one universal rule, not a per-family list: any
      //`family:write` in the vocabulary must imply `family:read`.
      for(const s of CONCRETE_SCOPES){
        if(s.endsWith(":write")){
          expect([...expand([s])], s).to.include(s.replace(/:write$/, ":read"));
        }
      }
    });

    it("expand(['all']) is every mintable scope, never a non-mintable one", function(){
      const all = expand(["all"]);
      for(const s of CONCRETE_SCOPES){
        if(NON_MINTABLE_SCOPES.includes(s)) expect(all.has(s), s).to.be.false;
        else expect(all.has(s), s).to.be.true;
      }
    });

    it("anonymous PUBLIC_SCOPES is exactly scenes:read", function(){
      //In particular NOT corpus:read: the baseline separates "any identified
      //requester" from "anyone".
      expect([...PUBLIC_SCOPES]).to.deep.equal(["scenes:read"]);
    });

    it("expandCredential() adds the implicit corpus:read to any credential", function(){
      expect(expandCredential([]).has("corpus:read")).to.be.true;
      expect(expandCredential(["tasks:read"]).has("corpus:read")).to.be.true;
      //…and nothing else: the baseline grants identity, not content
      expect([...expandCredential(["tasks:read"])].sort()).to.deep.equal(["corpus:read", "tasks:read"]);
    });

    it("levelScopes() is cumulative and never grants account:admin to a token", function(){
      //Each level is a superset of the one below it. levelScopes is the raw,
      //un-expanded grant — expand() before membership-testing.
      for(let i = 1; i < UserRoles.length; i++){
        const lower = expand(levelScopes(UserRoles[i-1]));
        const higher = expand(levelScopes(UserRoles[i]));
        for(const s of lower) expect(higher.has(s), `${UserRoles[i]} ⊇ ${UserRoles[i-1]}: ${s}`).to.be.true;
      }
      //account:admin belongs to a session's authority (levelScopes) but is
      //non-mintable, so a token can never carry it (verified via isValidScope).
      expect(expand(levelScopes("use")).has("account:admin")).to.be.true;
      expect(expand(levelScopes("none")).has("account:admin")).to.be.false;
    });

    it("levelScopes() reproduces the isUserAtLeast decisions the guards used", function(){
      //Each concrete scope ⟺ the minimum level whose guard granted it.
      const table: Array<[string, typeof UserRoles[number]]> = [
        ["corpus:read", "none"],   //the "identified requester" baseline
        ["scenes:read", "none"],   //public read
        ["scenes:write", "use"],   //canWrite is ACL-gated but the scope exists from `use`
        ["scenes:admin", "use"],
        ["tasks:read", "use"],
        ["corpus:write", "create"],
        ["tasks:write", "create"],
        ["tasks:admin", "create"],
        ["groups:read", "manage"],
        ["groups:write", "manage"],
        ["groups:admin", "manage"],
        ["users:write", "admin"],
        ["users:admin", "admin"],
        ["instance:write", "admin"],
        ["account:admin", "use"],
      ];
      for(const [scope, minRole] of table){
        for(const role of UserRoles){
          const expected = isUserAtLeast({level: role} as any, minRole);
          expect(expand(levelScopes(role)).has(scope), `${role} has ${scope}?`).to.equal(expected);
        }
      }
    });
  });
});
