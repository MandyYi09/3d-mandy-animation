import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (p) => new THREE.Vector3(...p);
// Lower the forehead edge; the crown keeps its independently defined height.
const lowerHairlineProfile = y => y - .20 * THREE.MathUtils.smoothstep(y,3.38,4.25);
const sphereGeometry = new THREE.SphereGeometry(1, 32, 24);
const materials = {};
function mat(color, roughness = .6, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  return materials[key] ||= new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  skin: mat('#e9b17e', .75), skinShadow: mat('#cd976b'), cream: mat('#f3eedf', .88),
  white: mat('#fff9ec', .67), burgundy: mat('#752b36', .6), navy: mat('#293343', .91),
  navyLight: mat('#344051', .95), hair: mat('#211b19', .65), hair2: mat('#29221f', .69),
  hair3: mat('#2d2521', .70), hairLine: mat('#382d25', .75), sole: mat('#dedacb', .8),
  gold: mat('#bd9860', .35, .5), black: mat('#292924', .38), green: mat('#bdd14e', .95),
  wood: mat('#b18353', .79), chalk: mat('#eeeade', .95), board: mat('#304439', .92),
};

function mesh(parent, geo, material, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const obj = new THREE.Mesh(geo, material);
  obj.position.set(...pos); obj.scale.set(...scale); obj.castShadow = true; obj.receiveShadow = true;
  parent.add(obj); return obj;
}
function ellipsoid(parent, pos, scale, material) { return mesh(parent, sphereGeometry, material, pos, scale); }
function group(parent, name, pos = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...pos); parent.add(g); return g;
}
function box(parent, pos, scale, material, radius = .04) {
  return mesh(parent, new RoundedBoxGeometry(...scale, 3, radius), material, pos);
}
function curve(parent, points, radius, material, segments = 28) {
  const path = new THREE.CatmullRomCurve3(points.map(V));
  return mesh(parent, new THREE.TubeGeometry(path, segments, radius, 6, false), material);
}
function rod(parent, a, b, r1, r2, material) {
  const start = V(a), end = V(b), delta = end.clone().sub(start);
  const m = mesh(parent, new THREE.CylinderGeometry(r2, r1, delta.length(), 20), material, start.clone().add(end).multiplyScalar(.5).toArray());
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return m;
}
function disc(parent, pos, radius, depth, material) {
  return mesh(parent, new THREE.CylinderGeometry(radius, radius, depth, 64), material, pos);
}
function shapeMesh(parent, points, material, depth = .025) {
  const shape = new THREE.Shape(); points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  return mesh(parent, new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: .007, bevelSize: .006, bevelSegments: 2, steps: 1 }), material);
}

