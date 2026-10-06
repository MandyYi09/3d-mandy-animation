import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[];
async function checkCanvas(frame,name){
  const size=await frame.evaluate(()=>{
    const m=window.mandy,canvas=m.renderer.domElement,r=canvas.getBoundingClientRect();
    const viewer=document.querySelector('#viewer').getBoundingClientRect();
    return {dpr:devicePixelRatio,pixelRatio:m.renderer.getPixelRatio(),width:r.width,height:r.height,left:r.left,top:r.top,viewer:{width:viewer.width,height:viewer.height,left:viewer.left,top:viewer.top},aspect:m.camera.aspect};
  });
  for(const key of ['width','height','left','top'])assert.ok(Math.abs(size[key]-size.viewer[key])<1,`${name}: canvas CSS ${key} differs from the viewport: ${JSON.stringify(size)}`);
  assert.ok(Math.abs(size.aspect-size.width/size.height)<.005,`${name}: camera aspect does not match visible canvas`);
  return size;
}
try {
  for(const [name,width,height,deviceScaleFactor] of [['desktop',1440,960,1],['retina',1440,960,2],['mobile',390,844,3],['small',320,740,2]].filter(([name])=>!process.env.HOME_SIZES||process.env.HOME_SIZES.split(',').includes(name))) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor,reducedMotion:'reduce'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**',route=>route.abort());
    await page.goto('http://127.0.0.1:8765/index.html',{waitUntil:'domcontentloaded'});
    await page.locator('#little-mandy-home').scrollIntoViewIfNeeded();
    await page.locator('.home-mandy.is-loaded').waitFor({timeout:60000});
    const layout=await page.locator('.home-mandy-frame').evaluate(frame=>{
      const r=frame.getBoundingClientRect();return {centre:r.left+r.width/2,viewport:innerWidth,width:r.width,height:r.height};
    });
    assert.ok(Math.abs(layout.centre-layout.viewport/2)<1,'The character frame is not centred in the page.');
    const frame=await(await page.$('.home-mandy-frame')).contentFrame();
    const canvas=await checkCanvas(frame,name);
    const bounds=await frame.evaluate(()=>{
      const m=window.mandy;m.renderer.setAnimationLoop(null);m.pause();
      const meshes=[];
      m.model.root.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();meshes.push(o);}});
      const point=m.model.root.position.clone(), scale=point.clone();
      const result={left:1,right:-1,bottom:1,top:-1,headOffset:0};
      const render=m.renderer.render;
      m.renderer.render=()=>{};
      try {
        for(let time=0;time<48;time+=.5){
          m.seek(time);m.model.world.updateMatrixWorld(true);m.camera.updateMatrixWorld(true);
          m.model.head.getWorldPosition(point);point.project(m.camera);
          result.headOffset=Math.max(result.headOffset,Math.abs(point.x));
          for(const mesh of meshes){
            mesh.getWorldScale(scale);if(Math.max(scale.x,scale.y,scale.z)<.001)continue;
            const box=mesh.geometry.boundingBox;
            for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
              point.set(x,y,z).applyMatrix4(mesh.matrixWorld).project(m.camera);
              result.left=Math.min(result.left,point.x);result.right=Math.max(result.right,point.x);
              result.bottom=Math.min(result.bottom,point.y);result.top=Math.max(result.top,point.y);
            }
          }
        }
      } finally {m.renderer.render=render;}
      return result;
    });
    console.log(name,JSON.stringify({layout,canvas,bounds}));
    assert.ok(bounds.left>-.95&&bounds.right<.95&&bounds.bottom>-.95&&bounds.top<.95,`${name}: body or held prop is cropped`);
    assert.ok(bounds.headOffset<.06,`${name}: character drifts away from the centre`);
    for(const [activity,time] of [['hello',2],['tennis',11],['learning',21],['rowing',30],['photography',42]]){
      await frame.evaluate(time=>window.mandy.seek(time),time);
      await page.locator('#little-mandy-home').screenshot({path:`artifacts/home-centred-${name}-${activity}.png`});
    }
    if(name==='retina'){
      await page.setViewportSize({width:390,height:844});
      await frame.waitForFunction(()=>window.mandy.renderer.domElement.width===Math.floor(innerWidth*window.mandy.renderer.getPixelRatio()));
      await checkCanvas(frame,'retina after resize');
      await frame.evaluate(()=>window.mandy.seek(11));
      await page.locator('#little-mandy-home').screenshot({path:'artifacts/home-retina-after-resize.png'});
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log('Full body fits and stays centred through all five activities; canvas CSS size matches its viewport at all checked pixel densities.');
} finally {await browser.close();}
