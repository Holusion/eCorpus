'use strict';


function register_dropdowns(){
  const dropdowns = document.querySelectorAll(".dropdown-toggle[data-target], .navbar-toggle[data-target]");
  function onDropdownToggle(e){
    const target = document.querySelector(this.dataset.target);
    if(!target) return console.warn("Dropdown has no valid target", this);
    e.preventDefault();
    const expand = this["ariaExpanded"] !== "true";
    this["ariaExpanded"] = expand ? "true": "false";
    target.classList.toggle("show");
  }
  for(let dropdown of dropdowns){
    dropdown.addEventListener("click", onDropdownToggle);
  }
}

/**
 * Highlights the entry of a left sidebar nav (built by the `section_nav`
 * filter) matching the section currently in view.
 */
function register_section_nav(){
  const nav = document.querySelector(".nav-doc.nav-left .section-nav");
  if(!nav) return;

  const items = Array.from(nav.querySelectorAll("a.list-group-leaf[href^='#']"))
    .map(a => {
      const el = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1)));
      return el && { li: a.closest("li"), el };
    })
    .filter(Boolean);
  if(!items.length) return;

  const offset = () => (document.getElementById("navbar-top")?.offsetHeight || 50) + 24;
  let ticking = false;

  function update(){
    ticking = false;
    let active = items[0];
    for(const item of items){
      if(item.el.getBoundingClientRect().top <= offset()) active = item;
    }
    for(const item of items){
      item.li.classList.toggle("current", item === active);
    }
  }

  function schedule(){
    if(ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }

  // Smooth, short scroll to a section. Duration grows slightly with the
  // distance (280 ms to 650 ms) so long and short jumps feel consistent, and
  // any manual scroll immediately takes over the animation.
  const SCROLL_MIN_MS = 280;
  const SCROLL_MAX_MS = 650;

  function smoothScrollTo(target){
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    const startY = window.scrollY;
    const distance = target.getBoundingClientRect().top + startY - margin - startY;
    if(Math.abs(distance) < 2) return;

    const duration = Math.min(SCROLL_MAX_MS, Math.max(SCROLL_MIN_MS, 220 + Math.abs(distance) * 0.06));
    let cancelled = false;

    const cancel = () => { cancelled = true; };
    const opts = { passive: true };
    window.addEventListener("wheel", cancel, opts);
    window.addEventListener("touchstart", cancel, opts);
    window.addEventListener("keydown", cancel, opts);

    function cleanup(){
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("keydown", cancel);
    }

    const t0 = performance.now();
    function step(now){
      if(cancelled) return cleanup();
      const p = Math.min(1, (now - t0) / duration);
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      window.scrollTo(0, startY + distance * eased);
      if(p < 1) requestAnimationFrame(step);
      else cleanup();
    }
    requestAnimationFrame(step);
  }

  function onNavClick(e){
    const href = this.getAttribute("href");
    if(!href || href.charAt(0) !== "#") return;
    const target = document.getElementById(decodeURIComponent(href.slice(1)));
    if(!target) return;

    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduce) target.scrollIntoView({ behavior: "auto", block: "start" });
    else smoothScrollTo(target);

    // Keep the URL shareable, but without a second, instant jump.
    if(window.history && history.pushState) history.pushState(null, "", href);
    else window.location.hash = href;
  }

  for(const item of items){
    const link = item.li.querySelector("a.list-group-leaf");
    if(link) link.addEventListener("click", onNavClick);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("hashchange", schedule);
  update();
}

window.addEventListener('load', function() {
  register_dropdowns();
  register_section_nav();
});