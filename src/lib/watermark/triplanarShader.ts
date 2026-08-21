/**
 * Shared GLSL for triplanar stamp sampling in object space.
 * Uniforms: uWmStamp, uWmIntensity, uWmTileScale, uWmRotationY, uWmInvSize
 * uWmInvSize = 1 / max(bbox size) so density is stable across model units.
 */
export const TRIPLANAR_UNIFORM_DECLS = /* glsl */ `
uniform sampler2D uWmStamp;
uniform float uWmIntensity;
uniform float uWmTileScale;
uniform float uWmRotationY;
uniform float uWmInvSize;
`

export const TRIPLANAR_SAMPLE_FN = /* glsl */ `
vec3 wmRotateY(vec3 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
}

vec4 wmSampleTriplanar(vec3 pos, vec3 nrm) {
  vec3 p = wmRotateY(pos * uWmInvSize, uWmRotationY) * uWmTileScale;
  vec3 n = abs(normalize(nrm));
  n = pow(n, vec3(4.0));
  float sum = n.x + n.y + n.z;
  n = sum > 0.0 ? n / sum : vec3(0.0, 1.0, 0.0);
  vec4 cx = texture2D(uWmStamp, p.zy);
  vec4 cy = texture2D(uWmStamp, p.xz);
  vec4 cz = texture2D(uWmStamp, p.xy);
  return cx * n.x + cy * n.y + cz * n.z;
}

vec3 wmApplyStamp(vec3 albedo, vec3 pos, vec3 nrm) {
  vec4 stamp = wmSampleTriplanar(pos, nrm);
  float a = stamp.a * uWmIntensity;
  return mix(albedo, stamp.rgb, clamp(a, 0.0, 1.0));
}
`
