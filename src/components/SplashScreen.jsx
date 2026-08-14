import React, { useEffect, useState } from "react";
import logo from "../images/sbfp.png";
import "./SplashScreen.css";

/**
 * Full-screen login splash that plays:
 *   1. scale-up + glow  (400 ms)
 *   2. hold             (300 ms)
 *   3. scale-down + fade-out (400 ms)
 * Then calls onDone() so the parent can unmount it.
 */
export default function SplashScreen({ onDone }) {
  // "entering" → "holding" → "leaving"
  const [phase, setPhase] = useState("entering");

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("holding"),  400);
    const t2 = setTimeout(() => setPhase("leaving"),  700);
    const t3 = setTimeout(() => onDone(),            1100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  return (
    <div className={`splash-overlay splash-${phase}`}>
      <div className="splash-logo-wrap">
        <img src={logo} alt="SBFP Logo" className="splash-logo" />
      </div>
    </div>
  );
}
