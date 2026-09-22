import { useEffect, useRef, type RefObject } from "react";
import { animate as animateMini } from "motion/mini";
import { animate, press, stagger } from "motion";
import { FORGE_SCROLL_TRAVEL, forgeScrollUnit } from "./parallax";
import { viewDirection } from "./verbs";

export { FORGE_SCROLL_TRAVEL, forgeScrollUnit } from "./parallax";
export { viewDirection } from "./verbs";

const spring = { type: "spring" as const, stiffness: 420, damping: 48, mass: 0.7 };

let motionPreference: "system" | "off" = "system";
const running = new Set<{ stop?: () => void; finished?: Promise<unknown>; els: Element[] }>();

function rest(el: Element | null) {
  if (!el || !(el instanceof HTMLElement)) return;
  el.style.opacity = "";
  el.style.transform = "";
}

function track(run: { stop?: () => void; finished?: Promise<unknown> } | void, els: Element[]) {
  if (!run) return;
  const job = { stop: run.stop, finished: run.finished, els };
  running.add(job);
  const done = () => {
    running.delete(job);
    els.forEach((item) => rest(item));
  };
  void run.finished?.then(done, done);
}

function cutMotion() {
  for (const job of running) {
    job.stop?.();
    job.els.forEach((item) => rest(item));
  }
  running.clear();
}

export function setMotionPreference(mode: "system" | "off"): void {
  motionPreference = mode;
  if (prefersReduced()) cutMotion();
}

export function prefersReduced(): boolean {
  if (motionPreference === "off") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function riseChildren(root: Element | null, selector = "[data-rise]"): void {
  if (!root || prefersReduced()) {
    root?.querySelectorAll(selector).forEach((item) => rest(item));
    return;
  }
  const items = ([...root.querySelectorAll(selector)] as HTMLElement[]).slice(0, 16);
  if (!items.length) return;
  const run = animateMini(
    items,
    { opacity: [0, 1], transform: ["translateY(4px)", "translateY(0px)"] },
    { delay: stagger(0.012, { startDelay: 0.02 }), duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  );
  track(run, items);
}

export function popIn(el: Element | null): void {
  if (!el || prefersReduced()) {
    rest(el);
    return;
  }
  track(
    animateMini(el as HTMLElement, { opacity: [0, 1], transform: ["scale(0.98)", "none"] }, { duration: 0.18, ease: [0.22, 1, 0.36, 1] }),
    [el],
  );
}

export function fadePane(el: Element | null): void {
  if (!el || prefersReduced()) {
    rest(el);
    return;
  }
  track(
    animateMini(el as HTMLElement, { opacity: [0, 1], transform: ["translateY(2px)", "none"] }, { duration: 0.16, ease: [0.22, 1, 0.36, 1] }),
    [el],
  );
}

export function fadeScene(el: Element | null, dir: -1 | 0 | 1): void {
  if (!el || prefersReduced() || dir === 0) {
    rest(el);
    return;
  }
  const x = dir * 8;
  track(
    animateMini(
      el as HTMLElement,
      { opacity: [0.01, 1], transform: [`translateX(${x}px)`, "none"] },
      { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
    ),
    [el],
  );
}

export function receivePane(el: Element | null): void {
  if (!el || prefersReduced()) {
    rest(el);
    return;
  }
  el.classList.add("is-receiving");
  const shell = el.querySelector(".pane-shell") || el;
  track(
    animateMini(shell, { opacity: [0.72, 1], transform: ["translateX(6px)", "none"] }, { duration: 0.2, ease: [0.22, 1, 0.36, 1] }),
    [shell],
  );
  window.setTimeout(() => el.classList.remove("is-receiving"), 280);
}

export function bindChrome(root: Element | null): () => void {
  if (!root || prefersReduced()) return () => {};
  const pressable = root.querySelectorAll(".primary, .seg button, .consent button, .gauge, .step, .filters button, .tabs button, .sliders, .ghost, .add");
  const stopPress = press(pressable, (element) => {
    animate(element, { transform: "scale(0.985)" }, { duration: 0.08 });
    return () => {
      const back = animate(element, { transform: "none" }, spring);
      void back.finished.then(() => rest(element));
    };
  });
  return () => {
    stopPress();
  };
}

export function useRise<T extends HTMLElement>(deps: unknown[]): RefObject<T | null> {
  const ref = useRef<T>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      return;
    }
    riseChildren(ref.current);
  }, deps);
  return ref;
}

export function useChromeMotion(root: RefObject<HTMLElement | null>, deps: unknown[]): void {
  useEffect(() => bindChrome(root.current), deps);
}

export function usePop<T extends HTMLElement>(active: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (active) popIn(ref.current);
  }, [active]);
  return ref;
}

export function usePane<T extends HTMLElement>(key: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const seen = useRef(false);
  useEffect(() => {
    if (!seen.current) {
      seen.current = true;
      return;
    }
    fadePane(ref.current);
  }, [key]);
  return ref;
}

export function useScene<T extends HTMLElement>(view: string): RefObject<T | null> {
  const ref = useRef<T>(null);
  const prev = useRef(view);
  useEffect(() => {
    fadeScene(ref.current, viewDirection(prev.current, view));
    prev.current = view;
  }, [view]);
  return ref;
}

export function useFocusReceive(host: RefObject<HTMLElement | null>, nonce: number): void {
  useEffect(() => {
    if (nonce) receivePane(host.current);
  }, [nonce]);
}