// Image-space outline follows the visible skin in the supplied frontal portrait.
// UVs preserve the original facial features instead of replacing them with generic eyes/lips.
function referenceFace(texture) {
  const outline = [[237,582,604],[255,566,630],[280,551,649],[310,528,667],[340,504,680],[365,482,700],[390,451,711],[415,427,719],[440,416,724],[465,417,722],[490,422,717],[515,432,708],[540,449,690],[560,474,666],[578,515,630],[587,539,609],[590,551,598],[593,571,581]];
  const rowCount = 92, colCount = 72, positions = [], uvs = [], indices = [];
  for (let row = 0; row <= rowCount; row++) {
    const py = 237 + row / rowCount * 356;
    let k = 0; while (k < outline.length - 2 && outline[k + 1][0] < py) k++;
    const a = outline[k], b = outline[k + 1], f = (py - a[0]) / (b[0] - a[0]);
    const left = THREE.MathUtils.lerp(a[1], b[1], f), right = THREE.MathUtils.lerp(a[2], b[2], f);
    for (let col = 0; col <= colCount; col++) {
      const u = col / colCount, px = THREE.MathUtils.lerp(left, right, u);
      const x = (px - 580) / 285, y = 3.25 + (420 - py) / 285;
      // Fit the portrait to one head-sized ellipsoid. Normalising the depth
      // to each row's hairline width made the forehead a separate wedge and
      // pinched the temples when viewed from above.
      const headX=x/.70, headY=(y-3.29)/.83;
      let z=.015+.56*Math.sqrt(Math.max(.025,1-headX*headX-headY*headY));
      const bump = (cx, cy, rx, ry, height) => height * Math.exp(-(((px - cx) / rx) ** 2) - ((py - cy) / ry) ** 2);
      z += bump(579, 490, 29, 33, .14) + bump(581, 541, 42, 17, .033);
      z += bump(488, 435, 42, 29, .025) + bump(658, 433, 42, 29, .025);
      positions.push(x, y - 3.18, z); uvs.push(px / 1122, 1 - py / 1402);
      if (row < rowCount && col < colCount) { const n = row * (colCount + 1) + col; indices.push(n, n + colCount + 1, n + 1, n + 1, n + colCount + 1, n + colCount + 2); }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(indices); geo.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  return new THREE.Mesh(geo, material);
}

// Stitch the sides and back directly to the portrait's existing boundary.
// A separate sphere protrudes through the narrow temples and leaves a dark rim at the jaw.
function buildHeadShell(head, face) {
  const front = face.geometry.getAttribute('position');
  const uv = face.geometry.getAttribute('uv');
  const source = face.material.map.image;
  const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext('2d'); context.drawImage(source, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const colourAt = index => {
    const x = uv.getX(index) * canvas.width - .5, y = (1 - uv.getY(index)) * canvas.height - .5;
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const rgb = [0, 0, 0];
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const offset = ((iy + j) * canvas.width + ix + i) * 4;
      const weight = (i ? fx : 1 - fx) * (j ? fy : 1 - fy);
      for (let c = 0; c < 3; c++) rgb[c] += pixels[offset + c] * weight / 255;
    }
    return new THREE.Color().setRGB(...rgb, THREE.SRGBColorSpace);
  };
  const rows = 92, frontStride = 73, sides = 48, positions = [], colours = [], indices = [];
  for (let row = 0; row <= rows; row++) {
    const left = new THREE.Vector3().fromBufferAttribute(front, row * frontStride);
    const right = new THREE.Vector3().fromBufferAttribute(front, row * frontStride + frontStride - 1);
    const leftColour = colourAt(row * frontStride), rightColour = colourAt(row * frontStride + frontStride - 1);
    const halfWidth = (right.x - left.x) / 2, center = (left.x + right.x) / 2;
    const depth = halfWidth * 1.05 + .10 * Math.pow(Math.sin(Math.PI * row / rows), .5);
    for (let col = 0; col <= sides; col++) {
      const angle = col / sides * Math.PI;
      positions.push(center - halfWidth * Math.cos(angle), left.y,
        THREE.MathUtils.lerp(left.z, right.z, col / sides) - depth * Math.sin(angle));
      colours.push(...leftColour.clone().lerp(rightColour, col / sides).toArray());
      if (row < rows && col < sides) {
        const n = row * (sides + 1) + col;
        indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1);
      }
    }
  }
  // Close the small crown/chin strips between the front and rear surfaces.
  for (const row of [0, rows]) {
    const rim = [];
    for (let col = 0; col < frontStride; col++) {
      rim.push(positions.length / 3);
      positions.push(front.getX(row * frontStride + col), front.getY(row * frontStride + col), front.getZ(row * frontStride + col));
      colours.push(...colourAt(row * frontStride + col).toArray());
    }
    for (let col = sides - 1; col > 0; col--) rim.push(row * (sides + 1) + col);
    const center = new THREE.Vector3();
    for (const n of rim) center.add(new THREE.Vector3().fromArray(positions, n * 3));
    center.divideScalar(rim.length);
    const middle = positions.length / 3; positions.push(...center.toArray());
    const colour = new THREE.Color(0, 0, 0);
    for (const n of rim) colour.add(new THREE.Color().fromArray(colours, n * 3));
    colours.push(...colour.multiplyScalar(1 / rim.length).toArray());
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i], b = rim[(i + 1) % rim.length];
      indices.push(middle, row === 0 ? a : b, row === 0 ? b : a);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  mesh(head, geo, new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false})).name = 'HeadShell';
}

