/**
 * Calculates the angle in radians from the y-axis given x,y coordinates
 * @param {number} x - The x coordinate
 * @param {number} y - The y coordinate
 * @returns {number} Angle in % from the y-axis (0 to 1)
 */
const getPiePercentFromXY = (x, y) => {
  // Calculate angle from origin
  const angleFromOrigin = Math.atan2(y, x);

  // Convert to angle from y-axis
  // We subtract π/2 from the angle from origin to get the angle from y-axis
  let angleFromYAxis = angleFromOrigin + Math.PI / 2;

  // Normalize the angle to be between 0 and 2π
  if (angleFromYAxis < 0) {
    angleFromYAxis += 2 * Math.PI;
  }

  // Convert to % from y-axis
  angleFromYAxis /= 2 * Math.PI;

  // round to nearest %
  angleFromYAxis = Math.round(angleFromYAxis * 1000) / 1000;

  return angleFromYAxis;
};

export default getPiePercentFromXY;
