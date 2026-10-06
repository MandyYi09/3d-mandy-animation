import * as THREE from 'three';

export const STORY_DURATION = 48;
export const ACTIVITY_CLIPS = { story:'Story', hello:'Hello', tennis:'Tennis', teach:'Learning', rowing:'Rowing', photography:'Photography', idle:'Idle' };
const PERIODS={hello:4,tennis:4,teach:6,rowing:4,photography:6,idle:4};
export const CHAPTERS = [
  { id: 'hello', start: 0, end: 6 },
  { id: 'tennis', start: 6, end: 16 },
  { id: 'teach', start: 16, end: 26 },
  { id: 'rowing', start: 26, end: 38 },
  { id: 'photography', start: 38, end: 48 },
];
const smooth = (t) => t*t*t*(t*(t*6-15)+10);
const tiny = .00001;

function aimArm(pose, side, target) {
  const sign=side==='Left'?-1:1;
  const shoulder=new THREE.Vector3(...pose[`${side}Arm`].p);
  const upperRest=new THREE.Vector3(0,-.46,.018),lowerRest=new THREE.Vector3(0,-.45,.02);
  const l1=upperRest.length(),l2=lowerRest.length();
  const delta=target.clone().sub(shoulder),distance=Math.min(delta.length(),l1+l2-.001),direction=delta.normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
  const pole=new THREE.Vector3(sign*.8,-.5,.05);pole.addScaledVector(direction,-pole.dot(direction)).normalize();
  const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(pole,Math.sqrt(Math.max(0,l1*l1-along*along)));
  const upper=new THREE.Quaternion().setFromUnitVectors(upperRest.normalize(),elbow.clone().sub(shoulder).normalize());
  const lower=new THREE.Quaternion().setFromUnitVectors(lowerRest.normalize(),target.clone().sub(elbow).normalize());
  const localLower=upper.clone().invert().multiply(lower);
  const angles=q=>{const e=new THREE.Euler().setFromQuaternion(q);return [e.x,e.y,e.z];};
  pose[`${side}Arm`].r=angles(upper);pose[`${side}Forearm`].r=angles(localLower);pose[`${side}Hand`].r=[0,0,0];
}

function worldToTorso(point,pose){
  return point.clone().sub(new THREE.Vector3(...pose.MandyRoot.p))
    .applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.MandyRoot.r)).invert())
    .sub(new THREE.Vector3(0,1.56,0))
    .applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.Torso.r)).invert())
    .divide(new THREE.Vector3(...pose.Torso.s));
}

