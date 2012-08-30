// Reverse lookup of GL constants (number -> string)
function glconst(k) {
  return _GLconstants[k] || "INVALID GL CONSTANT 0x"+ k.toString(16);
}
var _GLconstants = {};

function initUtils() {
  for (k in gl)
    if(k.match(/^[A-Z]/))
      _GLconstants[gl[k]] = k;
}



// BASED ON http://www.html5rocks.com/en/tutorials/webgl/webgl_fundamentals/

var loadShader = function(shaderSource, shaderType) {
  // Create the shader object
  var shader = gl.createShader(shaderType);

  // Load the shader source
  gl.shaderSource(shader, shaderSource);

  // Compile the shader
  gl.compileShader(shader);

  // Check the compile status
  var compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!compiled) {
    // Something went wrong during compilation; get the error
    lastError = gl.getShaderInfoLog(shader);
    throw("*** Error compiling shader '" + shader + "':" + lastError);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function getShader(id) {
  var script = document.getElementById(id);
  if (!script) {
    throw("*** Error: unknown script element" + id);
  }
  var src = script.text;

  var shaderType;
  switch(script.type) {
    case "x-shader/x-vertex":
      shaderType = gl.VERTEX_SHADER;
      break;
    case "x-shader/x-fragment":
      shaderType = gl.FRAGMENT_SHADER;
      break;
    default:
      throw("*** Error: unknown shader type "+ script.type);
      return null;
  }

  return loadShader(src, shaderType);
};

var loadProgram = function(shaders /*, opt_attribs, opt_locations*/) {
  var program = gl.createProgram();
  for (var ii = 0; ii < shaders.length; ++ii) {
    gl.attachShader(program, shaders[ii]);
  }
/* WTF is this?
  if (opt_attribs) {
    for (var ii = 0; ii < opt_attribs.length; ++ii) {
      gl.bindAttribLocation(
          program,
          opt_locations ? opt_locations[ii] : ii,
          opt_attribs[ii]);
    }
  }
*/
  gl.linkProgram(program);

  // Check the link status
  var linked = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!linked) {
      // something went wrong with the link
      lastError = gl.getProgramInfoLog (program);
      throw("Error in program linking:" + lastError);

      gl.deleteProgram(program);
      return null;
  }
  return program;
};
