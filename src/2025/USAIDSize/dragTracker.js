import { useState, useEffect, useCallback, useRef } from "react";
import getPiePercentFromXY from "./getPiePercentFromXY";
/**
 * Enhanced custom hook to track mouse/touch drag events with element coordinates
 * @param {Object} options - Configuration options
 * @param {boolean} [options.trackOutsideElement=true] - Whether to track movement outside the element
 * @param {function} [options.onDragStart] - Callback when drag starts, receives position data
 * @param {function} [options.onDragMove] - Callback during drag, receives position data
 * @param {function} [options.onDragEnd] - Callback when drag ends, receives position data
 * @returns {Object} Tracking data and event handlers
 */
const dragTracker = (options = {}) => {
  const {
    trackOutsideElement = true,
    onDragStart,
    onDragMove,
    onDragEnd,
  } = options;

  const elementRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({
    // Global (page) coordinates
    page: { x: 0, y: 0 },
    // Element-relative coordinates (where 0,0 is top-left of element)
    element: { x: 0, y: 0 },
    // Element offset from page
    elementOffset: { x: 0, y: 0 },
  });

  // Calculate element dimensions and update state
  const updateElementDimensions = useCallback(() => {
    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      setDimensions({
        width: rect.width,
        height: rect.height,
      });
    }
  }, []);

  // Update element dimensions on mount and window resize
  useEffect(() => {
    updateElementDimensions();

    const handleResize = () => {
      updateElementDimensions();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [updateElementDimensions]);

  // Extract position from mouse/touch event
  const getEventPosition = useCallback((e) => {
    // Handle both mouse and touch events
    let pageX, pageY;

    if (e.touches) {
      const touch = e.touches[0];
      pageX = touch.clientX;
      pageY = touch.clientY;
    } else {
      pageX = e.clientX;
      pageY = e.clientY;
    }

    // Get element's position on the page
    let elementX = 0;
    let elementY = 0;
    let offsetX = 0;
    let offsetY = 0;

    if (elementRef.current) {
      const rect = elementRef.current.getBoundingClientRect();
      // Calculate position relative to the element (where 0,0 is top-left of element)
      elementX = pageX - rect.left;
      elementY = pageY - rect.top;
      offsetX = rect.left;
      offsetY = rect.top;
    }

    return {
      page: { x: pageX, y: pageY },
      element: { x: elementX, y: elementY },
      elementOffset: { x: offsetX, y: offsetY },
    };
  }, []);

  // Handle drag start
  const handleDragStart = useCallback(
    (e) => {
      const newPosition = getEventPosition(e);
      setPosition(newPosition);
      setIsDragging(true);

      if (onDragStart) {
        onDragStart({
          ...newPosition,
          dimensions: dimensions,
        });
      }
    },
    [getEventPosition, onDragStart, dimensions]
  );

  // Handle drag move
  const handleDragMove = useCallback(
    (e) => {
      if (!isDragging) return;

      const newPosition = getEventPosition(e);
      setPosition(newPosition);

      if (onDragMove) {
        onDragMove({
          ...newPosition,
          dimensions: dimensions,
        });
      }
    },
    [isDragging, getEventPosition, onDragMove, dimensions]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (e) => {
      if (!isDragging) return;

      setIsDragging(false);

      if (onDragEnd) {
        onDragEnd({
          ...position,
          dimensions: dimensions,
        });
      }
    },
    [isDragging, position, onDragEnd, dimensions]
  );

  // Set up global event listeners if tracking outside element
  useEffect(() => {
    if (isDragging && trackOutsideElement) {
      window.addEventListener("mousemove", handleDragMove);
      window.addEventListener("touchmove", handleDragMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchend", handleDragEnd);

      return () => {
        window.removeEventListener("mousemove", handleDragMove);
        window.removeEventListener("touchmove", handleDragMove);
        window.removeEventListener("mouseup", handleDragEnd);
        window.removeEventListener("touchend", handleDragEnd);
      };
    }
  }, [isDragging, trackOutsideElement, handleDragMove, handleDragEnd]);

  // Event handlers to attach to element
  const eventHandlers = {
    onMouseDown: handleDragStart,
    onTouchStart: handleDragStart,
    ref: elementRef, // Pass the ref to be attached to the element
  };

  // If not tracking outside the element, attach move and end handlers directly
  if (!trackOutsideElement) {
    eventHandlers.onMouseMove = handleDragMove;
    eventHandlers.onTouchMove = handleDragMove;
    eventHandlers.onMouseUp = handleDragEnd;
    eventHandlers.onTouchEnd = handleDragEnd;
  }

  return {
    isDragging,
    position,
    dimensions,
    elementRef,
    eventHandlers,
  };
};

export default dragTracker;
