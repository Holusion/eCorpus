import { randomBytes } from "crypto";

import { CONCRETE_SCOPES, expand, formatToken, hashSecret, isValidScope, levelScopes, makeSecret, maxSceneScope, parseToken, PUBLIC_SCOPES, verifySecret } from "./Token.js";
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
        "ecorpus",
        valid.slice(1),
        valid.slice(0, -1),
        valid + "a",
        "other" + valid.slice("ecorpus".length),
        valid.replace("_", "."),
        `ecorpus_${"!".repeat(43)}`,
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
      expect(isValidScope(["scenes:read"])).to.be.true;
      expect(isValidScope(["scenes:write", "scenes:admin"])).to.be.true;
      expect(isValidScope(["scenes:create", "scenes:write"])).to.be.true;
      expect(isValidScope(["tasks:read", "tasks:write"])).to.be.true;
      //New mintable scope families
      expect(isValidScope(["users:read", "admin:write"])).to.be.true;
      expect(isValidScope(["groups:write", "account:write"])).to.be.true;
      expect(isValidScope([])).to.be.false;
      expect(isValidScope(["banana"])).to.be.false;
      //User-level names are not scopes
      expect(isValidScope(["use"])).to.be.false;
      expect(isValidScope(["admin"])).to.be.false;
      expect(isValidScope("all")).to.be.false;
      //account:grant is non-mintable: it must never be requestable
      expect(isValidScope(["account:grant"])).to.be.false;
      expect(isValidScope(["scenes:read", "account:grant"])).to.be.false;
    });

    it("maxSceneScope(expand(s)) is the scene-access cap a scope set implies", function(){
      const cases: Array<[string[], "none" | "read" | "write" | "admin"]> = [
        [["all"], "admin"],
        [["scenes:admin"], "admin"],
        [["scenes:write"], "write"],
        [["scenes:read"], "read"],
        [["scenes:read", "scenes:write"], "write"],
        [["scenes:read", "all"], "admin"],
        //Grants for other route families contribute no per-scene access
        [["scenes:create"], "none"],
        [["tasks:read", "tasks:write"], "none"],
        [["users:write"], "none"],
        [[], "none"],
      ];
      for(const [scope, cap] of cases){
        expect(maxSceneScope(expand(scope)), JSON.stringify(scope)).to.equal(cap);
      }
    });

    it("expand() takes the downward closure of each read<write<admin ladder", function(){
      expect([...expand(["scenes:write"])].sort()).to.deep.equal(["scenes:read", "scenes:write"]);
      expect([...expand(["scenes:admin"])].sort()).to.deep.equal(["scenes:admin", "scenes:read", "scenes:write"]);
      expect([...expand(["tasks:write"])].sort()).to.deep.equal(["tasks:read", "tasks:write"]);
      expect([...expand(["account:write"])].sort()).to.deep.equal(["account:read", "account:write"]);
      //orthogonal grant: no implication
      expect([...expand(["scenes:create"])]).to.deep.equal(["scenes:create"]);
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

    it("expand(['all']) is every mintable scope, never account:grant", function(){
      const all = expand(["all"]);
      for(const s of CONCRETE_SCOPES){
        if(s === "account:grant") expect(all.has(s), s).to.be.false;
        else expect(all.has(s), s).to.be.true;
      }
    });

    it("anonymous PUBLIC_SCOPES is exactly scenes:read", function(){
      expect([...PUBLIC_SCOPES]).to.deep.equal(["scenes:read"]);
    });

    it("levelScopes() is cumulative and never grants account:grant to a token", function(){
      //Each level is a superset of the one below it. levelScopes is the raw,
      //un-expanded grant — expand() before membership-testing.
      for(let i = 1; i < UserRoles.length; i++){
        const lower = expand(levelScopes(UserRoles[i-1]));
        const higher = expand(levelScopes(UserRoles[i]));
        for(const s of lower) expect(higher.has(s), `${UserRoles[i]} ⊇ ${UserRoles[i-1]}: ${s}`).to.be.true;
      }
      //account:grant belongs to a session's authority (levelScopes) but is
      //non-mintable, so a token can never carry it (verified via isValidScope).
      expect(expand(levelScopes("use")).has("account:grant")).to.be.true;
      expect(expand(levelScopes("none")).has("account:grant")).to.be.false;
    });

    it("levelScopes() reproduces the isUserAtLeast decisions the guards used", function(){
      //Each capability ⟺ the minimum level whose guard granted it.
      const table: Array<[string, typeof UserRoles[number]]> = [
        ["scenes:read", "none"],   //public read
        ["scenes:write", "use"],   //canWrite is ACL-gated but the capability exists from `use`
        ["scenes:admin", "use"],
        ["tasks:read", "use"],
        ["scenes:create", "create"],
        ["tasks:write", "create"],
        ["groups:write", "manage"],
        ["users:write", "admin"],
        ["admin:write", "admin"],
        ["account:grant", "use"],
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
