"use client";

import { useEffect, useState } from "react";

export function LoginMascot() {
  const [coverEyes, setCoverEyes] = useState(false);
  const [curious, setCurious] = useState(false);
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".login-mascot");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let blinkTimer = 0;
    let blinkOffTimer = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.13;
      currentY += (targetY - currentY) * 0.13;
      root.style.setProperty("--look-x", currentX.toFixed(3));
      root.style.setProperty("--look-y", currentY.toFixed(3));
      root.style.setProperty("--head-tilt", (currentX * 5.5).toFixed(2) + "deg");
      root.style.setProperty("--arm-left", (currentX * -7 + currentY * 3).toFixed(2) + "deg");
      root.style.setProperty("--arm-right", (currentX * 7 + currentY * 3).toFixed(2) + "deg");
      root.style.setProperty("--body-tilt", (currentX * 2.4).toFixed(2) + "deg");
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.008) {
        frame = window.requestAnimationFrame(render);
      } else {
        frame = 0;
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width * 1.3)));
      targetY = Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height * 1.25)));
      if (!frame) frame = window.requestAnimationFrame(render);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.id === "login-password") {
        setCoverEyes(true);
        setCurious(false);
      } else if (target.id === "login-username") {
        setCoverEyes(false);
        setCurious(true);
      }
    };
    const onFocusOut = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.id === "login-password" || target.id === "login-username")) {
        window.setTimeout(() => {
          const active = document.activeElement;
          setCoverEyes(active instanceof HTMLElement && active.id === "login-password");
          setCurious(active instanceof HTMLElement && active.id === "login-username");
        }, 0);
      }
    };

    if (!reducedMotion) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      const scheduleBlink = () => {
        blinkTimer = window.setTimeout(() => {
          setBlinking(true);
          blinkOffTimer = window.setTimeout(() => setBlinking(false), 145);
          scheduleBlink();
        }, 2600 + Math.random() * 2300);
      };
      scheduleBlink();
    }
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(blinkTimer);
      window.clearTimeout(blinkOffTimer);
    };
  }, []);

  return (
    <div
      className={`login-mascot${coverEyes ? " is-covering" : ""}${curious ? " is-curious" : ""}${blinking ? " is-blinking" : ""}`}
      role="img"
      aria-label="Mascote Tech, um robozinho que acompanha o movimento do mouse e reage ao preenchimento do login"
    >
      <span className="login-mascot-spark login-mascot-spark--one" aria-hidden="true">✦</span>
      <span className="login-mascot-spark login-mascot-spark--two" aria-hidden="true">·</span>
      <div className="login-mascot-antenna"><i /></div>
      <div className="login-mascot-head">
        <span className="login-mascot-ear login-mascot-ear--left" />
        <span className="login-mascot-ear login-mascot-ear--right" />
        <div className="login-mascot-face">
          <span className="login-mascot-eye login-mascot-eye--left"><i /></span>
          <span className="login-mascot-eye login-mascot-eye--right"><i /></span>
          <span className="login-mascot-blush login-mascot-blush--left" />
          <span className="login-mascot-blush login-mascot-blush--right" />
          <span className="login-mascot-mouth" />
        </div>
      </div>
      <div className="login-mascot-neck" />
      <div className="login-mascot-body">
        <span className="login-mascot-core"><i /></span>
        <span className="login-mascot-body-line" />
        <span className="login-mascot-body-detail login-mascot-body-detail--left" />
        <span className="login-mascot-body-detail login-mascot-body-detail--right" />
      </div>
      <span className="login-mascot-arm login-mascot-arm--left"><i className="login-mascot-hand" /></span>
      <span className="login-mascot-arm login-mascot-arm--right"><i className="login-mascot-hand" /></span>
      <span className="login-mascot-shadow" />
      <span className="login-mascot-caption">{coverEyes ? "Senha secreta!" : curious ? "Quem está aí?" : "Oi! Eu sou o Tech"}</span>
    </div>
  );
}
