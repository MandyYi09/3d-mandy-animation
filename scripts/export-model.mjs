import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Browser export preserves both the original reference texture and the chalkboard lettering.
// Run `npm install --no-save playwright` and `npx playwright install chromium` on a new machine.
let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  const bundled = process.env.PLAYWRIGHT_MODULE;
  if (!bundled) throw new Error('Install Playwright (`npm install --no-save playwright`) or set PLAYWRIGHT_MODULE to its index.mjs.');
  ({ chromium } = await import(bundled));
}
const server = await createServer({ server: { host: '127.0.0.1', port: 5198, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.on('pageerror', error => console.error(error));
  await page.goto('http://127.0.0.1:5198/embed.html');
  await page.waitForFunction(() => !!window.mandy, null, { timeout: 60000 });
  const base64 = await page.evaluate(async () => {
    const buffer = await window.mandy.exportGLB();
    // Read the produced bytes back, so the download is checked rather than just the source scene.
    const {GLTFLoader}=await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {AnimationMixer}=await import('/node_modules/three/build/three.module.js');
    const loaded=await new GLTFLoader().parseAsync(buffer,'');
    const expected=['Story','Hello','Tennis','Learning','Rowing','Photography','Idle'];
    if(JSON.stringify(loaded.animations.map(clip=>clip.name))!==JSON.stringify(expected))throw new Error('The exported animation clips are incomplete.');
    if(!loaded.scene.getObjectByName('OriginalReferenceFace')?.material?.map)throw new Error('The original face texture is missing.');
    if(!loaded.scene.getObjectByName('HairlineInfill')?.material?.map)throw new Error('The reference hairline infill is missing.');
    const headShell=loaded.scene.getObjectByName('HeadShell');
    if(!headShell||!(headShell.geometry||headShell.children.some(child=>child.geometry)))throw new Error('The repaired head shell is missing.');
    if(!loaded.scene.getObjectByName('HairCrown')?.geometry)throw new Error('The continuous crown and back hair are missing.');
    if(!loaded.scene.getObjectByName('ClassroomNotes')?.material?.map)throw new Error('The classroom notes texture is missing.');
    const mixer=new AnimationMixer(loaded.scene);mixer.clipAction(loaded.animations[0]).play();
    mixer.setTime(28);
    if(loaded.scene.getObjectByName('RowingRig').scale.x<.99)throw new Error('The exported rowing scene does not animate.');
    mixer.setTime(41);
    if(loaded.scene.getObjectByName('CameraProp').scale.x<.99)throw new Error('The exported photography scene does not animate.');
    mixer.stopAllAction();mixer.uncacheRoot(loaded.scene);
    return await new Promise((resolve,reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject;
      reader.readAsDataURL(new Blob([buffer]));
    });
  });
  await mkdir('public', { recursive: true });
  const data = Buffer.from(base64, 'base64');
  await writeFile('public/mandy.glb', data);
  console.log(`Exported public/mandy.glb (${(data.length/1024/1024).toFixed(2)} MB), including Story, Hello, Tennis, Learning, Rowing, Photography, and Idle animations.`);
  console.log('GLB round-trip passed: all seven clips, original face, classroom notes, rowing, and photography.');
} finally { await browser?.close(); await server.close(); }
