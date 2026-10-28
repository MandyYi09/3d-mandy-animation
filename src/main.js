import './style.css';
import { createMandyExperience } from './experience.js';

const $=(s)=>document.querySelector(s);
const labels={
  hello:{title:'Hey, I’m Mandy.'},
  tennis:{title:'Game, set, Mandy.'},
  teach:{title:'Stay curious.'},
  rowing:{title:'Find my rhythm.'},
  photography:{title:'A different perspective.'},
};
const pauseIcon='<svg viewBox="0 0 20 20"><path d="M7 5v10M13 5v10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
const playIcon='<svg viewBox="0 0 20 20"><path d="m7 4 9 6-9 6z" fill="currentColor"/></svg>';
let lastChapter,lastPlaying;
const format=t=>`00:${Math.floor(t).toString().padStart(2,'0')}`;
(async()=>{
try{
  const experience=await createMandyExperience($('#viewer'),{onProgress:({time,duration,playing,mode,chapter})=>{
    $('#progress-fill').style.width=`${time/duration*100}%`;
    $('#player-time').textContent=`${format(time)} / ${format(duration)}`;
    $('.progress-track').setAttribute('aria-valuenow',time.toFixed(1));$('.progress-track').setAttribute('aria-valuemax',duration);
    if(lastPlaying!==playing){$('#play-toggle').innerHTML=playing?pauseIcon:playIcon;$('#play-toggle').setAttribute('aria-label',playing?'Pause animation':'Play animation');lastPlaying=playing;}
    if(lastChapter!==chapter&&labels[chapter]){
      document.querySelectorAll('[data-activity]').forEach(button=>{const active=button.dataset.activity===chapter;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active);});lastChapter=chapter;
    }
  }});
  window.mandy=experience;
  $('#loader').classList.add('hidden');
  document.querySelectorAll('[data-activity]').forEach(button=>button.addEventListener('click',()=>{
    experience.play(button.dataset.activity);$('#sequence-button').classList.remove('active');$('#sequence-button').setAttribute('aria-pressed','false');
    $('#player-title').textContent=labels[button.dataset.activity].title;$('#player-caption').textContent='ONE LITTLE MOMENT · ON REPEAT';
  }));
  $('#sequence-button').addEventListener('click',()=>{experience.play('story');$('#sequence-button').classList.add('active');$('#sequence-button').setAttribute('aria-pressed','true');$('#player-title').textContent='A day in my little world';$('#player-caption').textContent='HELLO → TENNIS → LEARN → ROWING → PHOTO';});
  $('#play-toggle').addEventListener('click',()=>experience.toggle());$('#reset-view').addEventListener('click',experience.resetCamera);
  $('#zoom-in').addEventListener('click',experience.zoomIn);$('#zoom-out').addEventListener('click',experience.zoomOut);
}catch(error){console.error(error);$('#loader').innerHTML='<span class="loader-flower">✳</span><p>The 3D scene couldn’t load. Please refresh in a browser with WebGL enabled.</p>';}
})();
