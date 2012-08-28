
var kMaxShipSize = 5;     // Maximum ship size (meters)
var kCirclePoints = 25;   // Number of points in a circle
var kBezierPoints = 20;   // Number of points in a Bezier curve


var Path = function(){
  this.loops = [];
  this.opacity = 1.0;
  this.fill = [0,0,0,0];
  this.stroke = [0,0,0,0];
  this.gradient = [];
  this.transform = [];
  this.reset();
};
Path.prototype = Object.create(Object.prototype);
//Path.prototype.toString = function(){ return [this.name, " @", this.x, ",", this.y].join(' '); };

Path.prototype.reset = function(){
  this.curloop = [];
};

Path.prototype.finish = function(){
  if(this.curloop.length > 0) {
    this.loops.push(this.curloop);
    delete this.curloop;
  }
  delete this.xy;
  //console.log(this.loops);
};

Path.prototype.push = function(point){
  this.curloop.push(point);
};

Path.prototype.close = function(){
  this.curloop.push(this.curloop[0]);
  this.finish();
};

Path.prototype.render = function(){
};

Path.prototype.dump = function(){
};

Path.prototype.parse = function(d){
  this.xy = [0,0];   // temp
  this.d = d.value;
  this.p = 0;

  for(;;) {
    this.parseWhitespace();
    if(this.p >= this.d.length)
      break;

    var c = this.d[this.p++];
    var xy, coord;
    switch(c) {
      case 'M':
        // move, absolute
        while(xy = this.parseXY()) {
          this.push(xy);
        }
        break;
      case 'm':
        // move, relative
        while(xy = this.parseXY()) {
          vec2.add(this.xy, xy);
          this.push(this.xy);
        }
        break;
      case 'L':
        //Line, absolute
        while(xy = this.parseXY()) {
          this.push(xy);
        }
        break;
      case 'l':
        // Line, relative
        while(xy = this.parseXY()) {
          vec2.add(this.xy, xy);
          this.push(this.xy);
        }
        break;
      case 'A':
        this.parseArc(false);
        break;
      case 'a':
        this.parseArc(true);
        break;
      case 'C':
        // cubic Bézier curve, absolute
        this.parseCurve(false);
        break;
      case 'c':
        // cubic Bézier curve, relative
        this.parseCurve(true);
        break;
      case 'H':
        // Horizontal lineto, absolute
        while(parseNumber()) {
          this.xy[0] = coord;
          this.push(this.xy);
        }
        break;
      case 'h':
        // Horizontal lineto, relative
        while(parseNumber()) {
          this.xy[0] += coord;
          this.push(this.xy);
        }
        break;
      case 'V':
        // Vertical lineto, absolute
        while(parseNumber()) {
          this.xy[1] = coord;
          this.push(this.xy);
        }
        break;
      case 'v':
        // Vertical lineto, relative
        while(parseNumber()) {
          this.xy[1] += coord;
          this.push(this.xy);
        }
        break;
      case 'Z':
        // closepath
        // Fall through
      case 'z':
        // closepath
        this.close();
        return true;
      default:
        console.debug('Invalid/unimplemented SVG PATH command: '+ c);
        // Skip the command
        var m = this.d.slice(this.p).match(/^[^a-zA-Z]*/);
        console.log("Skipping", m[0]);
        this.p += m[0].length;
        break;
    }
  }
  this.finish();
  return true;
};

Path.prototype.parseWhitespace = function(){
  while( this.d[this.p] == ' ' )  ++this.p;
};

Path.prototype.parseNum = function(){
  var re = /^\s*([-+]?\d+(?:\.\d+)?)/;
  var m = this.d.slice(this.p).match(re);
  if(m) {
    this.p += m[0].length;
    return Number(m[1]);
  }
  return false;
};

Path.prototype.parseXY = function(){
  var re = /^\s*([-+]?\d+(?:\.\d+)?),([-+]?\d+(?:\.\d+)?)/;
  var m = this.d.slice(this.p).match(re);
  if(m) {
    this.p += m[0].length;
    return [Number(m[1]), Number(m[2])];
  }
  return false;
};

