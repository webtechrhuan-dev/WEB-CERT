"use client";

import { useEffect, useRef, useState } from "react";

type Mood = "idle" | "curious" | "covering";

export function LoginMascot() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [mood, setMood] = useState<Mood>("idle");

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;

    const animateEyes = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      stage.style.setProperty("--pupil-x", `${(x * 5).toFixed(2)}px`);
      stage.style.setProperty("--pupil-y", `${(y * 4).toFixed(2)}px`);
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.012) raf = requestAnimationFrame(animateEyes);
      else raf = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.65)));
      ty = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.65)));
      if (!reduceMotion && !raf) raf = requestAnimationFrame(animateEyes);
    };
    const syncMood = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.id === "login-password") setMood("covering");
      else if (active instanceof HTMLElement && active.id === "login-username") setMood("curious");
      else setMood("idle");
    };
    const onFocusOut = () => window.setTimeout(syncMood, 0);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("focusin", syncMood);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", syncMood);
      document.removeEventListener("focusout", onFocusOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={stageRef} className={`webit-stage webit-stage--${mood}`} role="img" aria-label="Wébit, mascote da Web Tech">
      <div className="webit-aura" aria-hidden="true" />
      <div className="webit-character" aria-hidden="true">
        <svg className="webit-art" viewBox="0 0 280 330" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="webit-shell" x1="54" y1="54" x2="221" y2="268" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FFFFFF"/><stop offset=".48" stopColor="#D8F7F6"/><stop offset="1" stopColor="#76C9D7"/>
            </linearGradient>
            <linearGradient id="webit-blue" x1="77" y1="80" x2="206" y2="245" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2876B9"/><stop offset=".55" stopColor="#087FA8"/><stop offset="1" stopColor="#07506F"/>
            </linearGradient>
            <linearGradient id="webit-glass" x1="90" y1="105" x2="190" y2="169" gradientUnits="userSpaceOnUse">
              <stop stopColor="#164A68"/><stop offset=".55" stopColor="#092C45"/><stop offset="1" stopColor="#071F35"/>
            </linearGradient>
            <linearGradient id="webit-metal" x1="100" y1="205" x2="180" y2="283" gradientUnits="userSpaceOnUse">
              <stop stopColor="#F7FFFF"/><stop offset=".5" stopColor="#A9E3E5"/><stop offset="1" stopColor="#4C9EB8"/>
            </linearGradient>
            <filter id="webit-glow" x="20" y="15" width="240" height="300" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse">
              <feGaussianBlur stdDeviation="7" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>
          </defs>
          <ellipse cx="140" cy="304" rx="69" ry="10" fill="#020F1B" opacity=".26"/>
          <ellipse cx="140" cy="300" rx="48" ry="5" fill="#43D4DE" opacity=".18" filter="url(#webit-glow)"/>
          <g className="webit-feet">
            <path d="M104 260L101 288Q100 299 112 300H132Q140 299 137 290L132 261" fill="url(#webit-metal)" stroke="#53B9CC" strokeWidth="3"/>
            <path d="M148 261L143 290Q141 299 151 300H172Q184 299 180 288L175 260" fill="url(#webit-metal)" stroke="#53B9CC" strokeWidth="3"/>
            <path d="M99 289Q117 296 138 290M143 290Q162 296 182 288" stroke="#1D7698" strokeWidth="3" strokeLinecap="round"/>
          </g>
          <g className="webit-arms">
            <path d="M83 190Q57 199 51 230L43 254Q41 265 52 269Q63 273 68 261L82 239L101 217" fill="url(#webit-metal)" stroke="#4CAFC4" strokeWidth="4" strokeLinejoin="round"/>
            <path d="M197 190Q223 199 229 230L237 254Q239 265 228 269Q217 273 212 261L198 239L179 217" fill="url(#webit-metal)" stroke="#4CAFC4" strokeWidth="4" strokeLinejoin="round"/>
            <path d="M43 251Q49 256 58 252M237 251Q231 256 222 252" stroke="#E9FFFF" strokeWidth="4" strokeLinecap="round"/>
          </g>
          <path d="M105 185H175L190 264Q140 291 90 264L105 185Z" fill="url(#webit-metal)" stroke="#57B7C9" strokeWidth="4"/>
          <path d="M116 201L140 215L164 201L176 260Q140 278 104 260L116 201Z" fill="url(#webit-blue)" stroke="#0B658A" strokeWidth="3"/>
          <path d="M119 222L131 222L140 239L149 222L161 222L146 254H134L119 222Z" fill="#70E5E6"/>
          <circle cx="140" cy="242" r="4" fill="#E4FFFF"/>
          <path d="M112 269Q140 278 168 269" stroke="#E8FFFF" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
          <g className="webit-head">
            <path d="M140 22L150 44L174 30L170 56L198 54L181 77L204 91L177 101L103 101L76 91L99 77L82 54L110 56L106 30L130 44L140 22Z" fill="url(#webit-blue)" stroke="#5BD5E0" strokeWidth="4" strokeLinejoin="round"/>
            <path d="M140 34L148 53L164 43L160 63L179 65L164 81L140 91L116 81L101 65L120 63L116 43L132 53L140 34Z" fill="#DDFBFA" opacity=".96"/>
            <path d="M140 47L148 65L140 78L132 65L140 47Z" fill="#0788AE"/>
            <path d="M140 82V101" stroke="#08799E" strokeWidth="4" strokeLinecap="round"/>
            <rect x="66" y="76" width="148" height="119" rx="43" fill="url(#webit-shell)" stroke="#67D5E0" strokeWidth="4"/>
            <path d="M78 100Q140 57 202 100" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".8"/>
            <rect x="81" y="105" width="118" height="67" rx="25" fill="url(#webit-glass)" stroke="#1B6684" strokeWidth="3"/>
            <path d="M89 119Q140 94 191 119" stroke="#6DE7EA" strokeWidth="2" opacity=".32"/>
            <g className="webit-eyes">
              <ellipse cx="116" cy="137" rx="9" ry="13" fill="#71EDF0"/>
              <ellipse cx="164" cy="137" rx="9" ry="13" fill="#71EDF0"/>
              <circle cx="119" cy="133" r="3.5" fill="white"/>
              <circle cx="167" cy="133" r="3.5" fill="white"/>
            </g>
            <path d="M132 157Q140 163 148 157" stroke="#6FE7EB" strokeWidth="3" strokeLinecap="round"/>
            <path d="M88 181Q140 201 192 181" stroke="#5EBBCA" strokeWidth="3" strokeLinecap="round"/>
            <path d="M66 117L54 127V151L67 158M214 117L226 127V151L213 158" stroke="#1B8FAF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="61" cy="142" r="4" fill="#A8F6F2"/><circle cx="219" cy="142" r="4" fill="#A8F6F2"/>
          </g>
          <g className="webit-cover-hands">
            <path d="M82 115Q64 102 72 89Q80 80 92 95L111 119" fill="url(#webit-shell)" stroke="#5BBECD" strokeWidth="4" strokeLinecap="round"/>
            <path d="M198 115Q216 102 208 89Q200 80 188 95L169 119" fill="url(#webit-shell)" stroke="#5BBECD" strokeWidth="4" strokeLinecap="round"/>
          </g>
          <path d="M140 19V5" stroke="#51C9D7" strokeWidth="5" strokeLinecap="round"/>
          <circle cx="140" cy="7" r="8" fill="#22C4D1" stroke="#D6FFFF" strokeWidth="3"/>
          <circle cx="140" cy="7" r="15" stroke="#55D9E3" strokeWidth="2" opacity=".25"/>
        </svg>
      </div>
      <div className="webit-caption">
        <span className="webit-caption-dot" />
        <span className="webit-caption-name">WÉBIT</span>
        <span className="webit-caption-divider" />
        <span className="webit-caption-message">{mood === "covering" ? "Sua senha é segredo." : mood === "curious" ? "Oi! Vamos começar?" : "Seu parceiro digital"}</span>
      </div>
    </div>
  );
}
