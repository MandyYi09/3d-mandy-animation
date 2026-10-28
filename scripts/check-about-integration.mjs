import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--enable-webgl',`--use-angle=${process.env.RENDER_BACKEND||'swiftshader'}`,'--enable-unsafe-swiftshader']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${process.env.WEBSITE_URL||'http://127.0.0.1:8765'}/about.html`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  const hair=await page.evaluate(()=>{
    const m=window.mandy;let locks=0,curls=0;m.model.hair.traverse(o=>{if(o.name==='HairLock')locks++;if(o.name==='HairCurl')curls++;});
    return {locks,curls,crown:!!m.model.hair.getObjectByName('HairCrown').material.map};
  });
  assert.deepEqual(hair,{locks:0,curls:12,crown:true});
  for(const [time,chapter] of [[1,'hello'],[7,'rowing'],[19,'teach'],[29,'photography'],[39,'tennis']]){
    await page.evaluate(t=>{window.mandy.pause();window.mandy.seek(t);},time);
    await page.waitForFunction(id=>document.querySelector(`[data-activity="${id}"]`).getAttribute('aria-pressed')==='true',chapter);
  }
  for(const chapter of ['hello','rowing','teach','photography','tennis']){
    await page.locator(`[data-activity="${chapter}"]`).click();
    assert.equal(await page.evaluate(()=>window.mandy.mode),chapter);
  }
  await page.evaluate(()=>{window.mandy.play('story',{transition:false});window.mandy.pause();window.mandy.seek(1);});
  await page.evaluate(()=>window.mandy.resume());
  assert.equal(await page.evaluate(()=>window.mandy.playing),true);
  await page.evaluate(()=>{window.mandy.pause();window.mandy.seek(1);window.mandy.resetCamera();});
  await page.locator('.world').scrollIntoViewIfNeeded();
  await mkdir('artifacts',{recursive:true});
  await page.locator('.world').screenshot({path:'artifacts/my-website-about-updated.png'});
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'artifacts/my-website-about-updated-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('Updated crown, all five chapter timings and controls, playback, mobile overflow, and browser errors passed.');
} finally {await browser.close();}
