/* 2D Concave shape rendering test - using even-odd stencil buffer method
 *
 * First of all, it works fine with OpenGL's 3D features turned off.
 *
 * FACE CULLING was causing trouble, whether or not DEPTH TEST is on.
 * FIX: disable face culling when drawing 2D concave polygons.
 *
 * DEPTH TEST alone also seems problematic with multiple polygons, but I'll
 * save that for another day, as we don't really need it in mostly-2D games.
 *
 * Also discovered that stencil antialiasing wants the FULL opacity, not half!
 *
 * TODO
 * - use a better matrix lib than Sylvester. 'mjs' looks good at a glance.
 * - onresize handler to fit user's window/device
 * - test+fix: antialiasing, lighting, texture, depth buffer (for "2.5-D" graphics)
 */


//
// WEBGL STUFF
//

// vim: sw=2 et
/*jslint browser: true, nomen: true, vars: true, indent: 2, white: true, */

// Globals (so we can fiddle with these in the console)
var gl, video;


define(['lib/domReady.js', 'lib/sylvester.src.js', 'lib/glUtils.js', 'lib/text!fs.glsl', 'lib/text!vs.glsl'],
    function(domReady, sylvester, glu, fs_src, vs_src) {
  "use strict";

// MODULE GLOBALS
var Status,
    ShaderProgram,
    Vertexes, quadVertexes,
    ColorBuffer, VertexPositionAttribute, VertexColorAttribute,
    perspectiveMatrix, mvMatrix;
    // TODO - shorter variable names...

domReady(function(){
  Status = document.getElementById('status');
  var canvas = document.getElementById("glcanvas");
  gl = null;
  var opts = {
    stencil: true
  }
  try {
    gl = canvas.getContext('webgl', opts)
       || canvas.getContext('experimental-webgl', opts);
  } catch(e) {}
  if (!gl) {
     log("WebGL init FAIL.");
  } else {
    log("WebGL init OK.");
    main();
  }
});

function log(text) {
  Status.innerHTML += text + "<br>";
}

function initShaders() {
  var fragmentShader = getShader(gl.FRAGMENT_SHADER, fs_src);
  var vertexShader = getShader(gl.VERTEX_SHADER, vs_src);
  if (!(fragmentShader && vertexShader)) return;

  ShaderProgram = gl.createProgram();
  gl.attachShader(ShaderProgram, vertexShader);
  gl.attachShader(ShaderProgram, fragmentShader);
  gl.linkProgram(ShaderProgram);

  if (!gl.getProgramParameter(ShaderProgram, gl.LINK_STATUS)) {
    log('Shader program init FAIL.');
    console.error('LINK ERROR:', gl.getProgramInfoLog(shader));
    return;
  }

  gl.useProgram(ShaderProgram);

  VertexPositionAttribute = gl.getAttribLocation(ShaderProgram, 'aVertexPosition');
  gl.enableVertexAttribArray(VertexPositionAttribute);

  //VertexColorAttribute = gl.getAttribLocation(ShaderProgram, 'aVertexColor');
  //gl.enableVertexAttribArray(VertexColorAttribute);
}

function getShader(type, src) {
  //console.info(src);
  var shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    var shaderTypes = {};
    shaderTypes[gl.FRAGMENT_SHADER] = 'FRAGMENT';
    shaderTypes[gl.VERTEX_SHADER] = 'VERTEX';
    log('Compile shader FAIL, type=' + shaderTypes[type]);
    console.error('COMPILE ERROR:', gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}



function loadIdentity() { mvMatrix = Matrix.I(4); }

function multMatrix(m) { mvMatrix = mvMatrix.x(m); }

function mvTranslate(v) { multMatrix(Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4()); }

function mvRotate(angle, v) {
  var inRadians = angle * Math.PI / 180.0;

  var m = Matrix.Rotation(inRadians, $V([v[0], v[1], v[2]])).ensure4x4();
  multMatrix(m);
}

function setMatrixUniforms() {
  var pUniform = gl.getUniformLocation(ShaderProgram, "uPMatrix");
  gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

  var mvUniform = gl.getUniformLocation(ShaderProgram, "uMVMatrix");
  gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.flatten()));
}

function mvPushMatrix(m) {
  if (m) {
    mvMatrixStack.push(m.dup());
    mvMatrix = m.dup();
  } else {
    mvMatrixStack.push(mvMatrix.dup());
  }
}

function mvPopMatrix() {
  if (!mvMatrixStack.length) {
    throw("Can't pop from an empty matrix stack.");
  }

  mvMatrix = mvMatrixStack.pop();
  return mvMatrix;
}



//
//
//

function initBuffers() {
  Vertexes = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, Vertexes);
  var vertexes = [
    0, 0,
    2, 0,
    3, 1,
    9, 1,
    10, 0,
    12, 0,
    12, 1,
    9, 4,
    3, 4,
    0, 1,
    0, 0
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexes), gl.STATIC_DRAW);

  // quad to backfill stencil..  = bounding box of above vertexes
  quadVertexes = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexes);
  var quadvertexes = [
    0, 0,
    12, 0,
    12, 4,
    0, 4
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadvertexes), gl.STATIC_DRAW);
}



//
// STENCIL TRICK TEST
//

var ANTIALIAS = 1;
var LIGHT = 1;
var DEPTH = 1;
var CULL = 0;
var TEXTURE = 1;

// disable fancy stuff for now...  TODO later
ANTIALIAS = 0;
LIGHT = 0;
DEPTH = 0;
TEXTURE = 0;

