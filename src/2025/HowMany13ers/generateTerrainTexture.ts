import * as THREE from "three";

/**
 * Generates a procedural terrain texture simulating Colorado's elevation
 * This is a fallback when real terrain tiles aren't available
 */
export function generateColoradoTerrainTexture(): THREE.DataTexture {
  const size = 512;
  const data = new Uint8Array(size * size * 4);

  // Colorado elevation roughly: 3,300 ft (1,000m) to 14,440 ft (4,400m)
  // Most of the state is high plains (1,000-1,800m) with Rocky Mountains (2,500-4,400m)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // Normalized coordinates
      const nx = x / size;
      const ny = y / size;

      // Create mountain range in western portion (left 40% of texture)
      // Colorado's Rockies are in the west
      let elevation = 1200; // Base elevation (plains)

      if (nx < 0.5) {
        // Mountain region
        // Use multiple octaves of sine waves to create peaks
        const mountainFactor =
          Math.sin(ny * 12 + Math.sin(nx * 8) * 0.5) *
            Math.cos(nx * 10 + Math.sin(ny * 6) * 0.3) +
          Math.sin(ny * 20) * 0.3 +
          Math.sin(nx * 15 + ny * 15) * 0.2;

        // Distance from mountain center (western portion)
        const distFromCenter = Math.abs(nx - 0.25) * 4;
        const mountainHeight = Math.max(
          0,
          (1 - distFromCenter) * (2500 + mountainFactor * 800)
        );

        elevation += mountainHeight;
      } else {
        // Eastern plains with some rolling hills
        const hillFactor = Math.sin(nx * 20) * Math.cos(ny * 15) * 200;
        elevation += hillFactor;
      }

      // Add some noise for texture
      const noise =
        (Math.sin(x * 0.1) * Math.cos(y * 0.1) +
          Math.sin(x * 0.05 + y * 0.05) * 0.5) *
        50;
      elevation += noise;

      // Clamp elevation to reasonable Colorado range
      elevation = Math.max(1000, Math.min(4400, elevation));

      // Encode elevation using Mapbox Terrain-RGB format
      // H = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
      // Solving for RGB: (H + 10000) / 0.1 = R * 65536 + G * 256 + B
      const heightValue = Math.floor((elevation + 10000) / 0.1);

      const r = Math.floor(heightValue / 65536);
      const g = Math.floor((heightValue % 65536) / 256);
      const b = Math.floor(heightValue % 256);

      data[i] = r; // R
      data[i + 1] = g; // G
      data[i + 2] = b; // B
      data[i + 3] = 255; // A
    }
  }

  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  return texture;
}
