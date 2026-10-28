import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl',`--use-angle=${process.env.RENDER_BACKEND||'swiftshader'}`,'--enable-unsafe-swiftshader']});
  const page = await browser.newPage({viewport:{width:800,height:640},deviceScaleFactor:1});
  await page.goto('http://127.0.0.1:5199/embed.html?presentation=home&autoplay=0',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(() => !!window.mandy);
  await page.evaluate(() => {
    const m = window.mandy;
    m.renderer.setAnimationLoop(null);m.pause();m.seek(1.3);
  });
  await mkdir('public',{recursive:true});
  await page.screenshot({path:'public/portrait.png',omitBackground:true});
  console.log('Rendered transparent homepage poster from the current character.');
} finally { await browser?.close(); await server.close(); }