// One continuous scalp surface meets the portrait's actual hairline. The part
// runs front-to-back through this mesh, instead of stacking separate root caps
// over the photographed part. The same surface continues down to the tips.
function buildHairCrown(hair, face) {
  const across = 128, along = 96, stride = along + 1;
  const positions = [], colors = [], indices = [], uvs = [];
  const front = face.geometry.getAttribute('position');
  const sections = [-1, 1].map(side => [
    [[.035,3.892,.24],[side*.22,3.74,.24],[side*.45,3.43,.24],[side*.58,3.19,.24],
      [side*.63,2.92,.28],[side*.72,2.58,.30],[side*.59,2.18,.23]],
    [[.035,4.13,.30],[side*.27,4.035,.43],[side*.52,3.72,.46],[side*.68,3.18,.34],
      [side*.68,2.92,.30],[side*.78,2.58,.30],[side*.68,2.14,.20]],
    [[.015,4.28,-.10],[side*.35,4.20,-.02],[side*.66,3.89,.035],[side*.79,3.17,.015],
      [side*.76,2.90,.01],[side*.84,2.55,.015],[side*.71,2.13,-.02]],
    [[0,4.10,-.50],[side*.35,4.02,-.49],[side*.65,3.70,-.50],[side*.77,3.15,-.38],
      [side*.73,2.90,-.36],[side*.81,2.54,-.32],[side*.66,2.17,-.28]],
    [[0,3.48,-.69],[side*.30,3.48,-.67],[side*.58,3.40,-.60],[side*.69,3.14,-.47],
      [side*.68,2.90,-.47],[side*.72,2.54,-.44],[side*.60,2.17,-.38]],
    [[0,2.17,-.49],[side*.12,2.18,-.49],[side*.25,2.18,-.47],[side*.37,2.18,-.45],
      [side*.46,2.17,-.42],[side*.55,2.15,-.38],[side*.60,2.14,-.34]],
  ].map(points => new THREE.CatmullRomCurve3(points.map(V))));
  const hairline = u => {
    if (Math.abs(u) <= .0225) {
      const col = Math.round((u / .0225 + 1) * 36);
      return new THREE.Vector3().fromBufferAttribute(front, col).add(new THREE.Vector3(0,3.18,0));
    }
    if (Math.abs(u) > .5) return sections[u < 0 ? 0 : 1][0].getPoint(Math.abs(u));
    const row = (Math.abs(u) - .0225) / .4775 * 52;
    const lo = Math.floor(row), hi = Math.min(52, lo + 1), side = u < 0 ? 0 : 72;
    return new THREE.Vector3().fromBufferAttribute(front,lo*73+side)
      .lerp(new THREE.Vector3().fromBufferAttribute(front,hi*73+side),row-lo).add(new THREE.Vector3(0,3.18,0));
  };
  for (let i = 0; i <= across; i++) {
    const u = i / across * 2 - 1, width = Math.abs(u);
    const anchors = sections[u < 0 ? 0 : 1].map(section => section.getPoint(width));
    anchors[0] = hairline(u);
    const sweep = new THREE.CatmullRomCurve3(anchors);
    for (let j = 0; j <= along; j++) {
      const v = j / along, point = sweep.getPoint(v);
      // Shallow flowing relief is part of the scalp itself: no raised tube roots.
      const flow = THREE.MathUtils.lerp(v * Math.PI * 28 + width * 2.5, point.x * Math.PI * 28 + Math.sin(point.y*5)*.4, THREE.MathUtils.smoothstep(v,.42,.76));
      const relief = (.015 * Math.cos(flow) + .0018 * Math.cos(flow*5.3)) * Math.sin(Math.PI*v) * Math.sin(Math.PI*Math.min(.5,width));
      point.y += relief;
      point.z += relief * Math.sin(Math.PI*v);
      // A narrow recessed part, fading precisely into the original hairline.
      const part = Math.exp(-((u/.022)**2)) * Math.sin(Math.PI*Math.min(1,v/.8));
      point.y -= .018*part;
      point.y += .025 * Math.cos(v*Math.PI*18 + .6) * THREE.MathUtils.smoothstep(width,.84,1);
      point.x += Math.sign(u) * .012 * Math.sin(flow) * THREE.MathUtils.smoothstep(width,.55,.85);
      positions.push(...point.toArray());
      uvs.push(i/across,j/along);
      const tint = 1 - .4*part + .07*Math.cos(flow)*Math.sin(Math.PI*v);
      colors.push(tint,tint,tint);
      if (i < across && j < along) {
        const n=i*stride+j; indices.push(n,n+stride,n+1,n+1,n+stride,n+stride+1);
      }
    }
  }
  // Lower only the frontal hairline, easing out before reaching the crown.
  // Keep the original projection coordinates so the strands move with the mesh.
  const projectionPositions = [...positions];
  const cheekFullness=y=>THREE.MathUtils.smoothstep(y,2.48,2.88)*(1-THREE.MathUtils.smoothstep(y,3.16,3.52));
  for (let i=0;i<positions.length/3;i++) {
    const v=(i%stride)/along, y=positions[i*3+1];
    const hairlineWeight=1-THREE.MathUtils.smoothstep(v,0,.32);
    positions[i*3+1]=THREE.MathUtils.lerp(y,lowerHairlineProfile(y),hairlineWeight);
    // Bring the leading edge toward the cheeks while rounding the outer side.
    // Fade in below the temple so the existing forehead boundary stays joined.
    const width=Math.abs(Math.floor(i/stride)/across*2-1);
    const fullness=cheekFullness(y)*THREE.MathUtils.smoothstep(width,.48,.60);
    const inner=1-THREE.MathUtils.smoothstep(v,0,.16);
    const outer=THREE.MathUtils.smoothstep(v,0,.16)*(1-THREE.MathUtils.smoothstep(v,.60,.80));
    positions[i*3]+=Math.sign(positions[i*3])*fullness*(-.10*inner+.06*outer);
    positions[i*3+2]+=.045*fullness*(1-THREE.MathUtils.smoothstep(v,.42,.65));
    // Lift the lengths behind the ears into a soft, rounded silhouette.
    // Fade to zero at the portrait seam and crown so the roots stay joined.
    const earVolume=THREE.MathUtils.smoothstep(y,2.30,2.82)
      *(1-THREE.MathUtils.smoothstep(y,3.35,3.85));
    const sideVolume=THREE.MathUtils.smoothstep(width,.30,.65);
    const behindEar=THREE.MathUtils.smoothstep(v,.06,.27)
      *(1-THREE.MathUtils.smoothstep(v,.78,.98));
    positions[i*3]+=Math.sign(positions[i*3])*.055*earVolume*sideVolume*behindEar;
    positions[i*3+2]-=.065*earVolume*THREE.MathUtils.smoothstep(v,.28,.55)
      *(1-THREE.MathUtils.smoothstep(v,.85,1));
    // Shape a single S curl into the continuous lengths: an inward neck,
    // a rounded lower bend, then a returning tip. UVs follow the same surface.
    const curlWeight=(1-THREE.MathUtils.smoothstep(y,2.60,2.96))
      *THREE.MathUtils.smoothstep(Math.abs(positions[i*3]),.38,.62);
    const curlPhase=(2.92-y)*9.6+v*.40+(positions[i*3]<0?.12:0);
    positions[i*3]-=Math.sign(positions[i*3])*curlWeight*.085*Math.sin(curlPhase);
    positions[i*3+2]+=curlWeight*.045*Math.cos(curlPhase);

    // A modest, even increase in volume below the crown. Keep the portrait
    // seam fixed; let the free lengths and back expand with their existing curl.
    const lowerVolume=1-THREE.MathUtils.smoothstep(y,3.35,3.92);
    const freeSurface=THREE.MathUtils.smoothstep(v,0,.15);
    const freeEnds=1-THREE.MathUtils.smoothstep(y,2.98,3.20);
    const volume=lowerVolume*Math.max(freeSurface,freeEnds);
    positions[i*3]*=1+.075*volume;
    positions[i*3+2]=-.10+(positions[i*3+2]+.10)*(1+.10*volume);

    // Sweep the intact front edge away from the cheek at ear height.
    // Only the hanging edge moves; the attached temple seam stays in place.
    const earSweep=THREE.MathUtils.smoothstep(y,2.64,3.00)
      *(1-THREE.MathUtils.smoothstep(y,3.12,3.46))
      *THREE.MathUtils.smoothstep(width,.50,.60)
      *(1-THREE.MathUtils.smoothstep(v,.12,.38));
    positions[i*3]+=Math.sign(positions[i*3])*.078*earSweep;
    positions[i*3+2]-=.075*earSweep;


  }
  // Close the scalp behind the visible surface; all perimeter edges are shared.
  const count = positions.length / 3;
  for (let i=0;i<count;i++) {
    const thickness=cheekFullness(positions[i*3+1])*THREE.MathUtils.smoothstep(Math.abs(positions[i*3]),.48,.65);
    positions.push(positions[i*3]*.96-Math.sign(positions[i*3])*.025*thickness,
      positions[i*3+1]-.035,positions[i*3+2]-.025-.035*thickness);
    colors.push(.7,.7,.7);uvs.push(uvs[i*2],uvs[i*2+1]);
  }
  const outer = [...indices];
  for (let i=0;i<outer.length;i+=3) indices.push(outer[i]+count,outer[i+2]+count,outer[i+1]+count);
  const rim = [];
  for(let j=0;j<=along;j++)rim.push(j);
  for(let i=1;i<=across;i++)rim.push(i*stride+along);
  for(let j=along-1;j>=0;j--)rim.push(across*stride+j);
  for(let i=across-1;i>0;i--)rim.push(i*stride);
  for(let i=0;i<rim.length;i++) {
    const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,b,b+count,a,b+count,a+count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  // Project the reference strands onto the same curved scalp, fading into
  // flowing strand colour around the back. There is no second hairline plane.
  const source=face.material.map.image, sourceCanvas=document.createElement('canvas');
  sourceCanvas.width=source.width;sourceCanvas.height=source.height;
  const sourceContext=sourceCanvas.getContext('2d');sourceContext.drawImage(source,0,0);
  const pixels=sourceContext.getImageData(0,0,source.width,source.height).data;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=1024;
  const context=canvas.getContext('2d'), atlas=context.createImageData(1024,1024);
  for(let y=0;y<1024;y++)for(let x=0;x<1024;x++) {
    const u=x/1023, v=1-y/1023, fi=u*across, fj=v*along;
    const i=Math.min(across-1,Math.floor(fi)),j=Math.min(along-1,Math.floor(fj));
    const a=fi-i,b=fj-j;
    const interpolate=(values,axis)=>THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(values[(i*stride+j)*3+axis],values[((i+1)*stride+j)*3+axis],a),
      THREE.MathUtils.lerp(values[(i*stride+j+1)*3+axis],values[((i+1)*stride+j+1)*3+axis],a),b);
    const coord=axis=>interpolate(positions,axis);
    const projected=axis=>interpolate(projectionPositions,axis);
    // The fuller cheek section needs hair samples outside the portrait's ears.
    const side=Math.sign(u-.5), cheekSample=22*cheekFullness(projected(1));
    const px=THREE.MathUtils.clamp(Math.round(580+projected(0)*285+side*(2+cheekSample)),0,source.width-1);
    const py=THREE.MathUtils.clamp(Math.round(420-(projected(1)-3.25)*285-3),0,source.height-1);
    const sample=(py*source.width+px)*4, out=(y*1024+x)*4;
    const flow=THREE.MathUtils.lerp(v*Math.PI*64+Math.abs(u-.5)*3,coord(0)*Math.PI*76+Math.sin(coord(1)*5+coord(0)*2)*.5,THREE.MathUtils.smoothstep(v,.42,.76));
    // At the ends, follow the surface's lengthwise strand coordinates rather
    // than projecting the portrait's bright crosswise curl highlights.
    const variation=1+.075*Math.sin(flow)+.04*Math.sin(flow*4.7)+.018*Math.sin(flow*13.1)
      +.025*Math.sin(flow*.43+Math.abs(u-.5)*4);
    const referenceLength=THREE.MathUtils.smoothstep(projected(1),2.70,3.22);
    let blend=(1-THREE.MathUtils.smoothstep(v,.22,.42))*referenceLength;
    const r=pixels[sample],g=pixels[sample+1],bColour=pixels[sample+2];
    if((r>210&&g>210&&bColour>200)||(r>55&&r>g*1.5&&r>bColour*2))blend=0;
    for(let c=0;c<3;c++)atlas.data[out+c]=THREE.MathUtils.lerp([43,36,31][c]*variation,pixels[sample+c],blend);
    atlas.data[out+3]=255;
  }
  context.putImageData(atlas,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,color:'#808080',roughness:.72,
    emissiveMap:texture,emissive:'#ffffff',emissiveIntensity:.6,vertexColors:true});
  mesh(hair,geometry,material).name='HairCrown';
}

