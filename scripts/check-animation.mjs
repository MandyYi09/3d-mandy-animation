import assert from 'node:assert/strict';
import { createAnimations, getChapterAt, CHAPTERS, STORY_DURATION } from '../src/animation.js';

const clips = createAnimations();
assert.equal(clips.length, 7);
assert.deepEqual(clips.map(c=>c.name), ['Story','Hello','Tennis','Learning','Rowing','Photography','Idle']);
for (const clip of clips) {
  assert.ok(clip.validate(), `${clip.name} contains invalid animation data`);
  for (const track of clip.tracks) {
    const width = track.getValueSize();
    const first = [...track.values.slice(0,width)];
    const last = [...track.values.slice(-width)];
    if(track.name.endsWith('quaternion')) {
      assert.ok(Math.abs(Math.abs(first.reduce((sum,v,i)=>sum+v*last[i],0))-1)<.0001,`${clip.name}/${track.name} does not loop`);
    } else first.forEach((v,i)=>assert.ok(Math.abs(v-last[i])<.0001,`${clip.name}/${track.name} does not loop`));
    assert.ok([...track.values].every(Number.isFinite));
  }
}
for(const chapter of CHAPTERS)assert.equal(getChapterAt(chapter.start),chapter.id);
assert.equal(getChapterAt(STORY_DURATION),'hello');
// The story must approach each new activity without a pose discontinuity.
const story=clips[0];
for (const {end:time} of CHAPTERS) {
  for (const track of story.tracks) {
    const interpolant=track.createInterpolant();
    const a=[...interpolant.evaluate(time-.001)],b=[...interpolant.evaluate(time===STORY_DURATION?0:time)];
    const delta=track.name.endsWith('quaternion')
      ? 2*Math.acos(Math.min(1,Math.abs(a.reduce((sum,v,i)=>sum+v*b[i],0))))
      : Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
    assert.ok(delta<.015,`Discontinuity at ${time}s in ${track.name}: ${delta}`);
  }
}
console.log('All seven clips are valid, finite, and seamless at the loop boundary. All five story transitions are continuous.');
