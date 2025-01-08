import {randomBytes, randomInt} from "crypto";


const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
//String to binary lookup table
const s2b = new Array(alphabet.length);
for (let i = 0; i < alphabet.length; i++) {
  s2b[alphabet.charCodeAt(i)] = i;
}
/**
 * Creates a, encoded globally unique identifier with a default length of 12 characters.
 * The identifier only uses letters and digits and can safely be used for file names.
 * this is NOT a proper base 56 encoding.
 * It can be used in place of [@ff-core.uniqueId()](https://github.com/Smithsonian/blob/master/ff-core/source/uniqueId.ts) where necessary,
 * though it does not use the same aplphabet.
 * [source inspiration](https://codegolf.stackexchange.com/questions/1620/arbitrary-base-conversion/21672#21672)
 * 
 * @param length Number of characters in the identifier.
 * @returns Globally unique identifier
 * 
 */
 export default function uid(size :number = 12) :string{
  let id = "";
  for(let i = 0; i < size; i++){
    id += alphabet[randomInt(0, alphabet.length)];
  }
  return id;
}

export class Uid{
  /**
   * generate a random number that is a safe 48bit uint
   */
  static make() :number{
    return randomBytes(6).readUIntLE(0,6);
  }
  /**
   * maps an unsigned integer ID to a base64url string
   */
  static toString(n :number) :string{
    if(n < 0 || !Number.isSafeInteger(n)) throw new Error(`Bad ID : ${n} is not a safe positive integer`);
    let b = Buffer.alloc(6);
    b.writeUintBE(n, 0, 6);
    return b.toString("base64url");
  }
  /**
   * maps a base64url encoded ID to an uint
   */
  static toNumber(str :string) :number{
    let b = Buffer.from(str, "base64url");
    if(b.length != 6) throw new Error(`Bad ID : ${str} is not a valid base64 encoded ID`);
    return b.readUintBE(0,6);
  }
}