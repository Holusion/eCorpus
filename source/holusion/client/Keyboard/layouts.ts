
import { ELanguageType } from "client/schema/common";

type Key = string|{name?:string, symbol ?:string, width?:"half"|"standard"|"large"|"double"|"triple", activatable?:boolean, fixed?:boolean}
type KeyLine = Array<Key>;
type KeyMap = [KeyLine,KeyLine,KeyLine,KeyLine,KeyLine];
type KeyRecords = Record<ELanguageType, KeyMap>;
type KeyLayouts = Partial<KeyRecords> & Pick<KeyRecords, ELanguageType.EN>

const fixed = true;

const enter :Key = {width:"large", name:"enter", symbol: "↵"};
const space :Key = {width:"triple", name:"space", symbol: "↦"};
const tab :Key = {width:"large", name: "tab"};
const backspace :Key = {name:"backspace", symbol: "⇐", width: "standard"};
const altGr :Key = {name:"altGR", width: "standard", fixed: true};
const caps :Key = {name: "caps", symbol:"⇑"};

const keyLayouts :KeyLayouts = {
  [ELanguageType.EN]:[
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", backspace, {width:"half", fixed}],
    [tab, "q", "w", "e", "r", "t", "y", "u", "i", "o", "p", enter],
    [caps, "a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["done", "z", "x", "c", "v", "b", "n", "m", ", <", ". >", "/ ?"],
    [space]
  ],
  [ELanguageType.FR]: [
    [{width:"half"}, "& 1", "é 2", "\" 3", "' 4", "( 5", "- 6", "è 7", "_ 8", "ç 9", "à 0", ") °", "= +", backspace, {width:"half", fixed}],
    ["", "a", "z", "e", "r", "t", "y", "u", "i", "o", "p", "^", "$", enter],
    [caps, "q", "s", "d", "f", "g", "h", "j", "k", "l", "m","ù %", "* µ"],
    ["", "z", "x", "c", "v", "b", "n", ", ?", "; .", ": /", "! §", ""],
    [{width:"half"},{width:"large", fixed}, space, {width:"half", fixed}, altGr, {width:"half"}]
  ],
};

export default keyLayouts;