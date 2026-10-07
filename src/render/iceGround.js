import * as THREE from 'three';

// The foot follows the sampled ground under the footprint, rather than an object's tilted local Y.
export function iceGroundHeight(heights, x, z) {
  const u = THREE.MathUtils.clamp(x * 0.5 + 0.5, 0, 1), v = THREE.MathUtils.clamp(z * 0.5 + 0.5, 0, 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(heights[0], heights[1], u), THREE.MathUtils.lerp(heights[2], heights[3], u), v);
}

export function prepareIceGround(mesh, field) {
  const heights = new Float32Array(mesh.instanceMatrix.count * 4), params = new Float32Array(heights.length);
  const matrix = new THREE.Matrix4(), p = new THREE.Vector3(), scale = new THREE.Vector3();
  mesh.updateMatrixWorld(true);
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix); matrix.premultiply(mesh.matrixWorld); scale.setFromMatrixScale(matrix);
    for (let k = 0; k < 4; k++) {
      p.set(k % 2 ? 1 : -1, 0, k > 1 ? 1 : -1).applyMatrix4(matrix);
      heights[i * 4 + k] = field.height(p.x, p.z);
    }
    p.setFromMatrixPosition(matrix);
    const slope = field.slope(p.x, p.z), n = new THREE.Vector3(-slope.gx, 1, -slope.gz);
    n.divideScalar(Math.abs(n.x) + Math.abs(n.y) + Math.abs(n.z));
    const packed = Math.round((n.x * 0.5 + 0.5) * 31) + Math.round((n.z * 0.5 + 0.5) * 31) * 32;
    const x = THREE.MathUtils.clamp(Math.round((p.x - field.x0) / field.cell), 0, field.nx - 1);
    const z = THREE.MathUtils.clamp(Math.round((p.z - field.z0) / field.cell), 0, field.nz - 1);
    params.set([field.glacierAt(p.x, p.z), (field.rock?.[z * field.nx + x] || 0) / 255,
      THREE.MathUtils.clamp(scale.y * 0.24, 1.4, 4.5), packed], i * 4);
  }
  mesh.geometry.setAttribute('iceGroundHeights', new THREE.InstancedBufferAttribute(heights, 4));
  mesh.geometry.setAttribute('iceGroundParams', new THREE.InstancedBufferAttribute(params, 4));
}

/** Relative heights retain centimetre precision in the ray tracer's half-float attribute textures. */
export function iceGroundDescriptor(mesh, matrix, instance) {
  const geo = mesh.geometry, h = geo.attributes.iceGroundHeights.array.subarray(instance * 4, instance * 4 + 4);
  const params = geo.attributes.iceGroundParams.array.subarray(instance * 4, instance * 4 + 4);
  const position = geo.attributes.position, ground = new Float32Array(position.count * 4), p = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(matrix);
    ground.set([p.y - iceGroundHeight(h, position.getX(i), position.getZ(i)), params[0], params[1], params[2]], i * 4);
  }
  return { iceGround: ground, iceGroundNormal: params[3] };
}

// Shared by the display material and secondary-ray albedo evaluation. The fade is softly uneven,
// anchored in metres above the ground; snow above it remains the existing white ice surface.
export const ICE_GROUND_GLSL = `
vec3 iceGroundNormal(float packed){
  vec2 p=vec2(mod(packed,32.0),floor(packed/32.0))/31.0*2.0-1.0;
  return normalize(vec3(p.x,1.0-abs(p.x)-abs(p.y),p.y));
}
float iceGroundWeight(vec3 p,float gap,float end){
  float irregular=textureLod(uMacro,p.xz/19.0,0.0).r;
  return 0.72*(1.0-smoothstep(0.12,end*(0.8+0.35*irregular),gap));
}
`;
