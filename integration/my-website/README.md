# Homepage integration

The character is the first carousel slide in `my-website/index.html`, followed by
the four existing projects.
Only the transparent scene is embedded; the link opens `little-mandy/`, which
contains the full showcase and all five activity controls.
The showcase has no branded header; its introductory text has its own top spacing.
A small “Back to home” link above the intro returns to `../index.html`.

`home-mandy.js` listens to the existing `opening-start` and `opening-complete`
events from `js/cinematic.js`. Initial state also checks `body.intro-playing`,
so returning visits and reduced-motion visitors do not wait for another opening.
The character pauses during replay, on another carousel slide, outside the viewport,
or in a hidden tab.
The small pause button controls this character independently of the project carousel.

The embed uses `presentation=home&speed=1.4&autoplay=0`. Its original 48-second
story therefore takes about 34 seconds. The first carousel slide stays for 35
seconds, while the other projects retain their 7-second delay. The full showcase
keeps normal speed.
The homepage has its own full-body camera, centred on the character as she moves.
Narrow screens widen the view to keep the body and held props inside the frame.
The canvas has explicit CSS dimensions, independent of its high-DPI drawing buffer,
so Retina displays keep the same framing as standard-density screens.
`portrait.png` provides a fallback while WebGL loads or if it is unavailable.

After changing the character:

1. Export the GLB if geometry or clips changed.
2. Run `node scripts/render-poster.mjs` if the character appearance changed.
3. Run `npm run build`.
4. Run `python3 integration/my-website/install.py` from this project, with write
   access to `/Users/mandy/Documents/zx/my-website`.

The installer backs up the homepage, copies the built files and this independent
CSS/JS module, and updates only the marked character section and its includes.
It preserves the opening script and the four projects, updates the carousel labels
and numbering, and inserts the character first. All deployed asset URLs
are relative; the website does not depend on the 5173 development server.

Check the integration with `node scripts/check-home-integration.mjs` while the
website is served on port 8765 (or set `WEBSITE_URL`). The browser scripts use the
same `PLAYWRIGHT_MODULE` and `CHROME_PATH` variables as the model exporter.
The interaction check uses the opening’s skip button by default; set
`CHECK_NATURAL_OPENING=1` to wait for its natural ending with GPU rendering.
`node scripts/check-home-framing.mjs` also checks the canvas dimensions and body
bounds at pixel densities 1, 2 and 3, including a live resize.
