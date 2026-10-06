import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';

const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const errors=[];const page=await browser.newPage({viewport:{width:1440,height:1080}});
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5199/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  await page.evaluate(()=>window.mandy.pause());
  await mkdir('artifacts',{recursive:true});
  for(const [name,time] of [['learning',19],['rowing-catch',28],['rowing-drive',30],['photography',41],['camera-rest',38.2]]){
    await page.evaluate(t=>window.mandy.seek(t),time);
    await page.screenshot({path:`artifacts/preview-${name}.png`,fullPage:true});
  }
  const gripChecks=await page.evaluate(async()=>{
    const {Vector3}=await import('/node_modules/three/build/three.module.js');
    const result=[];
    for(const [activity,times,target] of [['rowing',[26,26.5,27,27.5,28,28.5,29,29.5],'OarGrip'],['photography',[38,39,40,41,42,43],'CameraGrip']]){
      for(const time of times){window.mandy.seek(time);for(const side of ['Left','Right']){
        const world=window.mandy.model.world;
        const palm=world.getObjectByName(`${side}PalmGrip`).getWorldPosition(new Vector3());
        const grip=world.getObjectByName(`${side}${target}`).getWorldPosition(new Vector3());
        result.push({activity,time,side,distance:palm.distanceTo(grip)});
      }}
    }
    return result;
  });
  console.log('Maximum hand-to-prop distance:',Math.max(...gripChecks.map(r=>r.distance)).toFixed(5));
  for(const check of gripChecks)assert.ok(check.distance<.035,`Hand missed prop: ${JSON.stringify(check)}`);
  for(const id of ['rowing','photography','teach']){
    await page.locator(`[data-activity="${id}"]`).click();assert.equal(await page.evaluate(()=>window.mandy.mode),id);
  }
  await page.locator('#sequence-button').click();assert.equal(await page.evaluate(()=>window.mandy.mode),'story');
  assert.equal(await page.locator('.chapter').count(),5);
  await page.close();
  const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.route('https://fonts.googleapis.com/**',route=>route.abort());
  await mobile.goto('http://127.0.0.1:5199/',{waitUntil:'domcontentloaded'});await mobile.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  assert.equal(await mobile.evaluate(()=>window.mandy.playing),false);
  await mobile.evaluate(()=>window.mandy.seek(28));await mobile.screenshot({path:'artifacts/preview-rowing-mobile.png',fullPage:true});
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.close();
  const embed=await browser.newPage({viewport:{width:390,height:600},reducedMotion:'reduce'});embed.on('pageerror',e=>errors.push(e.message));
  await embed.goto('http://127.0.0.1:5199/embed.html?activity=photography&autoplay=0',{waitUntil:'domcontentloaded',timeout:60000});await embed.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  assert.equal(await embed.evaluate(()=>window.mandy.mode),'photography');assert.equal(await embed.evaluate(()=>window.mandy.playing),false);assert.equal(await embed.evaluate(()=>window.mandy.renderer.getClearAlpha()),0);
  assert.equal(await embed.evaluate(()=>window.mandy.model.cameraProp.scale.x),1);
  assert.deepEqual(errors,[]);
  console.log('Passed: 5 chapter controls, rowing/camera hand contacts, mobile layout, reduced motion, and transparent photography embed. No browser errors.');
} finally {await browser?.close();await server.close();}
