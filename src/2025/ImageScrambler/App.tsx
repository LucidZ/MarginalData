import { useState, useRef } from "react";
import "./App.css";
import { Pixel } from "./types";
import { rgbToHsl } from "./utils";

export default function ImageScrambler() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageSorted, setImageSorted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("https://picsum.photos/400/300");
  const [numSteps, setNumSteps] = useState(5);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const sortedCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationCanvasRef = useRef<HTMLCanvasElement>(null);

  const pixelsRef = useRef<Pixel[]>([]);
  const sortedPixelsRef = useRef<Pixel[]>([]);
  const imageDataRef = useRef<ImageData | null>(null);
  const animationIdRef = useRef<number | null>(null);

  const loadImage = async () => {
    const url = imageUrl.trim();
    if (!url) {
      setStatusMessage("Please enter an image URL");
      return;
    }

    setStatusMessage("Loading image...");

    try {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const width = img.width;
        const height = img.height;

        const originalCanvas = originalCanvasRef.current;
        const sortedCanvas = sortedCanvasRef.current;
        const animationCanvas = animationCanvasRef.current;

        if (!originalCanvas || !sortedCanvas || !animationCanvas) return;

        originalCanvas.width = width;
        originalCanvas.height = height;
        sortedCanvas.width = width;
        sortedCanvas.height = height;
        animationCanvas.width = width;
        animationCanvas.height = height;

        const ctx = originalCanvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;

        ctx.drawImage(img, 0, 0);
        imageDataRef.current = ctx.getImageData(0, 0, width, height);

        extractPixels();
        setImageLoaded(true);
        setStatusMessage("");
      };

      img.onerror = () => {
        setStatusMessage("Failed to load image. Try a different URL or check CORS settings.");
      };

      img.src = url;
    } catch (error) {
      setStatusMessage(`Error loading image: ${error}`);
    }
  };

  const extractPixels = () => {
    if (!imageDataRef.current) return;

    const pixels: Pixel[] = [];
    const data = imageDataRef.current.data;
    const width = imageDataRef.current.width;
    const height = imageDataRef.current.height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        const hsl = rgbToHsl(r, g, b);

        pixels.push({
          x,
          y,
          r,
          g,
          b,
          a,
          hue: hsl.h,
          saturation: hsl.s,
          lightness: hsl.l,
        });
      }
    }

    pixelsRef.current = pixels;
  };

  const applySorting = (sortFn: (a: Pixel, b: Pixel) => number, message: string) => {
    if (!imageDataRef.current || !sortedCanvasRef.current) return;

    setStatusMessage(message);

    setTimeout(() => {
      sortedPixelsRef.current = [...pixelsRef.current].sort(sortFn);

      const width = imageDataRef.current!.width;
      const height = imageDataRef.current!.height;
      const ctx = sortedCanvasRef.current!.getContext("2d");
      if (!ctx) return;

      const sortedImageData = ctx.createImageData(width, height);

      sortedPixelsRef.current.forEach((pixel, i) => {
        const x = i % width;
        const y = Math.floor(i / width);
        const idx = (y * width + x) * 4;

        sortedImageData.data[idx] = pixel.r;
        sortedImageData.data[idx + 1] = pixel.g;
        sortedImageData.data[idx + 2] = pixel.b;
        sortedImageData.data[idx + 3] = pixel.a;

        pixel.sortedX = x;
        pixel.sortedY = y;
      });

      ctx.putImageData(sortedImageData, 0, 0);

      setImageSorted(true);
      setStatusMessage("");
    }, 10);
  };

  const sortByHue = () => {
    applySorting((a, b) => a.hue - b.hue, "Sorting pixels by hue...");
  };

  const sortByHuePlusLightness = () => {
    applySorting(
      (a, b) => (a.hue + a.lightness) - (b.hue + b.lightness),
      "Sorting pixels by hue + lightness..."
    );
  };

  const sortByRandom = () => {
    applySorting(() => Math.random() - 0.5, "Shuffling pixels randomly...");
  };

  const shuffleNearby = () => {
    if (!imageDataRef.current || !sortedCanvasRef.current) return;

    setStatusMessage("Shuffling pixels nearby...");

    setTimeout(() => {
      const width = imageDataRef.current!.width;
      const height = imageDataRef.current!.height;
      const ctx = sortedCanvasRef.current!.getContext("2d");
      if (!ctx) return;

      const shuffleRadius = Math.min(width, height) * 0.3; // 30% of smaller dimension

      // Create a shuffled copy where each pixel moves to a nearby location
      const shuffled = [...pixelsRef.current].map(pixel => {
        // Random angle and distance
        const angle = Math.random() * 2 * Math.PI;
        const distance = Math.random() * shuffleRadius;

        // Calculate new position
        const newX = Math.round(pixel.x + Math.cos(angle) * distance);
        const newY = Math.round(pixel.y + Math.sin(angle) * distance);

        // Clamp to image bounds
        const clampedX = Math.max(0, Math.min(width - 1, newX));
        const clampedY = Math.max(0, Math.min(height - 1, newY));

        return {
          ...pixel,
          sortedX: clampedX,
          sortedY: clampedY
        };
      });

      sortedPixelsRef.current = shuffled;

      const sortedImageData = ctx.createImageData(width, height);

      shuffled.forEach((pixel) => {
        const x = pixel.sortedX!;
        const y = pixel.sortedY!;
        const idx = (y * width + x) * 4;

        sortedImageData.data[idx] = pixel.r;
        sortedImageData.data[idx + 1] = pixel.g;
        sortedImageData.data[idx + 2] = pixel.b;
        sortedImageData.data[idx + 3] = pixel.a;
      });

      ctx.putImageData(sortedImageData, 0, 0);

      setImageSorted(true);
      setStatusMessage("");
    }, 10);
  };

  const animateReturn = () => {
    if (!imageDataRef.current || !animationCanvasRef.current) return;

    const totalSteps = numSteps;

    // Calculate progress milestones: 0%, 50%, 75%, 87.5%, ..., 100%
    const progressMilestones: number[] = [0];
    for (let i = 1; i < totalSteps; i++) {
      progressMilestones.push(1 - Math.pow(0.5, i));
    }
    progressMilestones.push(1);

    setStatusMessage(`Step 1/${totalSteps}: ${(progressMilestones[1] * 100).toFixed(1)}% home`);
    setIsAnimating(true);

    const width = imageDataRef.current.width;
    const height = imageDataRef.current.height;
    const ctx = animationCanvasRef.current.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(0, 0, width, height);

    let currentStep = 0;
    const stepDuration = 600;
    const pauseBetweenSteps = 200;
    let startTime = Date.now();
    let isInPause = false;

    const drawFrame = (progress: number) => {
      const animImageData = ctx!.createImageData(width, height);

      sortedPixelsRef.current.forEach((pixel) => {
        const currentX = pixel.sortedX! + (pixel.x - pixel.sortedX!) * progress;
        const currentY = pixel.sortedY! + (pixel.y - pixel.sortedY!) * progress;

        const x = Math.round(currentX);
        const y = Math.round(currentY);

        if (x >= 0 && x < width && y >= 0 && y < height) {
          const idx = (y * width + x) * 4;
          animImageData.data[idx] = pixel.r;
          animImageData.data[idx + 1] = pixel.g;
          animImageData.data[idx + 2] = pixel.b;
          animImageData.data[idx + 3] = pixel.a;
        }
      });

      ctx!.putImageData(animImageData, 0, 0);
    };

    const animate = () => {
      const elapsed = Date.now() - startTime;

      if (isInPause) {
        if (elapsed >= pauseBetweenSteps) {
          isInPause = false;
          currentStep++;
          if (currentStep >= totalSteps) {
            setStatusMessage("Complete!");
            setTimeout(() => {
              setStatusMessage("");
              setIsAnimating(false);
            }, 1000);
            return;
          }
          startTime = Date.now();
          const nextProgress = progressMilestones[currentStep + 1];
          setStatusMessage(`Step ${currentStep + 1}/${totalSteps}: ${(nextProgress * 100).toFixed(1)}% home`);
        }
        animationIdRef.current = requestAnimationFrame(animate);
        return;
      }

      const stepProgress = Math.min(elapsed / stepDuration, 1);
      const easeProgress = 1 - Math.pow(1 - stepProgress, 3);

      const startProgress = progressMilestones[currentStep];
      const endProgress = progressMilestones[currentStep + 1];
      const currentProgress = startProgress + (endProgress - startProgress) * easeProgress;

      drawFrame(currentProgress);

      if (stepProgress < 1) {
        animationIdRef.current = requestAnimationFrame(animate);
      } else {
        isInPause = true;
        startTime = Date.now();
        animationIdRef.current = requestAnimationFrame(animate);
      }
    };

    animate();
  };

  const reset = () => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = null;
    }

    if (sortedCanvasRef.current) {
      const ctx = sortedCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, sortedCanvasRef.current.width, sortedCanvasRef.current.height);
      }
    }

    if (animationCanvasRef.current) {
      const ctx = animationCanvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, animationCanvasRef.current.width, animationCanvasRef.current.height);
      }
    }

    sortedPixelsRef.current = [];
    setImageSorted(false);
    setIsAnimating(false);
    setStatusMessage("");
  };

  return (
    <div className="image-scrambler">
      <header>
        <h1>Image Scrambler</h1>
        <p className="subtitle">Sort pixels by hue, then watch them return home</p>
      </header>

      <div className="input-section">
        <div className="input-group">
          <input
            type="text"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="Paste image URL (JPG or PNG)..."
            onKeyDown={(e) => e.key === "Enter" && loadImage()}
          />
          <button onClick={loadImage}>Load Image</button>
        </div>
        <div className="controls">
          <button onClick={sortByHue} disabled={!imageLoaded || isAnimating}>
            Sort by Hue
          </button>
          <button onClick={sortByHuePlusLightness} disabled={!imageLoaded || isAnimating}>
            Sort by Hue + Lightness
          </button>
          <button onClick={sortByRandom} disabled={!imageLoaded || isAnimating}>
            Sort Randomly
          </button>
          <button onClick={shuffleNearby} disabled={!imageLoaded || isAnimating}>
            Shuffle Nearby
          </button>
          <div className="steps-control">
            <label htmlFor="numSteps">Animation steps:</label>
            <input
              id="numSteps"
              type="number"
              min="2"
              max="10"
              value={numSteps}
              onChange={(e) => setNumSteps(Math.max(2, Math.min(10, parseInt(e.target.value) || 2)))}
              disabled={isAnimating}
            />
          </div>
          <button onClick={animateReturn} disabled={!imageSorted || isAnimating}>
            Animate Return
          </button>
          <button onClick={reset} disabled={!imageLoaded}>
            Reset
          </button>
        </div>
      </div>

      {statusMessage && <div className="status">{statusMessage}</div>}

      <div className="canvas-container">
        <div className="canvas-wrapper">
          <h2>Original</h2>
          <canvas ref={originalCanvasRef}></canvas>
        </div>
        <div className="canvas-wrapper">
          <h2>Sorted by Hue</h2>
          <canvas ref={sortedCanvasRef}></canvas>
        </div>
        <div className="canvas-wrapper animation-canvas">
          <h2>Animation: Pixels Returning Home</h2>
          <canvas ref={animationCanvasRef}></canvas>
        </div>
      </div>
    </div>
  );
}
