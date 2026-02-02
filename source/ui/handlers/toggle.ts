


function controls(btn: HTMLElement): HTMLElement[]{
  return (btn as any).ariaControlsElements ?? [document.getElementById(btn.getAttribute("aria-controls"))].filter(e=>!!e)
}


function setExpanded(btn: HTMLElement, expanded: boolean){
  const elements = controls(btn);
  if(!elements.length) return console.warn("Toggle btn has no target:", btn);
  for (const target of elements){
    if(!target) return console.warn("Toggle target selector %s didn't match any element", btn.getAttribute("aria-controls"));
    target.setAttribute("aria-expanded", expanded?"true":"false");
    btn.setAttribute("aria-expanded", expanded?"true":"false");
  }
  //Store btn expansion in state if button has an ID
  if(btn.id){
    window.history.replaceState({...(window.history.state ?? {}), [btn.id]:expanded? "expanded": "collapsed"}, "", window.location.href);
  }
}

function onToggleClick(btn:HTMLElement){
  const state = btn.getAttribute("aria-expanded") == "true";
  setExpanded(btn, !state);
}

for (const btn of document.querySelectorAll<HTMLElement>('[role="button"][aria-controls], button[aria-controls]')){
  btn.addEventListener("click", onToggleClick.bind(null, btn));
  const state = window.history.state ?? {};
  let btnState :boolean;
  if(btn.id && state[btn.id]){
    btnState = state[btn.id] == "expanded";
  }else{
    btnState = btn.getAttribute("aria-expanded") == "true"
  }
  setExpanded(btn, btnState);
}