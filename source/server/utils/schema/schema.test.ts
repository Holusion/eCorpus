'use strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';


const thisDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(thisDir, "../../../");

describe("types compatibility", function(){
  describe("IDocument is compatible with IDocument from DPO-Voyager", function(){
    compare({
      file: path.join(sourceDir, "server/utils/schema/document.d.ts"),
      name: "IDocument",
    }, {
      file: path.join(sourceDir, "voyager/source/client/schema/document.ts"),
      name: "IDocument",
    });
  });
});


interface InterfaceSource{
  file: string;
  name: string;
}

interface TypeRef{
  type: ts.Type;
  declaration: ts.InterfaceDeclaration;
  prefix: string;
}

interface InternalTypeChecker extends ts.TypeChecker{
  isTypeAssignableTo(source: ts.Type, target: ts.Type):boolean;
  getElementTypeOfArrayType(array: ts.Type) :ts.Type;
}

export function compare(i1:InterfaceSource, i2:InterfaceSource):void {
  const program = ts.createProgram([i1.file, i2.file], {noEmit: true});
  const checker = program.getTypeChecker() as InternalTypeChecker;
  let diagnostics :string[]= [];
  const findInterface = (i: InterfaceSource) => {
    const sourceFile = program.getSourceFile(i.file);
    if (!sourceFile) {
      throw new Error(`Source file not found: ${i.file}`);
    }
    let found;
    ts.forEachChild(sourceFile, node => {
      if (ts.isInterfaceDeclaration(node) && node.name.text === i.name) {
        found = node;
      }
    });
    return found as ts.InterfaceDeclaration|undefined;
  };

  const interface1Decl = findInterface(i1);
  const interface2Decl = findInterface(i2);
  it("finds required interfaces", function(){
    if (!interface1Decl) {
      expect.fail(`Interface '${i1.name}' not found.`);
    }
    if (!interface2Decl) {
      expect.fail(`Interface '${i2.name}' not found.`);
    }
  })

  if(!interface1Decl || !interface2Decl) return;

  const type1 = checker.getTypeFromTypeNode(interface1Decl.name as any);
  const type2 = checker.getTypeFromTypeNode(interface2Decl.name as any);
  

  it(`forward assignable to ${prune(i2.file, i1.file)}:${i2.name}`, function(){
    if(checker.isTypeAssignableTo(type1, type2)) return;
    expect.fail(`Failed to assign from ${prune(i1.file, i2.file)}:${i1.name}:\n\t`+explain(
      checker,
      {type:type1, declaration: interface1Decl, prefix: `${i1.name}`},
      {type:type2,  declaration: interface2Decl, prefix: `${i2.name}`},
    ).join("\n\t"));
  });

  it(`backward assignable from ${prune(i2.file, i1.file)}:${i2.name}`, function(){
    if(checker.isTypeAssignableTo(type2, type1)) return;
    expect.fail(`Failed to assign to ${prune(i1.file, i2.file)}:${i1.name} :\n\t`+explain(
      checker,
      {type:type2,  declaration: interface2Decl, prefix: `${i2.name}`},
      {type:type1, declaration: interface1Decl, prefix: `${i1.name}`},
    ).join("\n\t"));
  });
}

/**
 * Explain why `to` is not assignable to `from`.
 */
function explain(checker: InternalTypeChecker, from:TypeRef, to:TypeRef):string[]{
  let diagnostics :string[] = [];
  let toProperties = to.type.getProperties();
  // First check missing properties at this level
  let props = [];
  for(let property of from.type.getProperties()){
    let toProperty = toProperties.find(p=>p.escapedName === property.escapedName)
    if( typeof toProperty === "undefined"){
      diagnostics.push(`Property ${from.prefix}.${property.getName()} is absent in target`);
      continue;
    }
    props.push([property, toProperty]);
  }

  for(let [fromProp, toProp] of props){
    const fromPropType = checker.getTypeOfSymbolAtLocation(fromProp, from.declaration);
    const toPropType = checker.getTypeOfSymbolAtLocation(toProp, to.declaration);

    if (!checker.isTypeAssignableTo(fromPropType, toPropType)) {
      if (fromPropType.flags & ts.TypeFlags.Object && toPropType.flags & ts.TypeFlags.Object) {
        //Check for arrays
        const isSourceArray = checker.isArrayType(fromPropType);
        const isTargetArray = checker.isArrayType(toPropType);
        if(isSourceArray && isTargetArray){
          //Both are arrays
          const fromElementType = checker.getElementTypeOfArrayType(fromPropType);
          const toElementType = checker.getElementTypeOfArrayType(toPropType);
          if(!checker.isTypeAssignableTo(fromElementType, toElementType)){
            diagnostics.push(...explain(
              checker,
              {type: fromElementType, declaration:from.declaration, prefix: `${from.prefix}.${fromProp.getName()}`},
              {type: toElementType, declaration:to.declaration, prefix: `${to.prefix}.${toProp.getName()}`},
            ));
          }else{
            diagnostics.push(`Unable to explain why ${from.prefix}.${fromProp.getName()} is not assignable to ${to.prefix}.${toProp.name}`)
          }
        } else if (!isSourceArray && !isTargetArray) {
          //Both are plain objects
          diagnostics.push(...explain(
            checker,
            {type: fromPropType, declaration:from.declaration, prefix: `${from.prefix}.${fromProp.getName()}`},
            {type: toPropType, declaration:to.declaration, prefix: `${to.prefix}.${toProp.getName()}`},
          ));
        }else{
          //There we need to pick up arrays like [number, number, number] that are not properly detected by isArrayType
          diagnostics.push(`Incompatible types: ${from.prefix}.${fromProp.getName()} is an ${isSourceArray?"array":"object"} but an ${isTargetArray? "array": "object"} was expected`)
        }
      }else{
        const fromPropTypeName = checker.typeToString(fromPropType);
        const toPropTypeName = checker.typeToString(toPropType);
        if(fromPropTypeName != toPropTypeName){
          diagnostics.push(`Incompatible types: ${from.prefix}.${fromProp.getName()} is a ${fromPropTypeName}but ${toPropTypeName} was expected`);
        }else if(fromPropType.isUnionOrIntersection() && toPropType.isUnionOrIntersection()){
          let missing = fromPropType.types.filter((from_t)=> toPropType.types.findIndex(to_t=> (to_t as any).value === (from_t as any).value) === -1).map(t=>(t as any).value);
          diagnostics.push(`Interface ${from.prefix}.${fromProp.getName()} is missing value${1 <missing.length? "s":""} ${missing.join(", ")} from target`);
        }else{
          diagnostics.push(`Incompatible types with same names found : ${fromPropTypeName} at ${from.prefix}.${fromProp.getName()}`);
        }
      }
    }else{
      //console.log(`${from.prefix}.${fromProp.getName()} is assignable`)
    }
  }
  return diagnostics;
}

function prune(p1:string, p2:string):string{
  let ref = p2.split("/");
  let parts = p1.split("/");
  let idx = parts.findIndex((part, idx)=> ref[idx] != part);
  return parts.slice(idx).join("/");
}