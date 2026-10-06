import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V = (p) => new THREE.Vector3(...p);
const sphereGeometry = new THREE.SphereGeometry(1, 32, 24);
const materials = {};
function mat(color, roughness = .6, metalness = 0) {
  const key = `${color}-${roughness}-${metalness}`;
  return materials[key] ||= new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
const M = {
  skin: mat('#e9b17e', .75), skinShadow: mat('#cd976b'), cream: mat('#f3eedf', .88),
  white: mat('#fff9ec', .67), burgundy: mat('#752b36', .6), navy: mat('#293343', .91),
  navyLight: mat('#344051', .95), hair: mat('#211b19', .38), hair2: mat('#2b2320', .43),
  hair3: mat('#322822', .44), hairLine: mat('#45372b', .51), sole: mat('#dedacb', .8),
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

// A tapered, flattened sweep makes each lock a volume, including at the back.
function hairLock(parent, points, width, depth, material, grooves = true, rootOffset = .09, grooveDirection = null) {
  const path = new THREE.CatmullRomCurve3(points.map(V));
  const rings = 64, sides = 16;
  const frames = path.computeFrenetFrames(rings, false), positions = [], indices = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, p = path.getPointAt(t);
    const taper = Math.max(.014, Math.pow(Math.sin(Math.PI * (rootOffset + (1 - rootOffset) * t)), .5));
    for (let j = 0; j <= sides; j++) {
      const a = j / sides * Math.PI * 2;
      const v = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * width * taper).addScaledVector(frames.binormals[i], Math.sin(a) * depth * taper);
      positions.push(...v.toArray());
      if (i < rings && j < sides) { const n = i * (sides + 1) + j; indices.push(n, n + 1, n + sides + 1, n + 1, n + sides + 2, n + sides + 1); }
    }
  }
  // Seal both ends: an exposed root must never show the inside of a hollow tube.
  const start = positions.length / 3; positions.push(...path.getPointAt(0).toArray());
  const end = positions.length / 3; positions.push(...path.getPointAt(1).toArray());
  for (let j = 0; j < sides; j++) {
    indices.push(start, j + 1, j);
    const n = rings * (sides + 1) + j; indices.push(end, n, n + 1);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices);
  const sealed = mergeVertices(geo, .000001); sealed.computeVertexNormals(); geo.dispose();
  mesh(parent, sealed, material).name = 'HairLock';
  if (grooves) {
    for (const offset of [-.38, .3]) {
      const line = [];
      for (let i = 2; i < rings - 3; i += 2) {
        const t = i / rings, taper = Math.pow(Math.sin(Math.PI * (rootOffset + (1 - rootOffset) * t)), .5);
        const p = path.getPointAt(t);
        if (grooveDirection) {
          const direction = V(grooveDirection);
          const a = Math.atan2(depth * direction.dot(frames.binormals[i]), width * direction.dot(frames.normals[i])) + offset;
          p.addScaledVector(frames.normals[i], width * taper * Math.cos(a) * 1.005).addScaledVector(frames.binormals[i], depth * taper * Math.sin(a) * 1.005);
        } else p.addScaledVector(frames.normals[i], width * taper * offset).addScaledVector(frames.binormals[i], depth * taper * .97);
        line.push(p.toArray());
      }
      curve(parent, line, .004, M.hairLine, 30);
    }
  }
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
      const across = (u - .5) * 2;
      // The narrow hairline must flatten with its width, otherwise the forehead
      // ends in a forward-projecting fin that becomes visible from above.
      const foreheadDepth = py < 310 ? THREE.MathUtils.smoothstep(right - left, 22, 115) : 1;
      let z = .24 + .34 * foreheadDepth * Math.sqrt(Math.max(0, 1 - across * across)) * Math.pow(Math.sin(Math.PI * (.12 + row / rowCount * .80)), .32);
      // Ease the small hollow at the left hairline into the forehead surface.
      const templeBlend = THREE.MathUtils.smoothstep(py, 255, 300) * (1 - THREE.MathUtils.smoothstep(py, 345, 395));
      z += .075 * templeBlend * Math.exp(-((u / .28) ** 2));
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

// Fill only the space behind the original fringe with hair from the same portrait.
// The strips meet the existing facial boundary, leaving every facial vertex/UV intact.
function buildHairlineInfill(head, face) {
  const positions = [], uvs = [], indices = [];
  const outline = [[140,570,610],[165,510,652],[195,470,680],[237,450,700],
    [280,423,722],[340,395,740],[390,385,761],[440,395,777]];
  const bounds = py => {
    let k = 0; while (k < outline.length - 2 && outline[k + 1][0] < py) k++;
    const a = outline[k], b = outline[k + 1], f = (py - a[0]) / (b[0] - a[0]);
    return [THREE.MathUtils.lerp(a[1], b[1], f), THREE.MathUtils.lerp(a[2], b[2], f)];
  };
  const vertex = (px, py, z) => {
    positions.push((px - 580) / 285, .07 + (420 - py) / 285, z);
    uvs.push(px / 1122, 1 - py / 1402);
  };
  const front = face.geometry.getAttribute('position'), uv = face.geometry.getAttribute('uv');
  const rows = 52, columns = 20;
  for (const side of [0, 1]) {
    const offset = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      const edge = row * 73 + side * 72;
      const px = uv.getX(edge) * 1122, py = (1 - uv.getY(edge)) * 1402;
      const outer = THREE.MathUtils.lerp(bounds(py)[side], px, THREE.MathUtils.smoothstep(py, 370, 436));
      for (let col = 0; col <= columns; col++) {
        const f = col / columns;
        vertex(THREE.MathUtils.lerp(px, outer, f), py, front.getZ(edge));
        if (row < rows && col < columns) {
          const n = offset + row * (columns + 1) + col;
          if (side) indices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2);
          else indices.push(n, n + 1, n + columns + 1, n + 1, n + columns + 2, n + columns + 1);
        }
      }
    }
  }
  const offset = positions.length / 3;
  for (let row = 0; row <= 28; row++) {
    const py = 140 + 97 * row / 28, [left, right] = bounds(py);
    for (let col = 0; col <= 56; col++) {
      vertex(THREE.MathUtils.lerp(left, right, col / 56), py, .24);
      if (row < 28 && col < 56) {
        const n = offset + row * 57 + col;
        indices.push(n, n + 57, n + 1, n + 1, n + 57, n + 58);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  mesh(head, geometry, new THREE.MeshBasicMaterial({map:face.material.map,toneMapped:false})).name = 'HairlineInfill';
}

// A recessed, matte lining only blocks light through the spaces between locks.
// It must not reflect like a second shell over the forehead.
function buildHairCrown(hair) {
  const around = 216, rows = 80, stride = around + 1;
  const positions = [], colors = [], indices = [], surfaceSize = (rows + 1) * stride;
  const smooth = THREE.MathUtils.smoothstep;
  for (let wall = 0; wall < 2; wall++) {
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= around; col++) {
        const phi = col / around * Math.PI * 2, frontAngle = Math.acos(Math.cos(phi));
        const upperEnd = .29 + .16 * smooth(frontAngle, 0, 1.45);
        const length = THREE.MathUtils.lerp(upperEnd, 1, smooth(frontAngle, 1.05, 1.50));
        const s = row / rows * length, theta = Math.min(s / .44, 1) * Math.PI / 2;
        const fall = Math.max(0, (s - .44) / .56), radial = Math.sin(theta);
        const flow = phi * 18 + 1.1 * Math.sin(s * 5) * smooth(s, .28, .7);
        const bundle = Math.pow((1 + Math.cos(flow)) / 2, 2);
        const ridge = .025 * fall * Math.pow(radial, 1.6) * bundle;
        const wave = .08 * Math.sin(fall * Math.PI * 1.65) * fall;
        const thickness = wall * .065;
        const beneathLocks = smooth(s, .40, .80) * smooth(frontAngle, 1.05, 1.5);
        const rx = (.74 + .045 * Math.sin(fall * Math.PI) + wave - .08 * beneathLocks - thickness) * radial;
        const frontRecess = .40 * Math.pow(Math.max(0, Math.cos(phi)), 6) * smooth(s, .08, .29);
        const rz = (.61 - frontRecess - .07 * fall + wave - .08 * beneathLocks - thickness) * radial;
        const relief = wall ? 0 : ridge;
        const y = 3.47 + .83 * Math.cos(theta) - 1.35 * fall
          + (.12 - .16 * bundle + .025 * Math.sin(phi * 7)) * smooth(fall, .55, 1)
          + .25 * beneathLocks * smooth(fall, .5, 1) - thickness * (1 - radial);
        positions.push(Math.sin(phi) * (rx + relief), y, -.10 + Math.cos(phi) * (rz + relief));
        const tint = wall ? .38 : 1;
        colors.push(tint, tint, tint);
        if (row < rows && col < around) {
          const n = wall * surfaceSize + row * stride + col;
          if (wall) indices.push(n, n + 1, n + stride, n + 1, n + stride + 1, n + stride);
          else indices.push(n, n + stride, n + 1, n + 1, n + stride, n + stride + 1);
        }
      }
    }
  }
  for (let col = 0; col < around; col++) {
    const a = rows * stride + col, b = a + surfaceSize;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const joined = mergeVertices(geometry, .000001); joined.computeVertexNormals(); geometry.dispose();
  const material = M.hair.clone(); material.roughness = .82; material.envMapIntensity = .15; material.vertexColors = true;
  mesh(hair, joined, material).name = 'HairCrown';
}

function buildHair(head, face) {
  const hair = group(head, 'Hair', [0, -3.18, 0]);
  buildHairCrown(hair);
  buildHairlineInfill(head, face);
  // Original rear colours and waves; roots continue under the crown to close gaps.
  for (let i = 0; i < 15; i++) {
    const a = Math.PI * .43 + i / 14 * Math.PI * 1.14;
    const x = Math.sin(a), z = Math.cos(a);
    hairLock(hair, [[x*.025,4.30,-.10+z*.025],[x*.25,4.24,z*.23-.10],[x*.54,4.02,z*.45-.10],
      [x*.70,3.55,z*.58-.10],[x*.70,2.95,z*.55-.08],[x*.76+Math.sin(i)*.08,2.56,z*.49-.10],
      [x*.69,2.16+(i%3)*.07,z*.48-.06],[x*.57,2.02+(i%4)*.08,z*.42]],
      .15,.12,i%3===0?M.hair2:M.hair,false,0);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const spread = i * .025, startX = s * (.035 + i * .031);
      hairLock(hair, [[startX,4.25-i*.013,.09-i*.035],[s*(.30+spread),4.17-i*.029,.34-i*.027],[s*(.51+spread),3.91-i*.053,.49-i*.025],[s*(.65+spread),3.54-i*.045,.49-i*.037],[s*(.77+spread),3.20-i*.045,.34-i*.029],[s*(.73+spread),2.91-i*.06,.31-i*.026],[s*(.81+spread),2.64-i*.07,.32-i*.028],[s*(.65+spread),2.41-i*.064,.37-i*.03],[s*(.66+spread),2.23-i*.045,.24-i*.025]], .115 + i*.009, .09, [M.hair2,M.hair,M.hair3][i%3]);
    }
  }
  // The inner swept fringe follows the asymmetric part of the reference portrait.
  hairLock(hair, [[.07,4.19,.33],[-.17,4.11,.49],[-.36,3.83,.60],[-.48,3.60,.58],[-.64,3.37,.44],[-.76,3.23,.29]], .10, .075, M.hair2);
  hairLock(hair, [[.085,4.18,.33],[.25,4.07,.51],[.36,3.85,.57],[.47,3.59,.53],[.56,3.39,.44],[.68,3.19,.26]], .083, .07, M.hair);
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

function buildHand(parent, name) {
  const hand = group(parent, name, [0, -.45, 0]);
  ellipsoid(hand, [0, -.07, .01], [.112, .145, .065], M.skin);
  for (let i = 0; i < 4; i++) {
    const x = -.077 + i * .048, length = [.125,.16,.17,.13][i];
    rod(hand, [x,-.13,.01], [x*1.15,-.13-length,.015], .025, .02, M.skin);
    ellipsoid(hand, [x*1.15,-.13-length,.015], [.022,.024,.024], M.skin);
  }
  rod(hand, [-.075,-.045,.016], [-.15,-.14,.055], .043,.033,M.skin);
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
    const hand=buildHand(forearm,`${name}Hand`);hand.position.y=-.33;
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