function poseFor(activity, time) {
  const breath = Math.sin(time*Math.PI);
  const pose={
    MandyRoot:{p:[0,.17,0],r:[0,.035*Math.sin(time*Math.PI/2),0]},
    Torso:{r:[0,0,.015*breath],s:[1,1+.006*breath,1]},
    Head:{p:[0,3.18,0],r:[-.012,0,.026*Math.sin(time*Math.PI/2)]},
    LeftArm:{p:[-.36,.75,0],r:[-.10,0,-.17]},RightArm:{p:[.36,.75,0],r:[-.12,0,.17]},
    LeftForearm:{r:[-.12,0,-.06]},RightForearm:{r:[-.12,0,.06]},
    LeftHand:{r:[0,0,0]},RightHand:{r:[0,0,0]},
    LeftLeg:{r:[0,0,-.03]},RightLeg:{r:[0,0,.03]},
    LeftShin:{r:[0,0,0]},RightShin:{r:[0,0,0]},
    LeftFoot:{r:[0,-.06,0]},RightFoot:{r:[0,.06,0]},
    Racket:{s:[tiny,tiny,tiny]},Chalk:{s:[tiny,tiny,tiny]},Glasses:{s:[tiny,tiny,tiny]},
    TeachingBoard:{s:[tiny,tiny,tiny],p:[1.62,2.08,-.69]},
    TennisBall:{s:[tiny,tiny,tiny],p:[-1.3,2.6,.2],r:[0,0,0]},
    DisplayBase:{s:[1,1,1]},RowingRig:{s:[tiny,tiny,tiny],p:[0,0,0]},
    LeftOar:{r:[0,0,0]},RightOar:{r:[0,0,0]},
    CameraProp:{s:[tiny,tiny,tiny],p:[0,.63,.67],r:[0,0,0]},
    ShutterLight:{s:[tiny,tiny,tiny]},
  };
  if(activity==='hello') {
    const wave = Math.sin(time*Math.PI*2);
    pose.MandyRoot.r=[0,.045*Math.sin(time*Math.PI/2),0];
    pose.Head.r=[-.035,.025*Math.sin(time*Math.PI),-.055];
    pose.RightArm.r=[.25,-.1,1.60];
    pose.RightForearm.r=[.10,0,.9+wave*.19];
    pose.RightHand.r=[.08,0,wave*.18];
    pose.LeftForearm.r=[-.3,0,-.14];
  } else if(activity==='tennis') {
    const phase=(time%4)/4;
    const swing=Math.sin(phase*Math.PI*2);
    const hit=Math.max(0,Math.sin((phase-.12)*Math.PI*2));
    pose.MandyRoot.p=[-.13,.19+.045*Math.sin(phase*Math.PI*4),0];
    pose.MandyRoot.r=[.01,.23*swing,-.025*swing];
    pose.Head.r=[.04,-.13*swing,.035*swing];
    pose.Torso.r=[.04,-.13*swing,-.04*swing];
    pose.LeftArm.r=[-.3-hit*.8,-.16+swing*.35,-1.18-hit*.3];
    pose.LeftForearm.r=[-.1-hit*.5,.22,-.20-hit*.16];
    pose.LeftHand.r=[.1,0,-.10];
    pose.RightArm.r=[-.25,.10,.59];
    pose.RightForearm.r=[-.65,0,.16];
    pose.LeftLeg.r=[.08,0,-.18];pose.RightLeg.r=[-.05,0,.16];
    pose.LeftShin.r=[.04+hit*.1,0,0];pose.RightShin.r=[.08,0,0];
    pose.Racket.s=[1,1,1];pose.TennisBall.s=[1,1,1];
    // Forward kinematics locate the actual racket head; the ball returns to that point.
    const travel=(1-Math.cos(phase*Math.PI*2))*.5;
    const contact=new THREE.Vector3(0,-1.18,.06);
    const transform=(rotation,offset)=>contact.applyEuler(new THREE.Euler(...rotation)).add(new THREE.Vector3(...offset));
    transform(pose.LeftHand.r,[0,-.33,0]);
    transform(pose.LeftForearm.r,[0,-.46,.018]);
    transform(pose.LeftArm.r,[-.36,.75,0]);
    contact.multiply(new THREE.Vector3(...pose.Torso.s));
    transform(pose.Torso.r,[0,1.56,0]);transform(pose.MandyRoot.r,pose.MandyRoot.p);
    pose.TennisBall.p=[contact.x+travel*3.8,THREE.MathUtils.lerp(contact.y+.15,.36,travel)+Math.sin(travel*Math.PI)*1.35,THREE.MathUtils.lerp(contact.z+.04,.85,Math.sin(travel*Math.PI))];
    pose.TennisBall.r=[time*Math.PI,time*Math.PI*2,0];
  } else if(activity==='teach') {
    pose.MandyRoot.p=[-.23,.17,0];pose.MandyRoot.r=[0,.07,0];
    pose.Head.r=[-.01,.07+Math.sin(time*Math.PI/3)*.07,-.04];
    pose.RightArm.r=[-.10,.05,1.13];
    pose.RightForearm.r=[-.16,-.12,.87+.12*Math.sin(time*Math.PI/3)];
    pose.RightHand.r=[0,.08,.22];
    pose.LeftArm.r=[-.08,-.1,-.28];pose.LeftForearm.r=[-1.0,0,-.36];
    pose.LeftLeg.r=[0,0,-.04];pose.RightLeg.r=[-.03,0,.07];
    pose.TeachingBoard.s=[1,1,1];pose.TeachingBoard.p=[1.62,2.23,-.69];
    pose.Chalk.s=[1,1,1];pose.Glasses.s=[1,1,1];
  } else if(activity==='rowing') {
    const phase=time/4*Math.PI*2,catchAmount=(1-Math.cos(phase))*.5,bob=.014*Math.sin(phase*2);
    pose.MandyRoot.p=[0,-.54+bob,.16-catchAmount*.20];pose.MandyRoot.r=[0,0,0];
    pose.Torso.r=[-.13+catchAmount*.22,0,0];
    const neck=new THREE.Vector3(0,1.62,0).multiply(new THREE.Vector3(...pose.Torso.s)).applyEuler(new THREE.Euler(...pose.Torso.r)).add(new THREE.Vector3(0,1.56,0));
    pose.Head.p=neck.toArray();pose.Head.r=[pose.Torso.r[0]*.4,0,-.012*Math.sin(phase)];
    for(const [side,s] of [['Left',-1],['Right',1]]){
      pose[`${side}Leg`].r=[-1.25-.55*catchAmount,0,s*.065];
      pose[`${side}Shin`].r=[-.20+1.30*catchAmount,0,0];
      pose[`${side}Foot`].r=[1.45-.75*catchAmount,0,0];
      const oarRotation=[0,s*(.47*Math.cos(phase)-.06),s*.07*Math.sin(phase)];
      pose[`${side}Oar`].r=oarRotation;
      const grip=new THREE.Vector3(-s*.55,.25,0).applyEuler(new THREE.Euler(...oarRotation)).add(new THREE.Vector3(s*.70,1.04+bob,.53));
      aimArm(pose,side,worldToTorso(grip,pose));
    }
    pose.RowingRig.s=[1,1,1];pose.RowingRig.p=[0,bob,-.15];pose.DisplayBase.s=[tiny,tiny,tiny];
  } else if(activity==='photography') {
    const phase=time/6,cycle=(1-Math.cos(phase*Math.PI*2))*.5;
    const lift=smooth(THREE.MathUtils.clamp((cycle-.12)/.62,0,1));
    // Lift the camera forward as well as upward so its viewfinder clears the nose.
    pose.CameraProp.s=[1,1,1];pose.CameraProp.p=[0,.63+lift*.58,.67+lift*.22];
    pose.CameraProp.r=[-.04*(1-lift),.06*Math.sin(phase*Math.PI*2),0];
    pose.MandyRoot.r=[0,-.05*Math.sin(phase*Math.PI*2),0];
    pose.Head.r=[.055*lift,-.03*Math.sin(phase*Math.PI*2),-.02*(1-lift)];
    pose.Torso.r=[0,0,0];
    for(const [side,local] of [['Left',[-.31,-.075,.025]],['Right',[.32,.02,.015]]]){
      const sign=side==='Left'?-1:1;
      pose[`${side}Arm`].p=[sign*.36,.75+lift*.10,lift*.12];
      const grip=new THREE.Vector3(...local).applyEuler(new THREE.Euler(...pose.CameraProp.r)).add(new THREE.Vector3(...pose.CameraProp.p));
      aimArm(pose,side,grip);
    }
    const shutter=Math.exp(-(((phase-.5)/.022)**2));
    pose.ShutterLight.s=[shutter,shutter,shutter].map(v=>Math.max(tiny,v*2));
  }
  return pose;
}

