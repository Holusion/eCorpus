import { randomBytes } from "crypto";

import { formatToken, hashSecret, isValidScope, makeSecret, parseToken, sceneCap, verifySecret } from "./Token.js";


describe("Token", function(){
  describe("formatToken() / parseToken()", function(){
    it("round-trips", function(){
      for(let i = 0; i < 50; i++){
        const id = i * 7919 + 1;
        const secret = makeSecret();
        const token = formatToken(id, secret);
        const parsed = parseToken(token);
        expect(parsed, token).to.be.ok;
        expect(parsed!.id, token).to.equal(id);
        expect(parsed!.secret.equals(secret), token).to.be.true;
      }
    });

    it("round-trips secrets containing the base64url underscore", function(){
      //base64url's alphabet contains "_", the same character as the token's separator:
      //parsing must not split on it
      const secret = Buffer.from("ff".repeat(32), "hex"); //0xff... → "____" prefix in base64url
      expect(secret.toString("base64url")).to.match(/^__/);
      const token = formatToken(1, secret);
      const parsed = parseToken(token);
      expect(parsed).to.be.ok;
      expect(parsed!.id).to.equal(1);
      expect(parsed!.secret.equals(secret)).to.be.true;
    });

    it("rejects malformed tokens", function(){
      const valid = formatToken(1, makeSecret());
      expect(parseToken(valid)).to.be.ok;
      for(const bad of [
        "",
        "ecorpus",
        valid.slice(1),
        valid.slice(0, -1),
        valid + "a",
        "other" + valid.slice("ecorpus".length),
        valid.replace("_", "."),
        `ecorpus_${"!".repeat(8)}_${"a".repeat(43)}`,
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
      expect(isValidScope([])).to.be.false;
      expect(isValidScope(["banana"])).to.be.false;
      //User-level names are not scopes
      expect(isValidScope(["use"])).to.be.false;
      expect(isValidScope(["admin"])).to.be.false;
      expect(isValidScope("all")).to.be.false;
    });

    it("maps a scope set to its scene-access cap", function(){
      expect(sceneCap(["all"])).to.equal("admin");
      expect(sceneCap(["scenes:admin"])).to.equal("admin");
      expect(sceneCap(["scenes:write"])).to.equal("write");
      expect(sceneCap(["scenes:read"])).to.equal("read");
      expect(sceneCap(["scenes:read", "scenes:write"])).to.equal("write");
      expect(sceneCap(["scenes:read", "all"])).to.equal("admin");
      //Grants for other route families contribute no per-scene access
      expect(sceneCap(["scenes:create"])).to.equal("none");
      expect(sceneCap(["tasks:read", "tasks:write"])).to.equal("none");
      expect(sceneCap([])).to.equal("none");
    });
  });
});
