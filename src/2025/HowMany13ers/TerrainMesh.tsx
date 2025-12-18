import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders";
import { generateColoradoTerrainTexture } from "./generateTerrainTexture";

interface TerrainMeshProps {
  exaggeration: number;
  highlightElevation: number;
  elevationThreshold: number;
}

export default function TerrainMesh({
  exaggeration = 2.0,
  highlightElevation = 13879,
  elevationThreshold = 12000,
}: TerrainMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Generate procedural terrain texture
  const terrainTexture = useMemo(() => generateColoradoTerrainTexture(), []);

  // Create shader material with uniforms
  const shaderMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTerrainTexture: { value: terrainTexture },
        uExaggeration: { value: exaggeration },
        uHighlightElevation: { value: highlightElevation / 3.281 }, // Convert feet to meters
        uElevationThreshold: { value: elevationThreshold / 3.281 }, // Convert feet to meters
        uBelowColor: { value: new THREE.Color(0xcccccc) }, // Light gray
        uAboveColor: { value: new THREE.Color(0x00ff00) }, // Green
        uHighlightColor: { value: new THREE.Color(0x00ff00) }, // Bright green
        uHighlightRange: { value: 50.0 }, // meters
      },
      wireframe: false,
    });
  }, [terrainTexture]);

  // Update uniforms when props change
  useFrame(() => {
    if (meshRef.current && meshRef.current.material instanceof THREE.ShaderMaterial) {
      meshRef.current.material.uniforms.uExaggeration.value = exaggeration;
      meshRef.current.material.uniforms.uHighlightElevation.value = highlightElevation / 3.281;
      meshRef.current.material.uniforms.uElevationThreshold.value = elevationThreshold / 3.281;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} material={shaderMaterial}>
      <planeGeometry args={[10, 10, 256, 256]} />
    </mesh>
  );
}
