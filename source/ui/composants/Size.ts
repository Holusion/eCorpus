import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

type BinaryUnit = 'B'|'kB'|'MB'|'GB'|'TB'|'PB'|'EB'|'ZB'|'YB';
export function formatBytes(bytes: number, unit?: BinaryUnit){

  if(unit === "B" || Math.abs(bytes) < 1000) {
      return bytes + (unit?'':' B');
  }
  let units = ['kB','MB','GB','TB','PB','EB','ZB','YB'];
  let u = -1;
  do {
      bytes /= 1000;
      ++u;
  } while(unit? units[u] !== unit : Math.abs(bytes) >= 1000 && u < units.length - 1);
  return Math.round(bytes*100)/100 +  (unit? '' : ' '+units[u]);
}

export function binaryUnit(bytes: number) :BinaryUnit{
  return formatBytes(bytes).split(" ").pop() as any;
}


@customElement("b-size")
export default class Size extends LitElement{
  @property({type: Number})
  b :number;
  

  render(){
    return html`${formatBytes(this.b)}`;
  }
}