import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true}});
let browser;
try{
  await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:800,height:800}});
  await page.goto('http://127.0.0.1:5199/embed.html?activity=idle&autoplay=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.mandy,null,{timeout:60000});
  await page.evaluate(()=>window.mandy.renderer.setAnimationLoop(null));
  await mkdir('artifacts',{recursive:true});
  for(const [name,angle,mode,time,elevation=.047] of [['front',0,'idle',0],['right',Math.PI/3,'idle',0],['left',-Math.PI/3,'idle',0],['back',Math.PI,'idle',0],['photo',.55,'photography',3],['wave',-.55,'hello',1],['front-high',0,'teach',3,.70],['left-high',-.55,'teach',3,.70],['right-high',.55,'teach',3,.70],['back-high',Math.PI,'idle',0,.70]].filter(([name])=>!process.env.HEAD_VIEWS||process.env.HEAD_VIEWS.split(',').includes(name))){
    await page.evaluate(({angle,mode,time,elevation})=>{
      const m=window.mandy;m.play(mode,{transition:false});m.pause();m.seek(time);
      m.camera.position.set(Math.sin(angle)*Math.cos(elevation)*4.9,3.32+Math.sin(elevation)*4.9,Math.cos(angle)*Math.cos(elevation)*4.9);m.camera.lookAt(0,3.32,0);m.camera.updateMatrixWorld();m.renderer.render(m.scene,m.camera);
    },{angle,mode,time,elevation});
    await page.screenshot({path:`artifacts/head-${process.env.HEAD_LABEL||'inspect'}-${name}.png`});
  }
  const checks = await page.evaluate(async()=>{
    const {Vector3, Matrix4, AnimationMixer, FrontSide} = await import('/node_modules/three/build/three.module.js');
    const {model, clips} = window.mandy;
    const face = model.face, shell = model.head.getObjectByName('HeadShell');
    // Count welded triangle edges across the portrait and its stitched back.
    const openEdges = geometries => {
      const edges = new Map();
      for (const geo of geometries) {
        const p=geo.getAttribute('position'), idx=geo.index;
        const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*100000)).join(',');
        for(let i=0;i<idx.count;i+=3){
          const triangle=[key(idx.getX(i)),key(idx.getX(i+1)),key(idx.getX(i+2))];
          if(new Set(triangle).size<3)continue;
          for(let j=0;j<3;j++){
            const edge=[triangle[j],triangle[(j+1)%3]].sort().join('|');
            edges.set(edge,(edges.get(edge)||0)+1);
          }
        }
      }
      return [...edges.values()].filter(count=>count!==2).length;
    };
    const hairLocks=[];model.hair.traverse(o=>{if(o.name==='HairLock')hairLocks.push(o);});
    let cameraIntersections=0, minimumCameraGap=Infinity, maxGripError=0;
    const mixer=new AnimationMixer(model.world);
    const action=mixer.clipAction(clips.find(c=>c.name==='Photography')).play();
    const cameraMeshes=[];model.cameraProp.traverse(o=>{
      if(o.isMesh&&o.geometry.type==='RoundedBoxGeometry'){
        o.geometry.computeBoundingBox();cameraMeshes.push(o);
      }
    });
    const positions=face.geometry.getAttribute('position'), point=new Vector3();
    const faceWorld=[];
    for(let i=0;i<positions.count;i++)faceWorld.push(new Vector3().fromBufferAttribute(positions,i));
    for(let frame=0;frame<=60;frame++){
      mixer.setTime(frame/10);model.world.updateMatrixWorld(true);
      const vertices=faceWorld.map(v=>v.clone().applyMatrix4(face.matrixWorld));
      for(const object of cameraMeshes){
        const inverse=new Matrix4().copy(object.matrixWorld).invert(),box=object.geometry.boundingBox;
        for(const vertex of vertices){
          point.copy(vertex).applyMatrix4(inverse);
          if(box.containsPoint(point))cameraIntersections++;
          minimumCameraGap=Math.min(minimumCameraGap,box.distanceToPoint(point));
        }
      }
      for(const side of ['Left','Right']){
        const palm=model.world.getObjectByName(side+'PalmGrip').getWorldPosition(new Vector3());
        const grip=model.world.getObjectByName(side+'CameraGrip').getWorldPosition(new Vector3());
        maxGripError=Math.max(maxGripError,palm.distanceTo(grip));
      }
    }
    mixer.stopAllAction();mixer.uncacheRoot(model.world);
    const normals=face.geometry.getAttribute('normal');
    const hairlineDepth=Math.max(...Array.from({length:73},(_,i)=>positions.getZ(i)))-Math.min(...Array.from({length:73},(_,i)=>positions.getZ(i)));
    return {headOpenEdges:openEdges([face.geometry,shell.geometry]), crownOpenEdges:openEdges([model.hair.getObjectByName('HairCrown').geometry]), hairlineDepth,
      unsealedLocks:hairLocks.filter(o=>openEdges([o.geometry])!==0).length, hairLocks:hairLocks.length,
      outwardFace:face.material.side===FrontSide&&Array.from({length:normals.count},(_,i)=>normals.getZ(i)).every(z=>z>0),
      cameraIntersections,minimumCameraGap,maxGripError};
  });
  console.log(JSON.stringify(checks,null,2));
  assert.equal(checks.headOpenEdges,0,'Head has an open seam');
  assert.equal(checks.unsealedLocks,0,'Hair locks have open ends');
  assert.equal(checks.crownOpenEdges,0,'Crown and back hair must form a closed continuous surface');
  assert.ok(checks.hairlineDepth<.025,'The narrow forehead tip must not project forward like a fin');
  assert.equal(checks.hairLocks,29);
  assert.ok(checks.outwardFace,'Face winding must point outward');
  assert.equal(checks.cameraIntersections,0,'Camera passes through the face');
  assert.ok(checks.minimumCameraGap>.025,'Camera is too close to the face');
  assert.ok(checks.maxGripError<.035,'Hands do not reach the camera');
  console.log('Head geometry, camera clearance and grips verified.');
}finally{await browser?.close();await server.close();}
