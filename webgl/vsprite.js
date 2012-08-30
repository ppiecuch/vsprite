var Sprite = function(name, svg){
  this.name = name;
  this.paths = [];
  //TODO other stuff..
  this.parseSVG(svg);
};
Sprite.prototype = Object.create(Object.prototype);
Sprite.prototype.toString = function(){ return "Sprite<"+ this.name +">"; };



var parsePath = function(e) {
  console.log('Path');
  //console.dir(e);
  console.log(e.style.cssText);
  //console.log(e.attributes.d);

  var p = new Path();
  p.parse(e.attributes.d);
  p.initBuffers();
  //TODO path styles
  console.log(p);
  this.paths.push(p);
}

var parseCircle = function(e) {
  console.log('Circle');
}

var parseRect = function(e) {
  console.log('Rect');
}



var vtable = {
  path: parsePath,
  circle: parseCircle,
  rect: parseRect
};

Sprite.prototype.parseSVG = function(e) {
  var fn = vtable[e.tagName];
  if(fn) fn.call(this, e);
  for(var i in e.childNodes) {
    this.parseSVG(e.childNodes[i]);
  }
}

Sprite.prototype.render = function() {
  this.paths[0].render(); //TODO
}
