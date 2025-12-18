import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Suspense } from "react";
import TerrainMesh from "./TerrainMesh";

interface TerrainSceneProps {
  exaggeration: number;
  highlightElevation: number;
  elevationThreshold: number;
}

export default function TerrainScene({
  exaggeration,
  highlightElevation,
  elevationThreshold,
}: TerrainSceneProps) {
  return (
    <div style={{ width: "100%", height: "600px", background: "#000" }}>
      <Canvas>
        <PerspectiveCamera makeDefault position={[0, 10, 15]} />
        <OrbitControls
          enableZoom={true}
          enablePan={true}
          minDistance={5}
          maxDistance={30}
        />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        <Suspense fallback={null}>
          <TerrainMesh
            exaggeration={exaggeration}
            highlightElevation={highlightElevation}
            elevationThreshold={elevationThreshold}
          />
        </Suspense>
        <gridHelper args={[20, 20]} />
      </Canvas>
    </div>
  );
}