function storyPose(time) {
  time=time%STORY_DURATION;
  const i=CHAPTERS.findIndex(c=>time>=c.start&&time<c.end);
  const current=CHAPTERS[i], next=CHAPTERS[(i+1)%CHAPTERS.length];
  const blendStart=current.end-1.8;
  const a=poseFor(current.id,(time-current.start)%PERIODS[current.id]);
  if(time<blendStart)return a;
  const f=smooth((time-blendStart)/1.8);
  // Hold the incoming local time at zero so the transition lands exactly on its first frame.
  const b=poseFor(next.id,0);
  for(const name of Object.keys(a))for(const channel of Object.keys(a[name])) {
    const aa=a[name][channel],bb=b[name][channel];
    if(channel==='r') {
      const qa=new THREE.Quaternion().setFromEuler(new THREE.Euler(...aa));
      const qb=new THREE.Quaternion().setFromEuler(new THREE.Euler(...bb));
      qa.slerp(qb,f);const e=new THREE.Euler().setFromQuaternion(qa);a[name][channel]=[e.x,e.y,e.z];
    } else a[name][channel]=aa.map((v,j)=>THREE.MathUtils.lerp(v,bb[j],f));
  }
  return a;
}

function sampleClip(name,duration,sampler) {
  const frames=Math.ceil(duration*30),times=[],samples=[];
  for(let i=0;i<=frames;i++){const t=i/frames*duration;times.push(t);samples.push(sampler(i===frames?0:t));}
  const tracks=[];
  for(const target of Object.keys(samples[0]))for(const channel of Object.keys(samples[0][target])) {
    const values=[];let prev=null;
    for(const sample of samples){const data=sample[target][channel];if(channel==='r'){
      const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...data));
      if(prev&&prev.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);
      values.push(...q.toArray());prev=q;
    }else values.push(...data);}
    const property={r:'quaternion',s:'scale',p:'position'}[channel];
    const Track=channel==='r'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack;
    tracks.push(new Track(`${target}.${property}`,times,values));
  }
  return new THREE.AnimationClip(name,duration,tracks).optimize();
}

export function createAnimations(){
  return [sampleClip('Story',STORY_DURATION,storyPose),...Object.entries(PERIODS).map(([id,period])=>sampleClip(ACTIVITY_CLIPS[id],period,t=>poseFor(id,t)))];
}

export function getChapterAt(time){
  const t=time%STORY_DURATION;return CHAPTERS.find(c=>t>=c.start&&t<c.end)?.id||'hello';
}