/** Shared light on the glass layer. Writes --hx --hy as percents. No library. */
export function useGlassSpecular(host: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const clear = () => {
      root.style.removeProperty("--hx");
      root.style.removeProperty("--hy");
    };
    if (!enabled || prefersReduced()) {
      clear();
      return;
    }
    let hx = 28;
    let hy = 12;
    let tx = 28;
    let ty = 12;
    let frame = 0;
    const paint = () => {
      frame = 0;
      hx += (tx - hx) * 0.16;
      hy += (ty - hy) * 0.16;
      root.style.setProperty("--hx", `${hx.toFixed(2)}%`);
      root.style.setProperty("--hy", `${hy.toFixed(2)}%`);
      if (Math.abs(tx - hx) + Math.abs(ty - hy) > 0.08) frame = requestAnimationFrame(paint);
    };
    const requestPaint = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMove = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const nextX = ((event.clientX - box.left) / box.width) * 100;
      const nextY = ((event.clientY - box.top) / box.height) * 100;
      if (Math.abs(nextX - tx) + Math.abs(nextY - ty) < 0.6) return;
      tx = nextX;
      ty = nextY;
      requestPaint();
    };
    root.addEventListener("pointermove", onMove);
    return () => {
      root.removeEventListener("pointermove", onMove);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, [enabled]);
}

/** Pointer relative to one instrument, not the whole shell. */
export function useLocalPointer(host: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const clear = () => {
      root.style.removeProperty("--lx");
      root.style.removeProperty("--ly");
      root.removeAttribute("data-hot");
    };
    if (!enabled || prefersReduced()) {
      clear();
      return;
    }
    let lx = 0;
    let ly = 0;
    let tx = 0;
    let ty = 0;
    let frame = 0;
    const paint = () => {
      frame = 0;
      lx += (tx - lx) * 0.18;
      ly += (ty - ly) * 0.18;
      root.style.setProperty("--lx", lx.toFixed(4));
      root.style.setProperty("--ly", ly.toFixed(4));
      if (Math.abs(tx - lx) + Math.abs(ty - ly) > 0.002) frame = requestAnimationFrame(paint);
    };
    const requestPaint = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const onMove = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      if (!box.width || !box.height) return;
      root.setAttribute("data-hot", "1");
      tx = ((event.clientX - box.left) / box.width - 0.5) * 2;
      ty = ((event.clientY - box.top) / box.height - 0.5) * 2;
      requestPaint();
    };
    const onLeave = () => {
      root.removeAttribute("data-hot");
      tx = 0;
      ty = 0;
      requestPaint();
    };
    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerleave", onLeave);
    return () => {
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, [enabled]);
}

/** Forge skin only: pointer + scroll → CSS vars. Lean never calls this with enabled. */
export function useForgeParallax(
  host: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const root = host.current;
    const pane = scroller.current;
    if (!root) return;
    const clear = () => {
      root.style.removeProperty("--px");
      root.style.removeProperty("--py");
      root.style.removeProperty("--scroll");
    };
    if (!enabled || prefersReduced() || !pane) {
      clear();
      return;
    }
    let px = 0;
    let py = 0;
    let scroll = 0;
    let targetX = 0;
    let targetY = 0;
    let targetScroll = 0;
    let virtual = 0;
    let frame = 0;
    const paint = () => {
      frame = 0;
      px += (targetX - px) * 0.14;
      py += (targetY - py) * 0.14;
      scroll += (targetScroll - scroll) * 0.16;
      root.style.setProperty("--px", px.toFixed(4));
      root.style.setProperty("--py", py.toFixed(4));
      root.style.setProperty("--scroll", scroll.toFixed(4));
      if (Math.abs(targetX - px) + Math.abs(targetY - py) + Math.abs(targetScroll - scroll) > 0.002) {
        frame = requestAnimationFrame(paint);
      }
    };
    const requestPaint = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const readScroll = () => {
      const max = pane.scrollHeight - pane.clientHeight;
      if (max > 0) {
        virtual = 0;
        return forgeScrollUnit(pane.scrollTop);
      }
      return virtual;
    };
    const onMove = (event: PointerEvent) => {
      const box = root.getBoundingClientRect();
      if (!box.width || !box.height) return;
      targetX = ((event.clientX - box.left) / box.width - 0.5) * 2;
      targetY = ((event.clientY - box.top) / box.height - 0.5) * 2;
      requestPaint();
    };
    const onScroll = () => {
      targetScroll = readScroll();
      requestPaint();
    };
    const onWheel = (event: WheelEvent) => {
      const max = pane.scrollHeight - pane.clientHeight;
      if (max > 0) return;
      virtual = forgeScrollUnit(virtual * FORGE_SCROLL_TRAVEL + event.deltaY);
      targetScroll = virtual;
      requestPaint();
    };
    root.addEventListener("pointermove", onMove);
    pane.addEventListener("scroll", onScroll, { passive: true });
    pane.addEventListener("wheel", onWheel, { passive: true });
    onScroll();
    return () => {
      root.removeEventListener("pointermove", onMove);
      pane.removeEventListener("scroll", onScroll);
      pane.removeEventListener("wheel", onWheel);
      if (frame) cancelAnimationFrame(frame);
      clear();
    };
  }, [enabled]);
}
