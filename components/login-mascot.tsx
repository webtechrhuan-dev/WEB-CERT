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
      x += (targetX - x) * 0.16;
      y += (targetY - y) * 0.16;
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
    <div ref={stageRef} className={`webit-stage webit-stage--${mood}`} role="img" aria-label="Wébit, guardião digital da Web Tech">
      <span className="webit-halo" aria-hidden="true" />
      <span className="webit-orbit webit-orbit--a" aria-hidden="true" />
      <span className="webit-orbit webit-orbit--b" aria-hidden="true" />
      <svg className="webit-art" viewBox="0 0 260 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="wb-fur" x1="54" y1="38" x2="205" y2="248" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F8FFFF"/><stop offset=".48" stopColor="#BCECF0"/><stop offset="1" stopColor="#4BA8C4"/>
          </linearGradient>
          <linearGradient id="wb-blue" x1="77" y1="52" x2="193" y2="249" gradientUnits="userSpaceOnUse">
            <stop stopColor="#287DC0"/><stop offset=".56" stopColor="#086D9C"/><stop offset="1" stopColor="#073D63"/>
          </linearGradient>
          <linearGradient id="wb-face" x1="80" y1="100" x2="185" y2="182" gradientUnits="userSpaceOnUse">
            <stop stopColor="#174F70"/><stop offset="1" stopColor="#061F38"/>
          </linearGradient>
          <linearGradient id="wb-tail" x1="38" y1="194" x2="96" y2="251" gradientUnits="userSpaceOnUse">
            <stop stopColor="#74E8E9"/><stop offset="1" stopColor="#087BA8"/>
          </linearGradient>
          <filter id="wb-shadow" x="12" y="12" width="236" height="280" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="8"/>
          </filter>
          <filter id="wb-eye-glow" x="0" y="0" width="260" height="300" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        <ellipse cx="130" cy="272" rx="72" ry="11" fill="#020E1B" opacity=".22" filter="url(#wb-shadow)"/>
        <path className="webit-tail" d="M91 216C48 237 39 204 57 190C68 181 82 189 77 201C73 210 62 207 63 200" stroke="url(#wb-tail)" strokeWidth="17" strokeLinecap="round"/>
        <path d="M91 216C48 237 39 204 57 190C68 181 82 189 77 201" stroke="#B7FFFF" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round"/>

        <g className="webit-body">
          <path d="M91 202C91 184 105 173 130 173C155 173 169 184 169 202L179 244C151 264 109 264 81 244L91 202Z" fill="url(#wb-fur)" stroke="#5BBBCB" strokeWidth="3"/>
          <path d="M103 199C111 190 149 190 157 199L163 237C143 250 117 250 97 237L103 199Z" fill="url(#wb-blue)" stroke="#0C668D" strokeWidth="2"/>
          <path d="M110 210H120L130 229L140 210H150L135 240H125L110 210Z" fill="#72E8E8"/>
          <path d="M117 245Q130 249 143 245" stroke="#E7FFFF" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
          <path d="M97 190L78 208L88 222M163 190L182 208L172 222" stroke="#8DE8EA" strokeWidth="9" strokeLinecap="round"/>
        </g>

        <g className="webit-head">
          <path d="M62 113L44 35C42 25 53 19 61 27L105 66C121 58 139 58 155 66L199 27C207 19 218 25 216 35L198 113" fill="url(#wb-blue)" stroke="#54C8D9" strokeWidth="4" strokeLinejoin="round"/>
          <path d="M59 48L91 77L75 91L59 48ZM201 48L169 77L185 91L201 48Z" fill="#0B385D" opacity=".9"/>
          <path d="M70 113C70 82 94 64 130 64C166 64 190 82 190 113V158C190 194 164 216 130 216C96 216 70 194 70 158V113Z" fill="url(#wb-fur)" stroke="#6AD3DE" strokeWidth="4"/>
          <path d="M83 100C94 82 111 76 130 76C149 76 166 82 177 100" stroke="white" strokeWidth="5" strokeLinecap="round" opacity=".65"/>
          <path d="M81 113C81 103 91 95 104 95H156C169 95 179 103 179 113V157C179 172 166 184 150 184H110C94 184 81 172 81 157V113Z" fill="url(#wb-face)" stroke="#1A6585" strokeWidth="3"/>
          <path d="M88 111C105 99 155 99 172 111" stroke="#73E8E9" strokeWidth="2" opacity=".25"/>
          <g className="webit-eyes" filter="url(#wb-eye-glow)">
            <ellipse cx="111" cy="132" rx="8" ry="12" fill="#61E7EA"/>
            <ellipse cx="149" cy="132" rx="8" ry="12" fill="#61E7EA"/>
            <ellipse cx="113" cy="128" rx="3" ry="4" fill="white"/>
            <ellipse cx="151" cy="128" rx="3" ry="4" fill="white"/>
          </g>
          <path d="M124 151Q130 156 136 151" stroke="#73E8E9" strokeWidth="3" strokeLinecap="round"/>
          <path d="M95 174Q130 192 165 174" stroke="#56B8CC" strokeWidth="3" strokeLinecap="round"/>
          <path d="M80 150C88 155 96 157 104 157M180 150C172 155 164 157 156 157" stroke="#72D8E0" strokeWidth="2" opacity=".5"/>
          <path d="M101 188Q130 199 159 188" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".65"/>
        </g>

        <g className="webit-paws">
          <path d="M83 190C69 180 58 190 61 204C63 215 77 218 91 207" fill="url(#wb-fur)" stroke="#56B8CC" strokeWidth="3"/>
          <path d="M177 190C191 180 202 190 199 204C197 215 183 218 169 207" fill="url(#wb-fur)" stroke="#56B8CC" strokeWidth="3"/>
        </g>
        <g className="webit-cover-paws">
          <path d="M81 118C64 107 56 119 64 134L93 153" fill="url(#wb-fur)" stroke="#55B6C8" strokeWidth="4" strokeLinecap="round"/>
          <path d="M179 118C196 107 204 119 196 134L167 153" fill="url(#wb-fur)" stroke="#55B6C8" strokeWidth="4" strokeLinecap="round"/>
          <path d="M66 126L77 132M194 126L183 132" stroke="white" strokeWidth="3" strokeLinecap="round"/>
        </g>
        <path d="M130 53V39" stroke="#62DCE2" strokeWidth="4" strokeLinecap="round"/>
        <path d="M130 26L136 33L130 40L124 33L130 26Z" fill="#35C6D4" stroke="#D8FFFF" strokeWidth="2"/>
        <circle cx="130" cy="33" r="13" stroke="#67E5E9" strokeOpacity=".3" strokeWidth="2"/>
      </svg>
      <div className="webit-wordmark">
        <span className="webit-live-dot" />
        <strong>WÉBIT</strong>
        <span className="webit-wordmark-line" />
        <small>{mood === "covering" ? "Sua senha fica só com você." : mood === "curious" ? "Olá! Pronto para começar?" : "Guardião digital Web Tech"}</small>
      </div>
    </div>
  );
}
