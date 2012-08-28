function parsePath(e) {
  console.log('Path');
  //console.dir(e);
  console.log(e.style.cssText);
  //console.log(e.attributes.d);

  var p = new Path();
  p.parse(e.attributes.d);
  console.log(p);
}

function parseCircle(e) {
  console.log('Circle');
}

function parseRect(e) {
  console.log('Rect');
}



var vtable = {
  path: parsePath,
  circle: parseCircle,
  rect: parseRect
};

function parseSVG(e) {
  var fn = vtable[e.tagName];
  if(fn) fn(e);
  $.each(e.children, function(i,e){parseSVG(e);});
}



// when DOMready
$(function(){
  // AJAX-load SVG file into a temporary DOM element, which parses it.
  // Then extract the vector data & styles.
  $('<div></div>')
  .load('test/kzerza.svg', function(res, status, xhr){
    var self=this;
    console.log(self);
    parseSVG(this);
  });
});