function buildHair(head, face) {
  const hair = group(head, 'Hair', [0, -3.18, 0]);
  buildHairCrown(hair, face);
  // Keep the volume at ear height, then gather the continuous lengths
  // toward the shoulders together so the ends cannot flare beyond the roots.
  hair.traverse(object => {
    if (!object.isMesh) return;
    const positions = object.geometry.getAttribute('position');
    for (let i=0;i<positions.count;i++) {
      const gather=1-THREE.MathUtils.smoothstep(positions.getY(i),2.18,3.13);
      positions.setX(i,positions.getX(i)*(1-.055*gather));
      positions.setZ(i,-.10+(positions.getZ(i)+.10)*(1-.06*gather));
    }
    positions.needsUpdate=true;
    object.geometry.computeVertexNormals();
  });
  // The portrait and its stitched shell share the same upper boundary as the
  // hair. Moving that boundary together avoids overlaps or a floating fringe.
  for(const object of [face,head.getObjectByName('HeadShell')]) {
    const positions=object.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)positions.setY(i,lowerHairlineProfile(positions.getY(i)+3.18)-3.18);
    positions.needsUpdate=true;object.geometry.computeVertexNormals();
  }
  return hair;
}

function buildShoe(parent) {
  ellipsoid(parent, [0, .095, .10], [.225, .10, .36], M.sole);
  ellipsoid(parent, [0, .14, .10], [.227, .06, .362], M.burgundy);
  ellipsoid(parent, [0, .20, .07], [.22, .125, .35], M.white);
  ellipsoid(parent, [0, .265, -.04], [.183, .17, .21], M.cream);
  box(parent, [0, .31, .105], [.20,.11,.26], M.white, .035);
  for (let i = 0; i < 4; i++) {
    const z = .055 + i * .054;
    curve(parent, [[-.085,.37-i*.014,z],[0,.39-i*.014,z+.009],[.085,.37-i*.014,z]], .012, M.sole, 8);
  }
  curve(parent, [[-.16,.24,.28],[0,.275,.38],[.16,.24,.28]], .004, M.sole, 16);
}

