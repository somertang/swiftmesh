import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  BackSide,
  Color,
  Plane,
  Vector3,
  type Mesh,
  type ShaderMaterial,
} from 'three'

const AXIS_X = new Color('#FF3333')
const AXIS_Z = new Color('#4CFF4C')
const CELL = new Color('#4a4a4a')
const SECTION = new Color('#5a5a5a')

const InfiniteGridMaterial = shaderMaterial(
  {
    cellSize: 1,
    sectionSize: 10,
    fadeDistance: 100,
    fadeStrength: 1.2,
    cellThickness: 0.7,
    sectionThickness: 1.15,
    axisThickness: 0.7,
    cellColor: CELL,
    sectionColor: SECTION,
    xAxisColor: AXIS_X,
    zAxisColor: AXIS_Z,
    worldCamProjPosition: new Vector3(),
    worldPlanePosition: new Vector3(),
  },
  /* glsl */ `
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform vec3 worldPlanePosition;
    uniform float fadeDistance;

    void main() {
      localPosition = position.xzy;
      localPosition *= 1.0 + fadeDistance;

      worldPosition = modelMatrix * vec4(localPosition, 1.0);
      worldPosition.xyz += (worldCamProjPosition - worldPlanePosition);
      localPosition = (inverse(modelMatrix) * worldPosition).xyz;

      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,
  /* glsl */ `
    varying vec3 localPosition;
    varying vec4 worldPosition;

    uniform vec3 worldCamProjPosition;
    uniform float cellSize;
    uniform float sectionSize;
    uniform vec3 cellColor;
    uniform vec3 sectionColor;
    uniform vec3 xAxisColor;
    uniform vec3 zAxisColor;
    uniform float fadeDistance;
    uniform float fadeStrength;
    uniform float cellThickness;
    uniform float sectionThickness;
    uniform float axisThickness;

    float getGrid(float size, float thickness) {
      vec2 r = localPosition.xz / size;
      vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
      float line = min(grid.x, grid.y) + 1.0 - thickness;
      return 1.0 - min(line, 1.0);
    }

    float getAxis(float coord, float thickness) {
      float g = abs(coord) / max(fwidth(coord), 1e-8);
      return 1.0 - min(g + 1.0 - thickness, 1.0);
    }

    void main() {
      float g1 = getGrid(cellSize, cellThickness);
      float g2 = getGrid(sectionSize, sectionThickness);
      float axisX = getAxis(localPosition.z, axisThickness);
      float axisZ = getAxis(localPosition.x, axisThickness);
      float axes = max(axisX, axisZ);

      float dist = distance(worldCamProjPosition, worldPosition.xyz);
      float fade = pow(1.0 - min(dist / fadeDistance, 1.0), fadeStrength);

      vec3 color = mix(cellColor, sectionColor, min(1.0, sectionThickness * g2));
      if (axisX > axisZ) {
        color = xAxisColor;
      } else if (axisZ > 0.0) {
        color = zAxisColor;
      }

      float gray = max(g1, g2) * (1.0 - axes);
      float alpha = max(gray, axes) * fade;
      if (alpha <= 0.0) discard;

      gl_FragColor = vec4(color, alpha);
      #include <colorspace_fragment>
    }
  `
)

extend({ InfiniteGridMaterial })

type GridMesh = Mesh & { material: ShaderMaterial }

export function InfiniteGroundGrid({ fadeDistance }: { fadeDistance: number }) {
  const meshRef = useRef<GridMesh>(null)
  const scratch = useMemo(
    () => ({
      plane: new Plane(),
      up: new Vector3(0, 1, 0),
      origin: new Vector3(),
    }),
    []
  )

  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh) return
    const { plane, up, origin } = scratch
    plane.setFromNormalAndCoplanarPoint(up, origin).applyMatrix4(mesh.matrixWorld)
    const uniforms = mesh.material.uniforms
    plane.projectPoint(camera.position, uniforms.worldCamProjPosition.value)
    uniforms.worldPlanePosition.value.set(0, 0, 0).applyMatrix4(mesh.matrixWorld)
  })

  return (
    <mesh ref={meshRef} frustumCulled={false} renderOrder={-999999}>
      <planeGeometry />
      <infiniteGridMaterial
        transparent
        depthWrite={false}
        toneMapped={false}
        side={BackSide}
        fadeDistance={fadeDistance}
        cellColor={CELL}
        sectionColor={SECTION}
        xAxisColor={AXIS_X}
        zAxisColor={AXIS_Z}
      />
    </mesh>
  )
}

declare module '@react-three/fiber' {
  interface ThreeElements {
    infiniteGridMaterial: ThreeElements['shaderMaterial'] & {
      fadeDistance?: number
      cellColor?: Color
      sectionColor?: Color
      xAxisColor?: Color
      zAxisColor?: Color
    }
  }
}
