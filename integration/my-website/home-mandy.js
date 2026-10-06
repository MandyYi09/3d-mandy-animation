(() => {
  const section = document.querySelector('#little-mandy-home');
  if (!section) return;
  const figure = section.querySelector('.home-mandy');
  const frame = figure.querySelector('iframe');
  const button = figure.querySelector('.home-mandy-toggle');
  const showcase = section.closest('.work-showcase');
  const swiper = showcase.querySelector('.showcase-swiper').swiper;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let loaded = false, ready = false, inView = false, lastAction = '';
  let paused = reduced.matches;
  let complete = !document.body.classList.contains('intro-playing');

  function load() {
    if (loaded) return;
    loaded = true;
    frame.src = frame.dataset.src;
  }
  function sync() {
    const active = !swiper || swiper.slides[swiper.activeIndex] === section;
    figure.style.visibility = complete ? 'visible' : 'hidden';
    showcase.classList.toggle('mandy-active', active);
    button.setAttribute('aria-label', paused ? 'Play character animation' : 'Pause character animation');
    button.querySelector('span').textContent = paused ? '▶' : 'Ⅱ';
    if (complete && inView && active) load();
    if (!ready) return;
    const action = complete && active && !paused && inView && !document.hidden ? 'resume' : 'pause';
    if (action !== lastAction) {
      frame.contentWindow.postMessage({type:'mandy', action}, location.origin);
      lastAction = action;
    }
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'mandy') return;
    if (event.data.event === 'ready') {
      ready = true; lastAction = '';
      figure.classList.add('is-loaded');
      sync();
    }
    if (event.data.event === 'error') {
      ready = false; figure.classList.remove('is-loaded');
    }
  });
  document.addEventListener('opening-start', () => { complete = false; sync(); });
  document.addEventListener('opening-complete', () => { complete = true; sync(); });
  swiper?.on('slideChange', sync);
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, {rootMargin:'100px',threshold:0}).observe(section);
  button.addEventListener('click', () => { paused = !paused; sync(); });
  reduced.addEventListener('change', event => { if (event.matches) paused = true; sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pageshow', sync);
  sync();
})();
