/* vim: set sw=2 et: */
/*jslint  browser: true, nomen: true, vars: true, indent: 2, white: true, */

(function(){
  "use strict";

  // MODULE GLOBALS
  var keyState = [];
  var ShaderProgram,
      ob = {},
      attr = {};
  var MVmatrix = null;
  var scale = [0.1, 0.1, 1];
  var skins = {};

  window.ob = ob;
  window.attr = attr;

  // INITIALIZATION - when DOMready
  $(function(){
    //initKeys();
    async.series([
      initGL,
      setupGL,
      loadSVG,
    ],
    function(err, results){
      if(err) {
        console.error(err);
        return;
      }

      console.log("Preparing to render");
      gl.clear(gl.COLOR_BUFFER_BIT
          | gl.DEPTH_BUFFER_BIT
          | gl.STENCIL_BUFFER_BIT
          );
      skins.kzerza.render();
    });
  });

  function resize(){
    console.log("window inner w/h:", window.innerWidth, window.innerHeight);
    console.log("glcanvas client w/h:", glcanvas.clientWidth, glcanvas.clientHeight);
    var w = glcanvas.clientWidth;
    var h = glcanvas.clientHeight;
    glcanvas.width = w;
    glcanvas.height = h;
    //console.log("glcanvas size:", glcanvas.width, glcanvas.height);
    //console.log("drawingBufferWidth/Height:", gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    MVmatrix = mat4.create();
    mat4.identity(MVmatrix);
    mat4.rotateZ( MVmatrix, 15*(Math.PI/180));
    mat4.translate( MVmatrix, [-0.6,0,0] );
    mat4.scale( MVmatrix, scale );
    console.log(mat4.str(MVmatrix));

    gl.uniformMatrix4fv(
        gl.getUniformLocation(ShaderProgram, "uMVmatrix"),
        false, new Float32Array(MVmatrix) );
  }



  function initGL(callback) {
    window.glcanvas = document.getElementById("glcanvas");
    window.gl = null;
    var opts = {
      stencil: true,
      //antialias: true,   //not implemented in browsers/drivers?
      //premultipliedAlpha: false,
      //alpha: false,
    }
    try {
      window.gl = glcanvas.getContext('webgl', opts)
        || glcanvas.getContext('experimental-webgl', opts);
    } catch(e) {}
    if (!gl) {
      console.error("WebGL init FAIL.");
      document.getElementById('fail').style.display='';
      callback("WebGL init failed.");
    } else {
      console.info("WebGL init OK.");
      callback();
    }
  }

  function setupGL(callback) {
    initUtils();


    gl.clearColor(0,0,0, 1);
    gl.disable(gl.DITHER);
    //gl.enable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);

    initShaders();
    if(!ShaderProgram) callback("initShaders failed.");

    resize();
    //window.onresize = resize;

    callback();
  }



  function initShaders() {
    var vs = getShader('vs');
    var fs = getShader('fs');
    ShaderProgram = loadProgram([vs, fs]);
    gl.useProgram(ShaderProgram);

    attr.vertexPosition = gl.getAttribLocation(ShaderProgram, 'aVertexPosition');
    gl.enableVertexAttribArray(attr.vertexPosition);

    //attr.textureCoord = gl.getAttribLocation(ShaderProgram, 'aTextureCoord');
    //gl.enableVertexAttribArray(attr.textureCoord);
  }

  function loadSVG(callback) {
    // AJAX-load SVG file into a temporary DOM element, which parses it.
    // Then extract the vector data & styles.
    $('<div></div>')
    .load('test/kzerza.svg', function(res, status, xhr){
      skins.kzerza = new Sprite('kzerza', this);
      console.log(skins.kzerza);
      callback();
    });
  }

})();
