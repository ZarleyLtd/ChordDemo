/* Footer JP logo: tap to play the logo animation backwards to the separate J and P, then forwards
   again to the logo. The SVG is fetched and inlined so its timeline can be driven from here; the PNG
   in the button stays as the fallback if the fetch fails. */
(function () {
  const SRC = 'assets/icons/jpLogo-animated.svg';
  const DUR = 3.6;   // seconds: length of the SVG's timeline
  const SPEED = 1.5; // 3.6 s each way becomes 2.4 s

  const btn = document.querySelector('.footer-logo');
  if (!btn) return;

  fetch(SRC).then(r => (r.ok ? r.text() : Promise.reject(r.status))).then(text => {
    const holder = document.createElement('div');
    holder.innerHTML = text;
    const svg = holder.querySelector('svg');
    if (!svg || !svg.pauseAnimations) return;
    svg.pauseAnimations();
    svg.setCurrentTime(DUR); // rest on the finished logo, same as the PNG
    btn.replaceChildren(svg);

    let busy = false;
    btn.addEventListener('click', () => {
      if (busy || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      busy = true;
      const t0 = performance.now();
      const step = now => {
        const e = (now - t0) / 1000 * SPEED;
        svg.setCurrentTime(e < DUR ? DUR - e : Math.min(e - DUR, DUR));
        if (e < 2 * DUR) requestAnimationFrame(step);
        else busy = false;
      };
      requestAnimationFrame(step);
    });
  }).catch(() => { /* keep the PNG */ });
})();
