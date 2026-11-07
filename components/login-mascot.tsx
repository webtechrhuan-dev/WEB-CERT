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
    let frame = 0;
    let x = 0;
    let y = 0;
    let targetX = 0;
    let targetY = 0;

    const paint = () => {
      x += (targetX - x) * 0.14;
      y += (targetY - y) * 0.14;
      stage.style.setProperty("--gaze-x", `${(x * 5).toFixed(2)}px`);
      stage.style.setProperty("--gaze-y", `${(y * 4).toFixed(2)}px`);
      if (Math.abs(targetX - x) + Math.abs(targetY - y) > 0.01) frame = requestAnimationFrame(paint);
      else frame = 0;
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = stage.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / (rect.width * 0.7)));
      targetY = Math.max(-1, Math.min(1, (event.clientY - rect.top - rect.height / 2) / (rect.height * 0.7)));
      if (!reduceMotion && !frame) frame = requestAnimationFrame(paint);
    };
    const syncMood = () => {
      const active = document.activeElement;
      setMood(active instanceof HTMLElement && active.id === "login-password" ? "covering" :
        active instanceof HTMLElement && active.id === "login-username" ? "curious" : "idle");
    };
    const onFocusOut = () => window.setTimeout(syncMood, 0);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("focusin", syncMood);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("focusin", syncMood);
      document.removeEventListener("focusout", onFocusOut);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={stageRef} className={`wt-character-stage wt-character-stage--${mood}`} role="img" aria-label="Personagem da Web Tech">
      <span className="wt-character-aura" aria-hidden="true" />
      <svg className="wt-character-art" viewBox="0 0 320 360" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="char-skin" x1="102" y1="90" x2="221" y2="228" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFE8D4"/><stop offset=".52" stopColor="#E9B99B"/><stop offset="1" stopColor="#C98970"/>
          </linearGradient>
          <linearGradient id="char-hair" x1="95" y1="36" x2="231" y2="148" gradientUnits="userSpaceOnUse">
            <stop stopColor="#243D60"/><stop offset=".55" stopColor="#102943"/><stop offset="1" stopColor="#071A30"/>
          </linearGradient>
          <linearGradient id="char-jacket" x1="75" y1="230" x2="249" y2="354" gradientUnits="userSpaceOnUse">
            <stop stopColor="#168EB8"/><stop offset=".5" stopColor="#086A98"/><stop offset="1" stopColor="#073D66"/>
          </linearGradient>
          <linearGradient id="char-shirt" x1="132" y1="239" x2="192" y2="337" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F5FFFF"/><stop offset="1" stopColor="#B8E4E9"/>
          </linearGradient>
          <linearGradient id="char-ear" x1="82" y1="152" x2="239" y2="201" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8D7C2"/><stop offset="1" stopColor="#D89D83"/>
          </linearGradient>
          <filter id="char-shadow" x="25" y="12" width="270" height="350" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="11"/>
          </filter>
          <filter id="char-glow" x="0" y="0" width="320" height="360" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="2.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <ellipse cx="160" cy="333" rx="95" ry="13" fill="#04182B" opacity=".23" filter="url(#char-shadow)"/>
        <g className="wt-character-body">
          <path d="M77 286C83 246 111 226 146 220H178C215 226 240 246 245 286L257 342H63L77 286Z" fill="url(#char-jacket)" stroke="#54B9D0" strokeWidth="3"/>
          <path d="M126 229L160 270L194 229L211 342H109L126 229Z" fill="url(#char-shirt)"/>
          <path d="M126 229L160 270L145 294L117 244L126 229Z" fill="#0B4C75"/>
          <path d="M194 229L160 270L175 294L203 244L194 229Z" fill="#0B4C75"/>
          <path d="M160 271V342" stroke="#79D9E2" strokeWidth="3" opacity=".75"/>
          <path d="M91 267L111 278L101 342H63L77 286Z" fill="#0B527D" opacity=".8"/>
          <path d="M229 267L209 278L219 342H257L245 286Z" fill="#06395F" opacity=".7"/>
          <path d="M112 258L127 247M208 258L193 247" stroke="#A4F1F1" strokeWidth="3" strokeLinecap="round" opacity=".7"/>
          <path d="M145 294L160 309L175 294" stroke="#55C6D7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        </g>
        <g className="wt-character-neck">
          <path d="M139 205H181V248C169 261 151 261 139 248V205Z" fill="url(#char-skin)"/>
          <path d="M139 219Q160 238 181 219V239Q160 256 139 239V219Z" fill="#C98970" opacity=".35"/>
        </g>
        <g className="wt-character-head">
          <path d="M99 132C99 79 124 51 163 51C205 51 226 83 222 137L218 190C214 226 190 246 160 246C129 246 105 225 101 190L99 132Z" fill="url(#char-skin)" stroke="#C78E78" strokeWidth="2.5"/>
          <path d="M88 141C79 128 78 105 85 83C94 52 122 29 162 29C198 29 222 48 232 77C239 98 234 122 227 139L217 117L211 94C190 102 166 102 144 94C131 110 112 118 96 119L88 141Z" fill="url(#char-hair)"/>
          <path d="M103 82C116 49 151 39 179 48C193 53 204 64 210 77C187 70 170 72 151 83C133 94 116 97 96 96L103 82Z" fill="#355477" opacity=".7"/>
          <path d="M90 143C77 134 73 148 80 166C85 178 96 182 105 177L101 146L90 143Z" fill="url(#char-ear)"/>
          <path d="M230 143C243 134 247 148 240 166C235 178 224 182 215 177L219 146L230 143Z" fill="url(#char-ear)"/>
          <path d="M87 151Q94 146 99 156M233 151Q226 146 221 156" stroke="#B97868" strokeWidth="2" strokeLinecap="round"/>
          <path d="M115 142Q130 132 144 141" stroke="#493C42" strokeWidth="5" strokeLinecap="round"/>
          <path d="M176 141Q190 132 204 142" stroke="#493C42" strokeWidth="5" strokeLinecap="round"/>
          <g className="wt-character-eyes" filter="url(#char-glow)">
            <ellipse cx="131" cy="159" rx="6" ry="8" fill="#17364C"/>
            <ellipse cx="189" cy="159" rx="6" ry="8" fill="#17364C"/>
            <circle cx="133" cy="156" r="2" fill="white"/>
            <circle cx="191" cy="156" r="2" fill="white"/>
          </g>
          <path d="M160 161L154 183Q160 188 166 183" stroke="#B87968" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M143 204Q160 217 178 203" stroke="#9E4F53" strokeWidth="3" strokeLinecap="round"/>
          <path d="M145 204Q160 211 176 203" stroke="#FFF0E6" strokeWidth="2" strokeLinecap="round"/>
          <path d="M111 184Q119 190 128 187M192 187Q201 190 209 184" stroke="#D68D80" strokeWidth="5" strokeLinecap="round" opacity=".38"/>
          <path d="M111 115C122 105 134 99 145 92" stroke="#4E6E91" strokeWidth="4" strokeLinecap="round" opacity=".55"/>
          <path d="M211 105C202 95 195 89 186 85" stroke="#4E6E91" strokeWidth="4" strokeLinecap="round" opacity=".45"/>
        </g>
        <g className="wt-character-arms">
          <path d="M87 258C70 263 61 279 65 297L77 315C84 324 99 318 99 307L94 286L112 276" fill="url(#char-skin)" stroke="#C98970" strokeWidth="3"/>
          <path d="M233 258C250 263 259 279 255 297L243 315C236 324 221 318 221 307L226 286L208 276" fill="url(#char-skin)" stroke="#C98970" strokeWidth="3"/>
        </g>
        <g className="wt-character-cover">
          <path d="M102 151C88 137 75 143 78 160L91 186C98 197 111 195 116 184L124 169" fill="url(#char-skin)" stroke="#C98970" strokeWidth="3"/>
          <path d="M218 151C232 137 245 143 242 160L229 186C222 197 209 195 204 184L196 169" fill="url(#char-skin)" stroke="#C98970" strokeWidth="3"/>
          <path d="M88 160L102 174M232 160L218 174" stroke="#FFE8D4" strokeWidth="3" strokeLinecap="round"/>
        </g>
        <path d="M236 228L246 218L256 228L246 238L236 228Z" fill="#35C2D0" stroke="#D7FFFF" strokeWidth="2"/>
        <circle cx="246" cy="228" r="17" stroke="#55D3DF" strokeOpacity=".35" strokeWidth="2"/>
      </svg>
      <div className="wt-character-caption">
        <span className="wt-character-status" />
        <strong>WEB TECH</strong>
        <span className="wt-character-divider" />
        <small>{mood === "covering" ? "Privacidade em primeiro lugar" : mood === "curious" ? "Vamos começar?" : "Seu parceiro digital"}</small>
      </div>
    </div>
  );
}
