// 2D Vector funtions, loosely based on gl-matrix.js

var vec2 = {};

// A <- A+B
// TODO DEBUG - why doesn't this work in Path.parse?
vec2.add = function (a, b) {
  a[0] += b[0];
  a[1] += b[1];
  return a;
};

// Return A+B
vec2.add2 = function (a, b) {
  return [ a[0]+b[0], a[1]+b[1] ];
};

// Angle between two vectors
vec2.angle = function(u, v) {
  var a = Math.acos((u[0]*v[0] + u[1]*v[1]) / Math.sqrt((u[0]*u[0] + u[1]*u[1]) * (v[0]*v[0] + v[1]*v[1])));
  var sgn = u[0]*v[1] > u[1]*v[0] ? 1 : -1;
  return sgn * a;
};

// simple linear interpolation between two points
vec2.lerp = function(a, b, t) {
  return [ a[0] + (b[0]-a[0])*t, a[1] + (b[1]-a[1])*t ];
};

