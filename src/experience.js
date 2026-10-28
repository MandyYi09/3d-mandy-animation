import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createCharacter } from './character.js';
import { createAnimations, createStoryTimeline, getChapterAt, ACTIVITY_CLIPS } from './animation.js';

/** Mount the complete animation in any element. Call dispose() when unmounting. */
export async function createMandyExperience(container,{autoplay=true,onProgress=()=>{},transparent=true,playbackRate=1,interactive=true,framing='scene',chapterOrder}={}){
  const homeFraming=framing==='home';
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power',preserveDrawingBuffer:true});
  // Keep CSS dimensions independent of the high-DPI drawing buffer.
  Object.assign(renderer.domElement.style,{display:'block',width:'100%',height:'100%'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.setClearColor(0x000000,transparent?0:1);
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.87;
  renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement);
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(32,1,.1,40);
  const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(.35,2.18,0);
  controls.enabled=interactive;
  // Let wheel/trackpad scrolling and vertical touch gestures navigate the page.
  controls.enableZoom=false;
  renderer.domElement.style.touchAction='pan-y';
  controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;
  controls.minDistance=5.8;controls.maxDistance=13;controls.minPolarAngle=.8;controls.maxPolarAngle=1.65;
  const resetCamera=()=>{
    camera.position.set(homeFraming?0:.25,homeFraming?2.8:3.15,homeFraming?10.8:9.7);
    controls.target.set(homeFraming?0:.25,2.18,0);controls.update();
  };resetCamera();
  const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();const environment=pmrem.fromScene(room,.07);scene.environment=environment.texture;scene.environmentIntensity=.65;room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfff8e9,0x889b73,1.1));
  const key=new THREE.DirectionalLight(0xfff1db,2.0);key.position.set(-3.5,6,5);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-4,right:4,top:6,bottom:-2,near:.1,far:15});key.shadow.bias=-.001;key.shadow.normalBias=.015;key.shadow.radius=4;scene.add(key);
  const fill=new THREE.DirectionalLight(0xf2f8ff,.7);fill.position.set(4,3,2);scene.add(fill);
  const rim=new THREE.DirectionalLight(0xffdfad,1.4);rim.position.set(0,5,-3);scene.add(rim);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-.033;floor.receiveShadow=true;scene.add(floor);
  const model=await createCharacter();scene.add(model.world);
  const chapters=createStoryTimeline(chapterOrder);
  const clips=createAnimations(chapters);model.world.animations=clips;
  const mixer=new THREE.AnimationMixer(model.world);const actions=Object.fromEntries(clips.map(c=>[c.name,mixer.clipAction(c)]));
  const rate=Number.isFinite(playbackRate)?THREE.MathUtils.clamp(playbackRate,.5,2):1;
  mixer.timeScale=rate;
  let current=actions.Story;current.play();
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let playing=autoplay&&!reducedMotion.matches,visible=true,disposed=false,lastTime=performance.now(),mode='story',elapsed=0;
  mixer.update(0);
  function resize(){const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
  const intersectionObserver=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;lastTime=performance.now();});intersectionObserver.observe(container);
  const onVisibility=()=>{lastTime=performance.now();};document.addEventListener('visibilitychange',onVisibility);
  const onReducedMotion=()=>{if(reducedMotion.matches)playing=false;};reducedMotion.addEventListener('change',onReducedMotion);
  function updateFraming(){
    const rowingWeight=model.rowing.scale.x;
    if(homeFraming){
      // Follow the body centre, not the asymmetric space reserved for scene props.
      const centreX=model.root.position.x;
      camera.position.x=centreX;
      controls.target.x=centreX;
    }
    controls.target.y=2.18-.34*rowingWeight;
    const portrait=homeFraming?camera.aspect<1.35:container.clientWidth<700;
    const minimumFov=homeFraming?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(16))/Math.min(1,camera.aspect))):32;
    const fov=Math.max(minimumFov,32+(portrait?6*rowingWeight:0));
    if(Math.abs(camera.fov-fov)>.00001){camera.fov=fov;camera.updateProjectionMatrix();}
  }
  renderer.setAnimationLoop(now=>{
    if(disposed)return;
    const dt=Math.min((now-lastTime)/1000,.05);lastTime=now;
    if(!visible||document.hidden)return;
    if(playing){mixer.update(dt);elapsed+=dt*rate;}
    updateFraming();
    controls.update();renderer.render(scene,camera);
    onProgress({time:current.time,duration:current.getClip().duration,playing,mode,chapter:mode==='story'?getChapterAt(current.time,chapters):mode});
  });
  const play=(activity='story',{transition=true}={})=>{
    const key=ACTIVITY_CLIPS[activity];
    if(!key)throw new Error(`Unknown activity: ${activity}`);
    const next=actions[key];if(next!==current){
      if(!transition)mixer.stopAllAction();
      next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
      if(transition)current.crossFadeTo(next,1.15,false);
      current=next;mixer.update(0);
    }
    else if(activity==='story')current.time=0;
    mode=activity;playing=true;
  };
  function zoomBy(factor){
    const distance=camera.position.distanceTo(controls.target);
    const nextDistance=THREE.MathUtils.clamp(distance*factor,controls.minDistance,controls.maxDistance);
    camera.position.sub(controls.target).multiplyScalar(nextDistance/distance).add(controls.target);
    controls.update();renderer.render(scene,camera);
  }
  async function exportGLB(){
    // Export from the undeformed hierarchy; animated samples and all hidden props remain in the file.
    const wasPlaying=playing;playing=false;
    const saved=current, savedTime=current.time, savedMode=mode;
    mixer.stopAllAction();mixer.update(0);model.world.updateMatrixWorld(true);
    try{return await new GLTFExporter().parseAsync(model.world,{binary:true,animations:clips,onlyVisible:false,maxTextureSize:2048});}
    finally{current=saved;current.reset().play();current.time=savedTime;mode=savedMode;mixer.update(0);playing=wasPlaying;}
  }
  function dispose(){
    if(disposed)return;disposed=true;renderer.setAnimationLoop(null);resizeObserver.disconnect();intersectionObserver.disconnect();document.removeEventListener('visibilitychange',onVisibility);reducedMotion.removeEventListener('change',onReducedMotion);controls.dispose();mixer.stopAllAction();mixer.uncacheRoot(model.world);
    const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());environment.dispose();renderer.dispose();renderer.domElement.remove();
  }
  return {play,pause:()=>{playing=false;},resume:()=>{playing=true;lastTime=performance.now();},toggle:()=>{playing=!playing;return playing;},zoomIn:()=>zoomBy(.88),zoomOut:()=>zoomBy(1/.88),resetCamera,dispose,exportGLB,
    seek:(time)=>{current.time=THREE.MathUtils.clamp(time,0,current.getClip().duration);mixer.update(0);updateFraming();controls.update();renderer.render(scene,camera);},
    get playing(){return playing;},get mode(){return mode;},get playbackRate(){return rate;},get stats(){return {triangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls};},renderer,scene,model,camera,clips,
  };
}
