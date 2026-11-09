/**
 * How lines of notifications leave a list, in the bell's panel as in the page of notifications.
 * They're out of the list already, wiped away over what has taken their place:
 * clicking again where they were gets to the next one.
 */

/** How long a line takes to leave. It can't be clicked meanwhile: what took its place can. */
export const LEAVE_DURATION = 200;

/**
 * Not with reduced motion, nor when it was out of sight: then it's just gone.
 * @param li the line, out of its list
 * @param rect where it was
 * @param over where to draw it: a positioned element around where it was
 * @param visible what could be seen of where it was
 */
export function wipeAway(li: HTMLElement, rect: DOMRect, over: HTMLElement, visible: DOMRect) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (rect.bottom <= visible.top || visible.bottom <= rect.top) return;
  const origin = over.getBoundingClientRect();
  li.classList.add("leaving");
  li.inert = true;
  Object.assign(li.style, {
    top: `${rect.top - origin.top - over.clientTop}px`,
    left: `${rect.left - origin.left - over.clientLeft}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
  over.appendChild(li);
  const done = () => li.remove();
  li.animate([
    { clipPath: "inset(0 0 0 0)", opacity: 1 },
    { clipPath: "inset(0 0 0 100%)", opacity: 0 },
  ], { duration: LEAVE_DURATION, easing: "ease-in" }).finished.then(done, done);
}
