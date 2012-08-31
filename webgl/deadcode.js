// Removed from Path.prototype.render()
// looks like this trick may not work in WebGL / OpenGL ES
if(ANTIALIAS) {
    // Antialiasing: Draw aliased off-pixels to real
    gl.enable (gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.stencilFunc (gl.EQUAL, 0x00, 0x01);
    gl.stencilOp (gl.KEEP, gl.KEEP, gl.KEEP);

    //TODO gl.enable(gl.LINE_SMOOTH);  //TODO webgl equiv?
    //gl.color4ub(fill[0], fill[1], fill[2], fill[3]*0.5);  // 50% alpha
    //gl.color4ubv(fill);  // Actually, 100% alpha works better than 50%
    gl.drawArrays(gl.LINE_LOOP, 0, 11);
    //TODO gl.disable (gl.LINE_SMOOTH);
}
