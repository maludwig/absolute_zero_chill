import { useState, useEffect } from "react";

// Tiny fixed viewport-size readout for responsive debugging. Reports the CSS-pixel
// innerWidth × innerHeight (what media queries actually test) plus devicePixelRatio,
// live on resize/orientation change. Gated by SHOW_DEV_HUD at the render site.
export function DevHud() {
  const read = () =>
    typeof window === "undefined"
      ? { w: 0, h: 0, dpr: 1 }
      : { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 };

  const [size, setSize] = useState(read);

  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  return (
    <div className="dev-hud" aria-hidden="true">
      {size.w} × {size.h} · dpr {size.dpr}
    </div>
  );
}