function buildHand(parent, name, side) {
  const hand = group(parent, name, [0, -.45, 0]);
  ellipsoid(hand, [0, -.07, .01], [.112, .145, .065], M.skin);
  for (let i = 0; i < 4; i++) {
    const x = side * (.077 - i * .048), length = [.125,.16,.17,.13][i];
    rod(hand, [x,-.13,.01], [x*1.15,-.13-length,.015], .025, .02, M.skin);
    ellipsoid(hand, [x*1.15,-.13-length,.015], [.022,.024,.024], M.skin);
  }
  rod(hand, [side*.075,-.045,.016], [side*.15,-.14,.055], .043,.033,M.skin);
  ellipsoid(hand, [side*.15,-.14,.055], [.033,.033,.033], M.skin);
  return hand;
}

function buildRacket(hand) {
  const racket = group(hand, 'Racket', [0, -.17, .06]);
  const assembly = group(racket, 'RacketAssembly'); assembly.rotation.z = Math.PI;
  rod(assembly,[0,-.08,0],[0,.43,0],.043,.037,M.cream);
  for(let i=0;i<8;i++) { const ring=mesh(assembly,new THREE.TorusGeometry(.041,.0028,5,16),M.sole,[0,i*.047,0]);ring.rotation.x=Math.PI/2; }
  rod(assembly,[0,.42,0],[-.17,.70,0],.023,.021,M.black); rod(assembly,[0,.42,0],[.17,.70,0],.023,.021,M.black);
  const frame=mesh(assembly,new THREE.TorusGeometry(.34,.024,8,60),M.black,[0,1.01,0],[1,1.34,1]);
  mesh(assembly,new THREE.TorusGeometry(.308,.009,6,60),M.cream,[0,1.01,0],[1,1.38,1]);
  for(let i=-5;i<=5;i++) {
    const x=i*.052, h=Math.sqrt(.30*.30-x*x)*1.38;
    rod(assembly,[x,1.01-h,0],[x,1.01+h,0],.0026,.0026,M.cream);
  }
  for(let i=-7;i<=7;i++) {
    const y=i*.052, w=Math.sqrt(Math.max(0,.30*.30-(y/1.38)**2));
    rod(assembly,[-w,1.01+y,.001],[w,1.01+y,.001],.0026,.0026,M.cream);
  }
  return racket;
}

function boardLabel(parent,text,x,y,size,color='#eeecda',width=512) {
  const canvas=document.createElement('canvas'); canvas.width=width;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.font=`500 ${size}px Georgia`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,width/2,68);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
  return mesh(parent,new THREE.PlaneGeometry(width/512*1.5,.375),m,[x,y,.079]);
}

