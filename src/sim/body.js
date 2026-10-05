// Metres and kilograms. The render rig and rigid bodies share these centres and joints.
export const BODY = [
  { id: 'pelvis', p: [0, .91, 0], radius: .20, half: .08, mass: 10 },
  { id: 'torso', p: [0, 1.25, 0], radius: .25, half: .16, mass: 24, parent: 'pelvis', joint: [0, 1.03, 0], limits: [.65, .45, .45] },
  { id: 'head', p: [0, 1.69, 0], radius: .15, half: 0, mass: 5, parent: 'torso', joint: [0, 1.53, 0], limits: [.65, .85, .45] },
  ...[-1, 1].flatMap((s, i) => [
    { id: `arm${i}`, p: [.32*s, 1.22, 0], radius: .075, half: .12, mass: 2, parent: 'torso', joint: [.32*s, 1.42, 0], limits: [1.8, 1.2, 1.5] },
    { id: `forearm${i}`, p: [.32*s, .85, 0], radius: .065, half: .115, mass: 1.5, parent: `arm${i}`, joint: [.32*s, 1.025, 0], hinge: [-2.4, 0] },
    { id: `thigh${i}`, p: [.12*s, .67, 0], radius: .095, half: .125, mass: 7, parent: 'pelvis', joint: [.12*s, .9, 0], limits: [1.7, .55, .6] },
    { id: `shin${i}`, p: [.12*s, .26, 0], radius: .085, half: .125, mass: 5, parent: `thigh${i}`, joint: [.12*s, .465, 0], hinge: [0, 2.3] },
  ]),
];

export const AXE_PICK = [0, -0.1, -0.19]; // forearm-local contact point, shared with the detailed render rig

export const FALL = {
  dt: 1/120, gravity: 9.81,
  friction: { snow: .28, ice: .07, rock: .62 },
  restitution: .04, recoverySpeed: .6, recoveryDelay: 1.2,
  arrestForce: 900, arrestStamina: 12,
};

export function surfaceType(field, x, z) {
  if (field.surfaceType) return field.surfaceType(x, z);
  const slope = field.slope(x, z, 4).mag;
  const i = Math.round((x-field.x0)/field.cell), j = Math.round((z-field.z0)/field.cell);
  if (field.rock?.[j*field.nx+i] > 128 || (slope > 1.5 && field.glacierAt(x,z) < .5)) return 'rock';
  return field.glacierAt(x,z) > .5 && slope > .85 ? 'ice' : 'snow';
}