Path.prototype.parseArc = function(offset){
  var num = [];
  var n;
  while(n = parseNum()) {
    num.push(n);
  }
  var k = 0;
  for(var j=1; j <= num.length/7; j++) {
    var radii = [num[k], num[k+1]];
    var phi = num[k+2];
    var large_arc = num[k+3] == 1 ? true : false;
    var sweep = num[k+4] == 1 ? true : false;
    var off = offset ? this.xy : [0,0];
    var end = [ off[0] + num[k+5], off[1] + num[k+6] ];
    this.arcTo(radii, phi, large_arc, sweep, end);
    k+=7;
  }
};

/*
 * Elliptical arc
 * http://www.w3.org/TR/2003/REC-SVG11-20030114/implnote.html#ArcImplementationNotes
 * Ported from Squirtle
 */
Path.prototype.arcTo = function(radii, phi, large_arc, sweep, end) {
  var rx = radii.x;
  var ry = radii.y;
  var x1 = pos.x;
  var y1 = pos.y;
  var x2 = end.x;
  var y2 = end.y;
  var cp = Math.cos(phi);
  var sp = Math.sin(phi);
  var dx = .5 * (x1 - x2);
  var dy = .5 * (y1 - y2);
  var x_ = cp * dx + sp * dy;
  var y_ = -sp * dx + cp * dy;
  var r2 = (Math.pow(rx * ry, 2) - Math.pow(rx * y_,2) - Math.pow(ry * x_,2)) /
           (Math.pow(rx * y_, 2) + Math.pow(ry * x_,2));
  if (r2 < 0) r2 = 0;
  var r = sqrt(r2);
  if (large_arc == sweep) r = -r;
  var cx_ = r * rx * y_ / ry;
  var cy_ = -r * ry * x_ / rx;
  var cx = cp * cx_ - sp * cy_ + .5 * (x1 + x2);
  var cy = sp * cx_ + cp * cy_ + .5 * (y1 + y2);

  var psi = vec2.angle(b2Vec2(1,0), b2Vec2((x_ - cx_)/rx, (y_ - cy_)/ry));
  var delta = vec2.angle(b2Vec2((x_ - cx_)/rx, (y_ - cy_)/ry),
                         b2Vec2((-x_ - cx_)/rx, (-y_ - cy_)/ry));
  if (sweep && delta < 0) delta += b2_pi * 2;
  if (!sweep && delta > 0) delta -= b2_pi * 2;
  var n_points = Math.max(Math.floor(Math.abs(kCirclePoints * delta / (2 * Math.pi))), 1);

  for(var i = 0; i < n_points; i++) {
    var theta = psi + i * delta / n_points;
    var ct = Math.cos(theta);
    var st = Math.sin(theta);
    this.xy = [cp*rx*ct - sp*ry*st + cx,
               sp*rx*ct + cp*ry*st + cy];
    this.push(this.xy);
  }
}

Path.prototype.parseCurve = function(offset){
  var bez = [];   // Bezier points
  var point;
  while(point = this.parseXY()) {
    bez.push(point);
  }
  for(var i=0; i < bez.length; i+=3) {
    var off = offset ? this.xy : [0,0];
    for(var j=0; j < kBezierPoints; j++) {
      var t = j / (kBezierPoints - 1);
      point = this.cubicBezier(t, this.xy, vec2.add2(bez[i],off), vec2.add2(bez[i+1],off), vec2.add2(bez[i+2],off));
      this.push(point);
    }
    this.xy = vec2.add2( bez[i+2], off );
  }
};

/* DeCasteljau Algorithm: http://www.cubic.org/docs/bezier.htm
 * Create a cubic Bézier curve
 * t goes from 0 to 1.0
*/
Path.prototype.cubicBezier = function(t, a, b, c, d) {
  var ab = vec2.lerp(a,b,t);      // point between a and b (green)
  var bc = vec2.lerp(b,c,t);      // point between b and c (green)
  var cd = vec2.lerp(c,d,t);      // point between c and d (green)
  var abbc = vec2.lerp(ab,bc,t);  // point between ab and bc (blue)
  var bccd = vec2.lerp(bc,cd,t);  // point between bc and cd (blue)
  return vec2.lerp(abbc,bccd,t);  // point on the bezier-curve (black)
}