function buildBoard(world) {
  const board = group(world,'TeachingBoard',[1.62,2.23,-.69]);
  board.rotation.y=-.14;
  box(board,[0,0,0],[1.77,1.53,.10],M.wood,.055);
  box(board,[0,.015,.058],[1.62,1.36,.025],M.board,.022);
  rod(board,[-.61,-.6,-.01],[-.72,-2.18,.03],.033,.043,M.wood);
  rod(board,[.61,-.6,-.01],[.72,-2.18,.03],.033,.043,M.wood);
  box(board,[0,-.65,.15],[1.76,.08,.29],M.wood,.014);
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1000;
  const ctx=canvas.getContext('2d');ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineCap='round';ctx.lineJoin='round';
  const ink='#eee8d6',yellow='#e5ca92',blue='#b8d7da',green='#c6d6ac',rose='#ddb6ad';
  const write=(text,x,y,size=44,color=ink)=>{ctx.fillStyle=color;ctx.font=`italic ${size}px Georgia`;ctx.fillText(text,x,y);};
  const line=(points,color=ink,width=4)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  // Loose classroom notes: four subjects, each with actual content rather than a slogan.
  write('Maths',290,103,65);write('f(x) = x²',295,188,44,yellow);
  line([[100,405],[475,405]]);line([[285,443],[285,231]]);
  const parabola=[];for(let x=-150;x<=150;x+=6)parabola.push([285+x,395-x*x*.0064]);line(parabola,yellow,5);
  write('x',489,419,27);write('y',267,236,27);
  write('Science',871,103,65);ctx.strokeStyle=blue;ctx.lineWidth=4;
  for(const angle of [0,Math.PI/3,-Math.PI/3]){ctx.beginPath();ctx.ellipse(872,286,157,55,angle,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle=yellow;ctx.beginPath();ctx.arc(872,286,16,0,Math.PI*2);ctx.fill();write('E = mc²',872,433,40,blue);
  write('Art & design',294,598,59);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.strokeStyle=[rose,yellow,green,blue,green,rose][i];ctx.lineWidth=15;ctx.beginPath();ctx.arc(218,787,84,a,a+.8);ctx.stroke();}
  line([[355,856],[415,710],[480,856],[355,856]],green,5);line([[350,891],[484,891]],ink,3);write('form + colour',299,949,34,rose);
  write('Economics',880,598,59);line([[688,684],[688,918],[1085,918]]);
  line([[721,869],[1015,691]],yellow,5);line([[721,695],[1020,876]],blue,5);
  ctx.fillStyle=ink;ctx.beginPath();ctx.arc(868,780,9,0,Math.PI*2);ctx.fill();
  write('S',1044,687,30,yellow);write('D',1047,879,30,blue);write('P',670,673,29);write('Q',1106,926,29);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const lettering=mesh(board,new THREE.PlaneGeometry(1.59,1.325),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}),[0,.013,.078]);
  lettering.name='ClassroomNotes';
  return board;
}

