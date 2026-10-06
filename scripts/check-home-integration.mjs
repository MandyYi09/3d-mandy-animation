import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.WEBSITE_URL || 'http://127.0.0.1:8765/';
const browser = await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors = [];
async function pageFor(options) {
  const page = await browser.newPage(options);
  page.on('pageerror',error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route => route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  return page;
}
async function character(page) {
  await page.locator('#home-mandy').waitFor({timeout:60000});
  await page.locator('#little-mandy-home').scrollIntoViewIfNeeded();
  await page.locator('.home-mandy.is-loaded').waitFor({timeout:60000});
  const frame = await (await page.$('.home-mandy-frame')).contentFrame();
  await frame.waitForFunction(() => !!window.mandy);
  return frame;
}
try {
  await mkdir('artifacts',{recursive:true});
  const page = await pageFor({viewport:{width:1440,height:960}});
  assert.equal(await page.locator('#home-mandy').isVisible(),false,'Character should wait for the opening.');
  // Software-rendered canvas effects can run much slower than real time. Use
  // the visible skip control by default; opt into the natural ending on a GPU.
  if(process.env.CHECK_NATURAL_OPENING!=='1')await page.locator('#skip-intro').click();
  const frame = await character(page);
  await frame.waitForFunction(() => window.mandy.playing);
  assert.equal(await frame.evaluate(() => window.mandy.playbackRate),1.4);
  assert.equal(await frame.locator('header,.chapters,.player').count(),0,'The homepage must only embed the character scene.');
  assert.equal(await frame.evaluate(() => window.mandy.renderer.getClearAlpha()),0);
  assert.equal(await page.locator('.showcase-slide').count(),5,'The character joins the four selected projects.');
  assert.equal(await page.locator('.showcase-slide').first().getAttribute('id'),'little-mandy-home');
  assert.equal(await page.locator('.showcase-slide').first().getAttribute('data-swiper-autoplay'),'35000');
  assert.deepEqual(await page.locator('.showcase-pagination button').allTextContents(),['01Little Mandy','02Grid 1','03Walker','04Grid 2','05Photography']);
  await page.locator('.showcase-next').click();
  await frame.waitForFunction(()=>!window.mandy.playing);
  assert.equal(await page.locator('.showcase-slide.swiper-slide-active').getAttribute('data-project'),'grid-1');
  assert.equal(await page.locator('.work-showcase.mandy-active').count(),0);
  await page.locator('.showcase-prev').click();
  await frame.waitForFunction(()=>window.mandy.playing);
  await page.locator('.home-mandy-toggle').click();
  await frame.waitForFunction(() => !window.mandy.playing);
  await frame.evaluate(()=>window.mandy.seek(2));
  await page.screenshot({path:'artifacts/carousel-first-desktop.png'});
  await page.locator('.home-mandy-toggle').click();
  await page.locator('.replay-opening').click();
  assert.equal(await page.locator('#home-mandy').isVisible(),false);
  await frame.waitForFunction(() => !window.mandy.playing);
  await page.locator('#skip-intro').click();
  await character(page);
  await frame.waitForFunction(() => window.mandy.playing);
  await page.locator('.home-mandy figcaption a').click();
  await page.waitForURL('**/little-mandy/');
  await page.waitForFunction(() => !!window.mandy);
  assert.equal(await page.locator('.chapter').count(),5);
  assert.equal(await page.evaluate(() => window.mandy.playbackRate),1,'Full showcase keeps its normal speed.');
  assert.equal(await page.locator('header,.wordmark,#embed-open').count(),0,'The showcase must not include the removed header.');
  assert.ok(await page.locator('.intro').evaluate(el=>el.getBoundingClientRect().top)>=24,'Leave space above the showcase title.');
  await page.evaluate(()=>{window.mandy.renderer.setAnimationLoop(null);window.mandy.pause();window.mandy.seek(2);});
  const back=await page.locator('.back-home').boundingBox(),intro=await page.locator('.eyebrow').boundingBox();
  assert.ok(back.y>=24&&back.y+back.height<intro.y,'Return button must have its own space above the intro.');
  await page.screenshot({path:'artifacts/showcase-with-back-home.png'});
  await page.locator('.back-home').click();
  await page.waitForURL('**/index.html');
  assert.equal(await page.locator('.showcase-slide.swiper-slide-active').getAttribute('id'),'little-mandy-home');
  await page.close();
  console.log(`Desktop: opening ${process.env.CHECK_NATURAL_OPENING==='1'?'natural completion':'skip'}, character first, five carousel slides, active-slide playback, pause/replay, full showcase entry and return home passed.`);

  const mobile = await pageFor({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const mobileFrame = await character(mobile);
  assert.equal(await mobileFrame.evaluate(() => window.mandy.playing),false);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth),'Mobile horizontal overflow.');
  await mobileFrame.evaluate(()=>window.mandy.seek(2));
  await mobile.screenshot({path:'artifacts/carousel-first-mobile.png',fullPage:true});
  const layout = await mobile.evaluate(() => {
    const bounds = selector => { const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom}; };
    return {stage:bounds('.home-mandy-stage'),link:bounds('.home-mandy figcaption'),carousel:bounds('.work-showcase'),pagination:bounds('.showcase-pagination')};
  });
  assert.ok(layout.carousel.top <= layout.stage.top && layout.stage.bottom <= layout.link.top + 1 && layout.link.bottom <= layout.pagination.top,`Mobile controls overlap: ${JSON.stringify(layout)}`);
  await mobile.mouse.move(330,350);await mobile.mouse.down();await mobile.mouse.move(70,350,{steps:8});await mobile.mouse.up();
  await mobile.waitForFunction(()=>document.querySelector('.showcase-swiper').swiper.activeIndex===1);
  await mobile.locator('.showcase-prev').click();
  await mobile.locator('.home-mandy-toggle').click();
  await mobileFrame.waitForFunction(() => window.mandy.playing);
  await mobile.close();
  console.log('Mobile: no overflow or overlapping controls, swiping across the character, and reduced-motion/manual resume passed.');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
