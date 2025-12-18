// Shaders for terrain visualization

export const vertexShader = `
  uniform float uExaggeration;
  uniform sampler2D uTerrainTexture;

  varying float vElevation;
  varying vec2 vUv;

  // Mapbox Terrain-RGB height decoding formula
  // H = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
  float decodeHeight(vec3 rgb) {
    // RGB values are in 0-1 range, so multiply by 255 to get 0-255
    float r = rgb.r * 255.0;
    float g = rgb.g * 255.0;
    float b = rgb.b * 255.0;
    return -10000.0 + ((r * 256.0 * 256.0 + g * 256.0 + b) * 0.1);
  }

  void main() {
    vUv = uv;

    // Sample the terrain texture
    vec4 texel = texture2D(uTerrainTexture, uv);

    // Decode height from RGB (already in meters)
    float heightMeters = decodeHeight(texel.rgb);
    vElevation = heightMeters;

    // Displace the vertex in the Z direction
    vec3 newPosition = position;
    newPosition.z = heightMeters * uExaggeration * 0.0001; // Scale for visual effect

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`;

export const fragmentShader = `
  uniform float uHighlightElevation;
  uniform float uElevationThreshold;
  uniform vec3 uBelowColor;
  uniform vec3 uAboveColor;
  uniform vec3 uHighlightColor;
  uniform float uHighlightRange;

  varying float vElevation;
  varying vec2 vUv;

  void main() {
    // Base color determined by whether above or below threshold
    vec3 baseColor = vElevation >= uElevationThreshold ? uAboveColor : uBelowColor;

    // Check if within highlight range
    float distFromHighlight = abs(vElevation - uHighlightElevation);
    float highlightFactor = smoothstep(uHighlightRange, uHighlightRange * 0.5, distFromHighlight);

    // Mix in highlight color
    vec3 finalColor = mix(baseColor, uHighlightColor, highlightFactor);

    // Add some basic shading based on elevation for depth
    float shadeFactor = (vElevation - 1000.0) / 3000.0; // Normalize roughly for CO range
    shadeFactor = clamp(shadeFactor, 0.0, 1.0);
    finalColor = finalColor * (0.7 + shadeFactor * 0.3);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;