function buildRowingRig(world) {
  const rig=group(world,'RowingRig');
  const water=mat('#94c5cb',.3);const shell=mat('#a66d3f',.43);const trim=mat('#f0d6a3',.6);const metal=mat('#adb9b6',.36,.55);
  ellipsoid(rig,[0,.015,.1],[1.7,.034,2.18],water);
  for(const s of [-1,1])for(let i=0;i<3;i++)curve(rig,[[s*(.85+i*.20),.052,-.75],[s*(1.05+i*.18),.054,-.2],[s*(1.08+i*.15),.052,.40]],.008,M.cream,18);
  const positions=[],indices=[],rings=40,sides=20;
  for(let i=0;i<=rings;i++){
    const t=i/rings,width=.53*Math.pow(Math.sin(Math.PI*t),.66)+.008,z=(t-.5)*3.7;
    for(let j=0;j<=sides;j++){
      const a=j/sides*Math.PI;positions.push(Math.cos(a)*width,.57-.34*Math.sin(a),z);
      if(i<rings&&j<sides){const n=i*(sides+1)+j;indices.push(n,n+1,n+sides+1,n+1,n+sides+2,n+sides+1);}
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const hullMaterial=shell.clone();hullMaterial.side=THREE.DoubleSide;mesh(rig,geometry,hullMaterial);
  for(const s of [-1,1]){
    const rim=[];for(let i=0;i<=40;i++){const t=i/40;rim.push([s*(.53*Math.pow(Math.sin(Math.PI*t),.66)+.008),.578,(t-.5)*3.7]);}curve(rig,rim,.023,trim,40);
    rod(rig,[s*.40,.47,-.02],[s*.70,1.04,.68],.019,.019,metal);
    rod(rig,[s*.43,.49,.85],[s*.70,1.04,.68],.017,.017,metal);
    const name=s<0?'Left':'Right';
    const oar=group(rig,`${name}Oar`,[s*.70,1.04,.68]);
    rod(oar,[-s*.55,.25,0],[s*1.13,-.61,0],.022,.017,M.black);
    rod(oar,[-s*.55,.25,0],[-s*.27,.107,0],.032,.03,M.wood);
    const blade=box(oar,[s*1.26,-.676,0],[.44,.045,.22],M.burgundy,.045);blade.rotation.z=-s*.47;
    box(oar,[s*1.29,-.645,0],[.21,.046,.15],trim,.012).rotation.z=-s*.47;
    group(oar,`${name}OarGrip`,[-s*.55,.25,0]);
    ellipsoid(rig,[s*.70,1.04,.68],[.055,.055,.055],metal);
  }
  box(rig,[0,.62,.22],[.54,.12,.40],M.navy,.07);
  for(const s of [-1,1])rod(rig,[s*.18,.39,-.75],[s*.18,.39,.75],.018,.018,metal);
  box(rig,[0,.36,1.20],[.63,.10,.26],M.navyLight,.03);
  return rig;
}

function buildCamera(torso) {
  const camera=group(torso,'CameraProp',[0,.63,.67]);
  const silver=mat('#c8ccc3',.36,.68);const leather=mat('#303735',.83);const glass=mat('#234c58',.12,.38);
  box(camera,[0,0,0],[.66,.39,.22],leather,.045);
  box(camera,[0,.18,.002],[.65,.065,.22],silver,.015);
  box(camera,[0,-.17,.002],[.65,.035,.22],silver,.009);
  box(camera,[.28,-.015,.02],[.13,.32,.25],M.black,.025);
  box(camera,[0,.225,-.025],[.24,.10,.19],silver,.015);
  box(camera,[0,.23,-.13],[.11,.053,.022],M.black,.006);
  rod(camera,[0,-.01,.10],[0,-.01,.29],.161,.143,M.black);
  for(const z of [.13,.19,.27])mesh(camera,new THREE.TorusGeometry(.15,.009,8,36),silver,[0,-.01,z]);
  rod(camera,[0,-.01,.28],[0,-.01,.31],.121,.121,glass);
  ellipsoid(camera,[-.035,.035,.319],[.028,.019,.004],mat('#b3dfda',.15));
  const shutter=disc(camera,[.215,.223,.016],.043,.026,M.burgundy);
  disc(camera,[-.24,.228,0],.042,.033,M.black);
  curve(camera,[[-.31,.06,-.055],[-.45,-.15,-.12],[-.34,-.45,-.08],[.32,-.45,-.08],[.45,-.15,-.12],[.31,.06,-.055]],.014,M.burgundy,26);
  group(camera,'LeftCameraGrip',[-.31,-.075,.025]);group(camera,'RightCameraGrip',[.32,.02,.015]);
  const light=group(camera,'ShutterLight',[.22,.11,.123]);
  ellipsoid(light,[0,0,0],[.024,.024,.009],new THREE.MeshBasicMaterial({color:'#fff1b3',toneMapped:false}));
  return camera;
}

export async function createCharacter() {
  const texture = await new THREE.TextureLoader().loadAsync(new URL('../reference-images/689d00a1-1950-4447-809d-c2eef427e873.png',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace; texture.anisotropy=8;
  const world=new THREE.Group();world.name='MandyWorld';
  const root=group(world,'MandyRoot',[0,.17,0]);
  const torso=group(root,'Torso',[0,1.56,0]);
  // A shaped polo body with a slightly bloused hem.
  const profile=[new THREE.Vector2(.33,0),new THREE.Vector2(.37,.08),new THREE.Vector2(.35,.30),new THREE.Vector2(.37,.54),new THREE.Vector2(.41,.73),new THREE.Vector2(.32,.87),new THREE.Vector2(.16,.94)];
  const shirt=mesh(torso,new THREE.LatheGeometry(profile,48),M.cream,[0,0,0],[1,1,.69]);
  const hem=mesh(torso,new THREE.TorusGeometry(.351,.025,8,48),M.white,[0,.04,0],[1,.72,1]);hem.rotation.x=Math.PI/2;
  ellipsoid(torso,[0,.96,0],[.14,.23,.13],M.skin);
  const collarLeft=shapeMesh(torso,[[-.20,.94],[-.02,.84],[-.12,.68],[-.29,.86]],M.white);collarLeft.position.z=.205;
  const collarRight=shapeMesh(torso,[[.02,.84],[.20,.94],[.29,.86],[.12,.68]],M.white);collarRight.position.z=.205;
  curve(torso,[[-.28,.858,.23],[-.12,.70,.247],[-.04,.81,.244]],.009,M.burgundy,12);
  curve(torso,[[.28,.858,.23],[.12,.70,.247],[.04,.81,.244]],.009,M.burgundy,12);
  box(torso,[0,.62,.258],[.062,.35,.018],M.white,.006);
  for(let i=0;i<3;i++)ellipsoid(torso,[0,.75-i*.104,.277],[.015,.015,.007],M.sole);
  const badge=shapeMesh(torso,[[-.08,.1],[.08,.1],[.065,-.05],[0,-.11],[-.065,-.05]],M.burgundy,.009);badge.position.set(-.22,.53,.25);badge.scale.setScalar(.8);
  curve(badge,[[-.061,.077,.027],[.061,.077,.027],[.05,-.037,.027],[0,-.082,.027],[-.05,-.037,.027],[-.061,.077,.027]],.0035,M.cream,10);
  curve(badge,[[-.023,-.04,.03],[-.023,.048,.03],[0,.005,.03],[.023,.048,.03],[.023,-.04,.03]],.004,M.cream,5);
  const head=group(root,'Head',[0,3.18,0]);
  for(const s of [-1,1]) { ellipsoid(head,[s*.592,-.105,-.015],[.12,.18,.095],M.skin);ellipsoid(head,[s*.66,-.105,.034],[.05,.094,.04],M.skinShadow); }
  const face=referenceFace(texture);face.name='OriginalReferenceFace';head.add(face);
  buildHeadShell(head, face);
  const hair=buildHair(head, face);
  const glasses=group(head,'Glasses',[0,0,.71]);
  for(const s of [-1,1]) {
    const pts=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;pts.push([s*.29+Math.cos(a)*.235,-.045+Math.sin(a)*.183,-Math.abs(Math.cos(a))*.03]);}
    curve(glasses,pts,.014,M.black,48);
    curve(glasses,[[s*.51,.025,-.035],[s*.59,.025,-.15],[s*.64,-.04,-.5]],.012,M.black,12);
  }
  curve(glasses,[[-.054,.012,0],[0,.03,.015],[.054,.012,0]],.014,M.black,10);
  const arms={};
  for(const [name,s] of [['Left',-1],['Right',1]]) {
    const arm=group(torso,`${name}Arm`,[s*.36,.75,0]);
    ellipsoid(arm,[s*.043,-.12,0],[.19,.245,.205],M.cream);
    const cuff=mesh(arm,new THREE.CylinderGeometry(.164,.152,.065,32),M.burgundy,[s*.047,-.275,0]);cuff.scale.z=.94;
    const cuffLine=mesh(arm,new THREE.CylinderGeometry(.165,.16,.017,32),M.white,[s*.047,-.270,0]);cuffLine.scale.z=.94;
    rod(arm,[s*.046,-.26,0],[0,-.48,.018],.128,.095,M.skin);
    const forearm=group(arm,`${name}Forearm`,[0,-.46,.018]);
    ellipsoid(forearm,[0,-.015,0],[.096,.115,.096],M.skin);
    rod(forearm,[0,0,0],[0,-.36,.018],.096,.07,M.skin);
    const hand=buildHand(forearm,`${name}Hand`,s);hand.position.y=-.33;
    group(hand,`${name}PalmGrip`,[0,-.12,.02]);
    arms[name]={arm,forearm,hand};
  }
  const legs={};
  ellipsoid(root,[0,1.43,-.035],[.34,.25,.235],M.navy);
  for(const [name,s] of [['Left',-1],['Right',1]]) {
    const leg=group(root,`${name}Leg`,[s*.185,1.44,0]);
    const trouser=group(leg,`${name}Trouser`);
    const upperProfile=[[-.65,.174],[-.60,.174],[-.45,.183],[-.25,.202],[-.04,.207],[.065,.16]].map(([y,r])=>new THREE.Vector2(r,y));
    mesh(trouser,new THREE.LatheGeometry(upperProfile,32),M.navy,[s*.017,0,0],[1,1,1.15]);
    const shin=group(leg,`${name}Shin`,[s*.035,-.59,0]);
    const lowerProfile=[[-.62,.179],[-.57,.185],[-.49,.18],[-.38,.169],[-.22,.164],[-.08,.170],[.06,.174]].map(([y,r])=>new THREE.Vector2(r,y));
    mesh(shin,new THREE.LatheGeometry(lowerProfile,32),M.navy,[0,0,-.005],[1,1,1.15]);
    curve(shin,[[s*.153,-.10,.04],[s*.16,-.3,.04],[s*.15,-.55,.045]],.004,M.navyLight,12);
    const foot=group(shin,`${name}Foot`,[0,-.75,.04]);buildShoe(foot);
    legs[name]={leg,shin,foot};
  }
  const racket=buildRacket(arms.Left.hand);
  const chalk=group(arms.Right.hand,'Chalk',[0,-.19,.055]);rod(chalk,[0,0,0],[0,-.23,0],.022,.021,M.chalk);
  const ball=group(world,'TennisBall',[1.10,1.1,.3]);ellipsoid(ball,[0,0,0],[.13,.13,.13],M.green);
  for(const s of [-1,1]) { const points=[];for(let i=0;i<=48;i++){const a=i/48*Math.PI*2;points.push([Math.sin(a)*.125,Math.cos(a)*.088,s*(.037+.049*Math.sin(a)**2)]);}curve(ball,points,.005,M.white,48); }
  const board=buildBoard(world);
  const rowing=buildRowingRig(world);
  const cameraProp=buildCamera(torso);
  const base=group(world,'DisplayBase');disc(base,[0,.05,0],1.12,.16,mat('#7d363f',.46));disc(base,[0,.139,0],1.095,.023,mat('#97474e',.42));
  const plaque=box(base,[0,.054,1.14],[.87,.105,.026],M.gold,.02);
  const plaqueText=boardLabel(base,'YOU GOT THIS!',0,.053,28,'#5d3030');plaqueText.position.z=1.158;plaqueText.scale.set(.49,.26,1);
  world.updateMatrixWorld(true);
  return {world,root,torso,head,hair,glasses,arms,legs,racket,chalk,ball,board,rowing,cameraProp,base,face};
}
