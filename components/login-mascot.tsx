"use client";

import { useEffect, useState } from "react";

export function LoginMascot() {
  const [coverEyes, setCoverEyes] = useState(false);
  const [curious, setCurious] = useState(false);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".login-mascot");
    if (!root) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const render = () => {
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      root.style.setProperty("--look-x", currentX.toFixed(3));
      root.style.setProperty("--look-y", currentY.toFixed(3));
      root.style.setProperty("--body-tilt", (currentX * 3.5).toFixed(2) + "deg");
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.01) {
        frame = window.requestAnimationFrame(render);
      } else frame = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const bounds = root.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - (bounds.left + bounds.width / 2)) / (bounds.width * 1.2)));
      targetY = Math.max(-1, Math.min(1, (event.clientY - (bounds.top + bounds.height / 2)) / (bounds.height * 1.2)));
      if (!reduceMotion && !frame) frame = window.requestAnimationFrame(render);
    };
    const syncFocus = () => {
      const active = document.activeElement;
      setCoverEyes(active instanceof HTMLElement && active.id === "login-password");
      setCurious(active instanceof HTMLElement && active.id === "login-username");
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("focusin", syncFocus);
    document.addEventListener("focusout", () => window.setTimeout(syncFocus, 0));
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", syncFocus);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={`login-mascot webit-mascot${coverEyes ? " is-covering" : ""}${curious ? " is-curious" : ""}`}
      role="img"
      aria-label="Wébit, mascote da Web Tech"
    >
      <span className="webit-orbit webit-orbit--back" aria-hidden="true" />
      <span className="webit-orbit webit-orbit--front" aria-hidden="true" />
      <span className="webit-spark webit-spark--one" aria-hidden="true">✦</span>
      <span className="webit-spark webit-spark--two" aria-hidden="true">+</span>

      <div className="webit-antenna"><i /></div>
      <div className="webit-head">
        <span className="webit-side webit-side--left" />
        <span className="webit-side webit-side--right" />
        <span className="webit-crown" aria-hidden="true" />
        <div className="webit-visor">
          <span className="webit-eye webit-eye--left"><i /></span>
          <span className="webit-eye webit-eye--right"><i /></span>
          <span className="webit-cheek webit-cheek--left" />
          <span className="webit-cheek webit-cheek--right" />
          <span className="webit-mouth" />
          <span className="webit-hand webit-hand--left" />
          <span className="webit-hand webit-hand--right" />
        </div>
        <span className="webit-temple webit-temple--left" />
        <span className="webit-temple webit-temple--right" />
      </div>

      <div className="webit-neck" />
      <div className="webit-torso">
        <span className="webit-shoulder webit-shoulder--left" />
        <span className="webit-shoulder webit-shoulder--right" />
        <div className="webit-chest">
          <svg viewBox="0 0 64 48" aria-hidden="true">
            <path d="M4 7h13l10 20L37 7h12L29 43h-5L4 7Z" />
            <path d="M31 7h12l10 20 7-13h-9l-8 15-12-22Z" />
          </svg>
          <i />
        </div>
        <span className="webit-torso-label">WEB TECH</span>
      </div>
      <span className="webit-arm webit-arm--left"><i /></span>
      <span className="webit-arm webit-arm--right"><i /></span>
      <div className="webit-hips" />
      <span className="webit-leg webit-leg--left"><i /></span>
      <span className="webit-leg webit-leg--right"><i /></span>
      <span className="webit-shadow" />
      <span className="webit-nameplate">{coverEyes ? "Senha protegida!" : curious ? "Olá! Quem chegou?" : "WÉBIT · seu parceiro digital"}</span>
    </div>
  );
}
