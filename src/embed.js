import { createMandyExperience } from './experience.js';
import { ACTIVITY_CLIPS } from './animation.js';

const params=new URLSearchParams(location.search);
const notifyParent=event=>{if(parent!==window)parent.postMessage({type:'mandy',event},location.origin);};
(async()=>{
try{
  const experience=await createMandyExperience(document.querySelector('#viewer'),{
    transparent:true,autoplay:params.get('autoplay')!=='0',
    playbackRate:params.has('speed')?Number(params.get('speed')):1,
    interactive:params.get('presentation')!=='home',
    framing:params.get('presentation')==='home'?'home':'scene',
  });
  const activity=params.get('activity');if(Object.hasOwn(ACTIVITY_CLIPS,activity)){experience.play(activity,{transition:false});if(params.get('autoplay')==='0'||matchMedia('(prefers-reduced-motion: reduce)').matches)experience.pause();}
  window.mandy=experience;
  // Same-origin parents may explicitly control an embedded character.
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='mandy')return;const {action,activity}=event.data;
    if(action==='play'&&Object.hasOwn(ACTIVITY_CLIPS,activity))experience.play(activity);
    if(action==='pause')experience.pause();if(action==='resume')experience.resume();if(action==='reset')experience.resetCamera();
  });
  notifyParent('ready');
}catch(error){console.error(error);document.querySelector('#viewer').innerHTML='<p id="error">Please enable WebGL to see Mandy in 3D.</p>';notifyParent('error');}
})();
