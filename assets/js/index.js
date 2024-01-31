'use strict';


function register_dropdowns(){
  const dropdowns = document.querySelectorAll(".dropdown-toggle[data-target]");
  function onDropdownToggle(){
    console.log("Toggle dropdown", this)
    const target = document.querySelector(this.dataset.target);
    if(!target) return;
    const expand = this["ariaExpanded"] !== "true";
    this["ariaExpanded"] = expand ? "true": "false";
    target.classList.toggle("show");
  }
  for(let dropdown of dropdowns){
    dropdown.addEventListener("click", onDropdownToggle);
  }
}

window.addEventListener('load', function() {
  register_dropdowns();
});