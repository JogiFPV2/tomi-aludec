import * as THREE from 'three';
import { Builder, V } from '../render/build';
import type { Appearance } from '../../data/appearance';

/**
 * Buduje postać 3D na podstawie danych wyglądu. Ten sam kod służy w kreatorze i w grze.
 * Wymiary bazowe dla wzrostu 180 cm, potem całość jest skalowana do wybranego wzrostu.
 */
export interface Avatar {
  group: THREE.Group;
  /** faza i prędkość chodu (0 = stoi) */
  animate(dt: number, speed: number): void;
  setHelmet(on: boolean): void;
  dispose(): void;
}

export function buildAvatar(b: Builder, a: Appearance): Avatar {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const female = a.body === 'k';
  const w = (female ? .9 : 1) * (0.86 + a.build * .32);      // szerokość tułowia
  const sh = (female ? .92 : 1) * (0.9 + a.shoulders * .22); // barki
  const skin = b.mats.color(a.skin), hair = b.mats.color(a.hairColor);

  // nogi
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const lg = new THREE.Group(); lg.position.set(.095 * s * w, .93, 0); body.add(lg); legs.push(lg);
    lg.add(b.limb(V(0, 0, 0), V(.005 * s, -.43, .02), .062 * w, 'pants', 10, .085 * w), b.limb(V(.005 * s, -.43, .02), V(.005 * s, -.82, 0), .048, 'pants', 10, .062 * w));
    lg.add(b.box(.13, .12, .28, 'rubber', [.005 * s, -.87, .045]));
  }
  // tułów (kurtka robocza + kamizelka odblaskowa)
  const torso = b.mesh(new THREE.LatheGeometry([[0, .86], [.15, .87], [.162, .95], [.152, 1.04], [.158, 1.14], [.182 * sh, 1.28], [.19 * sh, 1.38], [.175 * sh, 1.46], [.12, 1.51], [.06, 1.535], [0, 1.54]].map(([r, y]) => new THREE.Vector2(r, y)), 20), 'jacket');
  torso.scale.set(w, 1, .66 * (0.9 + a.build * .2)); body.add(torso);
  const vest = b.mesh(new THREE.LatheGeometry([[0, 1], [.165, 1], [.17, 1.14], [.188 * sh, 1.28], [.196 * sh, 1.38], [.18 * sh, 1.45], [.13, 1.49], [0, 1.49]].map(([r, y]) => new THREE.Vector2(r, y)), 20), 'hivis');
  vest.scale.set(w * 1.02, 1, .7 * (0.9 + a.build * .2)); body.add(vest);
  for (const y of [1.12, 1.22]) { const r = b.cyl(.172 * w, .176 * w, .03, 'reflect', [0, y, 0], undefined, 20); r.scale.z = .72 * (0.9 + a.build * .2); body.add(r); }
  // ręce
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const ag = new THREE.Group(); ag.position.set(.205 * s * w * sh, 1.44, 0); body.add(ag); arms.push(ag);
    ag.add(b.sphere(.07 * w, 'jacket', [0, 0, 0], [1, .9, .95], 10));
    ag.add(b.limb(V(0, 0, 0), V(.045 * s, -.28, .02), .052 * w, 'jacket', 8, .066 * w), b.limb(V(.045 * s, -.28, .02), V(.06 * s, -.51, .07), .044 * w, 'jacket', 8, .054 * w));
    ag.add(b.box(.075, .11, .05, 'glove', [.06 * s, -.56, .07]));
  }
  // szyja i głowa
  body.add(b.cyl(.048, .054, .12, skin, [0, 1.56, 0], undefined, 12));
  const head = new THREE.Group(); head.position.set(0, 1.7, 0); head.scale.setScalar(1.08); body.add(head);
  head.add(b.sphere(.1, skin, [0, 0, 0], [female ? .88 : .92, 1.08, 1], 20));
  head.add(b.sphere(.085, skin, [0, -.048, .012], [female ? .82 : .9, .82, .98], 16));
  // oczy
  const ex = .026 + a.eyeSpacing * .018, es = .011 + a.eyeSize * .007;
  for (const s of [-1, 1]) {
    head.add(b.sphere(es, 'eyeW', [ex * s, 0, .081], undefined, 10));
    head.add(b.sphere(es * .6, b.mats.color(a.eyeColor), [ex * s, 0, .081 + es * .75], undefined, 8));
    head.add(b.sphere(es * .3, 'pupil', [ex * s, 0, .081 + es * 1.05], undefined, 6));
    head.add(b.box(.032, .007, .012, hair, [ex * s, .028, .09], [0, 0, -.1 * s]));
    // uszy
    const er = .022 + a.earSize * .014; head.add(b.sphere(er, skin, [.09 * s, -.012, -.004], [.36, 1, .7], 8));
  }
  // nos i usta
  const nose = b.sphere(.016 + a.noseSize * .01, skin, [0, -.03, .097], [.75, 1.1 + a.noseLength * .6, 1], 10); head.add(nose);
  head.add(b.sphere(.02 + a.mouthWidth * .012, 'lip', [0, -.068, .084], [1, .22, .4], 8));
  // włosy
  const hairG = new THREE.Group(); head.add(hairG);
  if (a.hairStyle !== 'lysy') {
    const cap = a.hairStyle === 'jeż' ? .38 : .44;
    hairG.add(b.mesh(new THREE.SphereGeometry(.105, 20, 12, 0, Math.PI * 2, 0, Math.PI * cap), hair, [0, .008, -.004]));
    hairG.children[0].scale.set(.95, a.hairStyle === 'jeż' ? 1.18 : 1.1, 1.05);
    if (a.hairStyle !== 'jeż') hairG.add(b.mesh(new THREE.SphereGeometry(.102, 16, 10, Math.PI * 1.08, Math.PI * .84, Math.PI * .28, Math.PI * (a.hairStyle === 'dluzsze' ? .55 : .36)), hair));
    if (a.hairStyle === 'dluzsze') hairG.add(b.box(.17, .14, .06, hair, [0, -.08, -.07]));
    if (a.hairStyle === 'kucyk') hairG.add(b.limb(V(0, .02, -.1), V(0, -.16, -.14), .025, hair, 8, .018));
  }
  // zarost
  if (a.beard === 'zarost') head.add(b.mesh(new THREE.SphereGeometry(.087, 18, 10, Math.PI / 2 - 1.25, 2.5, Math.PI * .52, Math.PI * .34), b.mats.color('#' + new THREE.Color(a.hairColor).lerp(new THREE.Color(a.skin), .45).getHexString()), [0, -.046, .013]));
  if (a.beard === 'krotka' || a.beard === 'pelna') {
    const bd = b.mesh(new THREE.SphereGeometry(.09, 18, 10, Math.PI / 2 - 1.25, 2.5, Math.PI * (a.beard === 'pelna' ? .45 : .5), Math.PI * (a.beard === 'pelna' ? .45 : .36)), hair, [0, -.046, .014]);
    bd.scale.set(.93, a.beard === 'pelna' ? 1.05 : .88, 1.02); head.add(bd);
  }
  if (a.beard === 'wasy' || a.beard === 'krotka' || a.beard === 'pelna') head.add(b.sphere(.03, hair, [0, -.054, .088], [1.15, .3, .4], 8));
  // okulary
  if (a.glasses !== 'none') {
    for (const s of [-1, 1]) {
      head.add(b.mesh(new THREE.TorusGeometry(.021, .0032, 6, 20), a.glasses === 'ochronne' ? 'dark' : 'frame', [ex * s, 0, .103]));
      head.add(b.mesh(new THREE.CircleGeometry(.02, 16), 'lens', [ex * s, 0, .1025], undefined, false));
      head.add(b.box(.003, .004, .09, 'frame', [.086 * s, .004, .058]));
    }
    head.add(b.box(.02, .004, .005, 'frame', [0, .004, .106]));
  }
  // kask
  const helmet = new THREE.Group(); head.add(helmet);
  const hm = b.mats.color(a.helmetColor);
  helmet.add(b.mesh(new THREE.SphereGeometry(.118, 20, 10, 0, Math.PI * 2, 0, Math.PI * .5), hm, [0, .02, 0]));
  helmet.children[0].scale.set(1, 1.05, 1.12);
  helmet.add(b.cyl(.132, .132, .012, hm, [0, .022, .03], undefined, 20));

  const k = a.height / 180; root.scale.setScalar(k);
  let phase = 0;
  return {
    group: root,
    animate(dt, speed) {
      phase += dt * (3 + speed * 3.2);
      const amp = Math.min(.55, speed * .22);
      legs[0].rotation.x = Math.sin(phase) * amp; legs[1].rotation.x = -Math.sin(phase) * amp;
      arms[0].rotation.x = -Math.sin(phase) * amp * .7; arms[1].rotation.x = Math.sin(phase) * amp * .7;
      body.position.y = speed > .05 ? Math.abs(Math.sin(phase)) * .025 : Math.sin(phase * .3) * .004;
    },
    setHelmet(on) { helmet.visible = on; hairG.visible = !on || a.hairStyle === 'kucyk'; },
    dispose() { root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); },
  };
}