function draw() {
  //
  // TODO test/debug the DEPTH_TEST stuff... disabling it for the stencil & outline *seems* to work but I haven't really studied how it interacts with STENCIL_TEST... see Red Book ch.10
  //
  // Fancy stencil buffer method
  // Draws filled concave polygons without tesselation
  //
  // References:
  //    "Drawing Filled, Concave Polygons Using the Stencil Buffer"
  //    OpenGL Red Book, Chapter 14
  //    http://glprogramming.com/red/chapter14.html#name13
  //
  //    "Hardware accelerated polygon rendering", Zack Rusin, 2006.
  //    http://zrusin.blogspot.com/2006/07/hardware-accelerated-polygon-rendering.html
  //

  gl.enable (gl.STENCIL_TEST);

    var fill = [0,255,255, 255];

    // Compute a bounding box (for drawing a filled quad behind the stencil)
    var x1,y1,x2,y2;
    x1=y1=0;
    x2=12;
    y2=4;

gl.disable(gl.DEPTH_TEST);

    // Draw to stencil, using the even-odd rule for concave polygons
    gl.disable (gl.BLEND);
    gl.stencilMask (0x01);
    gl.stencilOp (gl.KEEP, gl.KEEP, gl.INVERT);  // INVERT = even-odd rule
    gl.stencilFunc (gl.ALWAYS, 0, ~0);
    gl.colorMask (false, false, false, false);

    gl.bindBuffer(gl.ARRAY_BUFFER, Vertexes);
    gl.vertexAttribPointer(VertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 11);

    gl.colorMask (true, true, true, true);

if(ANTIALIAS) {
    // Antialiasing: Draw aliased off-pixels to real
    gl.enable (gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.stencilFunc (gl.EQUAL, 0x00, 0x01);
    gl.stencilOp (gl.KEEP, gl.KEEP, gl.KEEP);

    gl.enable(gl.LINE_SMOOTH);  //TODO webgl equiv?
    glBegin (gl.LINE_LOOP);
    //gl.color4ub(fill[0], fill[1], fill[2], fill[3]/2);  // Half-transparent
    glColor4ubv(fill);  // Actually, this works better...  SWEET
      //draw_bridge();
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 11);
    glEnd ();
    gl.disable (gl.LINE_SMOOTH);
}

//glEnable(gl.DEPTH_TEST);

    // Draw a filled quad behind the stencil
    gl.stencilFunc (gl.EQUAL, 0x01, 0x01);
    gl.stencilOp (gl.ZERO, gl.ZERO, gl.ZERO);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexes);
    gl.vertexAttribPointer(VertexPositionAttribute, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

gl.enable(gl.DEPTH_TEST);

  gl.disable (gl.STENCIL_TEST);
}


function resize_view(w, h) {
  console.log("Resize to "+ w +"x"+ h);
/* TODO webgl equiv
  glViewport( 0,0, w,h );

  glMatrixMode( gl.PROJECTION );
  glLoadIdentity();
  //makeOrtho(0, S-1, 0, S-1, -1., 1.);
  makeOrtho(0, w-1, 0, h-1, -200., 2000.);

  // Go back to model mode for drawing!
  glMatrixMode( gl.MODELVIEW );   // TODO webgl equiv
  glLoadIdentity();
*/
}


function main() {
  //console.info("Depth bits: %d\n", glfwGetWindowParam(GLFW_DEPTH_BITS));
  //console.info("Stencil bits: %d\n", glfwGetWindowParam(GLFW_STENCIL_BITS));

  gl.clearColor(0,0,0, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //================================================================
  // GL settings
  //
  gl.disable(gl.DITHER);
  //gl.enable(gl.LINE_SMOOTH);
  gl.enable(gl.BLEND);
  //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if(LIGHT) {
    //GLfloat pos[4] = {500,500,1000,0};
    pos = [500,500,1000,0];
    glLightfv(gl.LIGHT0, gl.POSITION, pos); //TODO webgl equiv
    gl.enable(gl.LIGHTING);
    gl.enable(gl.LIGHT0);
    gl.enable(gl.COLOR_MATERIAL);
  }

    //gl.enable(gl.RESCALE_NORMAL);  // Rescale _unit length_ normals  XXX not in win32...
    //gl.enable(gl.NORMALIZE);     // Rescale _any length_ normals (slower)

  if(CULL) {
    gl.enable(gl.CULL_FACE);
    //gl.cullFace(gl.BACK);          // (this is the default)
    //gl.cullFace(gl.FRONT_AND_BACK);
  }

  if(DEPTH) {
    gl.enable(gl.DEPTH_TEST);
  }

  if(TEXTURE) {
    gl.enable(gl.TEXTURE_2D);
  }



  //================================================================
  initShaders();
  if(!ShaderProgram) return;
  initBuffers();

  //================================================================
  drawScene();
}

function drawScene() {
  gl.clear(gl.COLOR_BUFFER_BIT
      | gl.DEPTH_BUFFER_BIT
      | gl.STENCIL_BUFFER_BIT
      );
  perspectiveMatrix = makePerspective(45, 640/480, 0.1, 100);
  loadIdentity();
  mvTranslate([-5, 0, -20]);
  setMatrixUniforms();

  draw();

  //TODO: rotate and draw another copy to see how antialiasing looks
  //glRotatef(133.33, 0,0,1);   // TODO webgl equiv
  //draw();
}

}); //==================== END MODULE ===========================
