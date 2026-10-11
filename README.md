# Little Mandy

A real 3D, reference-textured character with a continuous 48-second story: wave hello → play tennis → explore classroom notes → row → take photographs → wave hello. The face uses the supplied frontal portrait projected onto a shaped 3D surface, preserving the original eyes, nose, and smile. Hair, clothing, shoes, hands, racket, tennis ball, classroom board, rowing shell, oars, and camera are modeled geometry. The board contains natural handwritten maths, science, art/design, and economics notes.

## Preview

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Drag to rotate, use the + / − buttons to zoom, scroll the page, select a chapter, or play the full story. The ↺ button restores the original view. Mouse-wheel and trackpad scrolling are reserved for page navigation; vertical touch swipes also scroll the page. The controls blend between activities over 1.15 seconds; the story uses 1.8-second eased transitions. The face retains the reference expression during the animation.

## Add to your website

```sh
npm run build
```

Upload **the contents of `dist/`** into a `/mandy/` directory on your website. Then add:

```html
<iframe
  src="/mandy/embed.html"
  title="Animated Mandy"
  style="width:100%;height:600px;border:0;background:transparent"
  loading="lazy"
></iframe>
```

The embed has a transparent background. It starts the full story automatically, pauses animation when offscreen, and respects `prefers-reduced-motion`. Set a definite height on its container. WebGL must be available. There are no external runtime assets in the embed after building.

Optional URLs:

- `embed.html?activity=tennis` — loop tennis only.
- `embed.html?activity=teach` — loop the classroom scene only.
- `embed.html?activity=hello` — loop the wave.
- `embed.html?activity=rowing` — loop rowing.
- `embed.html?activity=photography` — loop photography.
- `embed.html?autoplay=0` — start paused.
- `embed.html?presentation=home&speed=1.4&autoplay=0` — a character-only homepage scene with orbit/zoom disabled, a 34-second five-activity loop, and playback controlled by its same-origin parent.

## Use directly in a Three.js application

Copy `src/character.js`, `src/animation.js`, and the referenced image into your project, keeping the relative paths. `createCharacter()` returns the model hierarchy; `createAnimations()` returns standard Three.js `AnimationClip` objects.

For the full ready-made renderer, import `createMandyExperience` from `src/experience.js`:

```js
import { createMandyExperience } from './src/experience.js';

const mandy = await createMandyExperience(document.querySelector('#character'));
mandy.play('tennis'); // 'story', 'hello', 'tennis', 'teach', 'rowing', 'photography', 'idle'
mandy.pause();
mandy.resume();
// When removing the component:
mandy.dispose();
```

In React, call the asynchronous initializer in an effect and dispose the instance on cleanup, including if the effect unmounts while initialization is pending.

## Portable animated model

`public/mandy.glb` includes the original face texture, the character, props, and seven animation clips: **Story**, **Hello**, **Tennis**, **Learning**, **Rowing**, **Photography**, and **Idle**. Load it with Three.js `GLTFLoader` or import it into Blender. Start the `Story` animation for the complete sequence. The face material uses the standard `KHR_materials_unlit` extension to preserve the reference colors. Props are revealed by animated scales, so play one of the supplied clips when viewing the GLB.

To regenerate the GLB after editing:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run export
npm run build
```

You can set `CHROME_PATH` to a local Chromium/Chrome executable and `PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs` instead of installing another browser/runtime.

## Main files

- `src/character.js`: sculpted geometry and reference-projected face.
- `src/animation.js`: joint poses, eased transitions, and baked clips.
- `src/experience.js`: lighting, playback, orbit controls, lifecycle, and GLB export.
- `src/main.js` / `src/style.css`: demo interface.
- `src/embed.js` / `embed.html`: transparent website embed.

Rowing includes a seated stroke cycle, sliding posture, and two oars. Two-joint arm positioning keeps the palms on the oar handles. Photography raises a detailed camera from chest height to the viewfinder, with both hands following the camera and a small shutter indicator.

`npm run check` validates the clips and the continuity of all five story transitions. `npm run build` creates a production package with relative asset URLs, suitable for hosting under a subdirectory.

The character is a stylized 3D interpretation of the supplied 2D references; the original expression is preserved as a projected texture rather than an independently animated facial rig. The preview is local until you upload it to your own website.

To run visual and interaction checks, use `node scripts/check-browser.mjs` with the same Playwright/Chrome environment variables as the exporter. It checks all five chapter controls, the hands remaining on the oars and camera, mobile overflow, reduced motion, and the transparent photography embed.

`node scripts/inspect-head.mjs` saves close-up views, including the front and back from above. It checks the closed head and continuous hair surface, the flattened forehead tip, outward face normals, and camera clearance throughout the photography cycle. The original face image and its features remain unchanged. Hair now uses one continuous curved surface from the portrait's hairline through the crown to the hanging lengths, with a recessed part and shallow strand relief. Reference hair colours are projected onto that same surface and fade into flowing strands at the back; there is no separate hairline image plane or stack of root tubes. Left and right hands use mirrored geometry, with wrist rotation and palm offsets accounted for when rowing.
