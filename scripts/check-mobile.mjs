import assert from 'node:assert/strict';
import {createServer} from 'vite';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try{
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await page.route('https://fonts.googleapis.com/**',route=>route.abort());
  await page.goto('http://127.0.0.1:5199/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  const bounds=await page.evaluate(async()=>{
    const {Box3,Vector3}=await import('/node_modules/three/build/three.module.js');
    const m=window.mandy,canvas=m.renderer.domElement.getBoundingClientRect(),frame=document.querySelector('.world').getBoundingClientRect();
    const results=[];
    for(const time of [26,27,28,29]){
      m.seek(time);m.camera.updateMatrixWorld();
      for(const side of ['Left','Right']){
        const box=new Box3().setFromObject(m.model.world.getObjectByName(`${side}Oar`));
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          const p=new Vector3(x,y,z).project(m.camera);results.push({time,side,x:canvas.left+(p.x+1)*.5*canvas.width});
        }
      }
    }
    m.seek(28);return {left:frame.left,right:frame.right,min:Math.min(...results.map(p=>p.x)),max:Math.max(...results.map(p=>p.x))};
  });
  assert.ok(bounds.min>=bounds.left&&bounds.max<=bounds.right,`An oar is clipped: ${JSON.stringify(bounds)}`);
  await page.screenshot({path:'artifacts/preview-rowing-mobile.png',fullPage:true});
  console.log('Mobile rowing passed: both oars fit throughout the stroke.',JSON.stringify(bounds));
}finally{await browser?.close();await server.close();}
