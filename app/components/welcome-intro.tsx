import { useEffect, useState } from "react";
import { alumniMessages, headlineOptions } from "../content/alumni-messages";

const SLIDE_INTERVAL_MS = 5000;

export function WelcomeIntro() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) return;
    const timer = window.setInterval(
      () => setActive((index) => (index + 1) % headlineOptions.length),
      SLIDE_INTERVAL_MS
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="home-intro">
      <p className="eyebrow" lang="en">
        {alumniMessages.home.eyebrow}
      </p>
      <h1 lang="en">
        <span className="headline-slides" aria-live="off">
          {headlineOptions.map((text, index) => (
            <span
              key={text}
              className="headline-slide"
              data-active={index === active}
              aria-hidden={index !== active}
            >
              {text}
            </span>
          ))}
        </span>
        <em>{alumniMessages.home.headline}</em>
      </h1>
      <p className="intro-copy">{alumniMessages.home.introduction}</p>
      <div className="school-ribbon">
        <span aria-hidden="true">✦</span> Palembang, Sumatera Selatan
      </div>
    </div>
  );
}
