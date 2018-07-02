// ======================================================================
// tom's SVG path parser  2010-04-03
//
// - Simple top-down parser/lexer in the style of 'META II' [Schorre 1964]
//

#include "svg.h"

//========================================================================

#include <ctype.h>
#include <stdio.h>
#include <errno.h>
//#include "uthash/utstring.h"
#include "uthash/uthash.h"

// XXX CRUFT...
const float32 kMaxShipSize = 5;  // Maximum ship size (meters)
const int kCirclePoints = 25;   // Number of points in a circle
const int kBezierPoints = 20;   // Number of points in a Bezier curve

//========================================================================

// Module-global state (nope, this isn't reentrant/threadsafe...)
FILE *input;
bool svg_debug = false;
bool lex_debug = false;
float32 width, height;

#ifdef __APPLE__

# define INITIAL_ALLOC 64

struct data
{
  char **buf; /* User's argument.  */
  size_t *len; /* User's argument.  Smaller of pos or eof.  */
  size_t pos; /* Current position.  */
  size_t eof; /* End-of-file position.  */
  size_t allocated; /* Allocated size of *buf, always > eof.  */
  char c; /* Temporary storage for byte overwritten by NUL, if pos < eof.  */
};
typedef struct data data;

static int
mem_write (void *c, const char *buf, int n)
{
  data *cookie = c;
  char *cbuf = *cookie->buf;

  /* Be sure we don't overflow.  */
  if ((ssize_t) (cookie->pos + n) < 0)
    {
      errno = EFBIG;
      return EOF;
    }
  /* Grow the buffer, if necessary.  Use geometric growth to avoid
     quadratic realloc behavior.  Overallocate, to accomodate the
     requirement to always place a trailing NUL not counted by length.
     Thus, we want max(prev_size*1.5, cookie->pos+n+1).  */
  if (cookie->allocated <= cookie->pos + n)
    {
      size_t newsize = cookie->allocated * 3 / 2;
      if (newsize < cookie->pos + n + 1)
        newsize = cookie->pos + n + 1;
      cbuf = realloc (cbuf, newsize);
      if (!cbuf)
        return EOF;
      *cookie->buf = cbuf;
      cookie->allocated = newsize;
    }
  /* If we have previously done a seek beyond eof, ensure all
     intermediate bytges are NUL.  */
  if (cookie->eof < cookie->pos)
    memset (cbuf + cookie->eof, '\0', cookie->pos - cookie->eof);
  memcpy (cbuf + cookie->pos, buf, n);
  cookie->pos += n;
  /* If the user has previously written beyond the current position,
     remember what the trailing NUL is overwriting.  Otherwise,
     extend the stream.  */
  if (cookie->eof < cookie->pos)
    cookie->eof = cookie->pos;
  else
    cookie->c = cbuf[cookie->pos];
  cbuf[cookie->pos] = '\0';
  *cookie->len = cookie->pos;
  return n;
}
static fpos_t
mem_seek (void *c, fpos_t pos, int whence)
{
  data *cookie = c;
  off_t offset = pos;

  if (whence == SEEK_CUR)
    offset += cookie->pos;
  else if (whence == SEEK_END)
    offset += cookie->eof;
  if (offset < 0)
    {
      errno = EINVAL;
      offset = -1;
    }
  else if ((size_t) offset != offset)
    {
      errno = ENOSPC;
      offset = -1;
    }
  else
    {
      if (cookie->pos < cookie->eof)
        {
          (*cookie->buf)[cookie->pos] = cookie->c;
          cookie->c = '\0';
        }
      cookie->pos = offset;
      if (cookie->pos < cookie->eof)
        {
          cookie->c = (*cookie->buf)[cookie->pos];
          (*cookie->buf)[cookie->pos] = '\0';
          *cookie->len = cookie->pos;
        }
      else
        *cookie->len = cookie->eof;
    }
  return offset;
}
static int
mem_close (void *c)
{
  data *cookie = c;
  char *buf;

  /* Be nice and try to reduce excess memory.  */
  buf = realloc (*cookie->buf, *cookie->len + 1);
  if (buf)
    *cookie->buf = buf;
  free (cookie);
  return 0;
}
FILE *
open_memstream (char **buf, size_t *len)
{
  FILE *f;
  data *cookie;

  if (!buf || !len)
    {
      errno = EINVAL;
      return NULL;
    }
  if (!(cookie = malloc (sizeof *cookie)))
    return NULL;
  if (!(*buf = malloc (INITIAL_ALLOC)))
    {
      free (cookie);
      errno = ENOMEM;
      return NULL;
    }
  **buf = '\0';
  *len = 0;

  f = funopen (cookie, NULL, mem_write, mem_seek, mem_close);
  if (!f)
    {
      int saved_errno = errno;
      free (cookie);
      errno = saved_errno;
    }
  else
    {
      cookie->buf = buf;
      cookie->len = len;
      cookie->pos = 0;
      cookie->eof = 0;
      cookie->c = '\0';
      cookie->allocated = INITIAL_ALLOC;
    }
  return f;
}
#endif /* __APPLE__ */

// Little parser subroutines...

int fpeek(FILE *f) {
    int c = fgetc(f);
      ungetc(c, f);
        return c;
}

void skip_whitespace() {
    while( !feof(input) && isspace(fpeek(input)) )
          fgetc(input);
}

bool is_sym(char c) {
    return isalnum(c) || c=='"' || c=='\'' || c==':' || c=='.'
          || c=='*' || c=='/' || c=='%' || c=='+' || c=='-' || c=='_';
}

// Match a string
bool match(char *s) {
  long pos = ftell(input);
  int n = strlen(s);
  int i;
  for(i=0; i<n; i++) {
    if( s[i] != fgetc(input) ) {
      fseek(input, pos, SEEK_SET);
      return false;
    }
  }
  return true;
}


//========================================================================
// Data structures....
//========================================================================

typedef struct {
  char *attr;
  char *value;
  UT_hash_handle hh;
} AttrMap;

void attrmap_add(AttrMap **attrmap, char *attr, char *value) {
  if (!attrmap) return;
  AttrMap *s = malloc(sizeof(AttrMap));
  s->attr = attr;
  s->value = value;
  HASH_ADD_KEYPTR( hh, *attrmap, s->attr, strlen(s->attr), s );
}

// Print attr names & values
void attrmap_print(AttrMap *attrmap) {
  AttrMap *s;
  for(s = attrmap; s != NULL; s = s->hh.next) {
    printf("  %s = %s\n", s->attr, s->value);
  }
}

// List attr names only
void attrmap_list(AttrMap *attrmap) {
  AttrMap *s;
  for(s = attrmap; s != NULL; s = s->hh.next) {
    printf(" %s", s->attr);
  }
  printf("\n");
}

char* attrmap_find(AttrMap *attrmap, char *attr) {
  AttrMap *s;
  HASH_FIND_STR(attrmap, attr, s);
  if (s) return s->value;
  return NULL;
}


//========================================================================
// SVG tag parser subroutines
//========================================================================

void parse_svg(AttrMap *attrs) {
  // NOTE: This function ONLY handles the top-level <SVG> element.
  // The old SVGparser::parse_svg() is now parse_xml_element(); see below.
  printf("Parsed an SVG element (top level)\n");
}

void parse_path(AttrMap *attrs) {
  printf("Parsed a PATH element\n");
}

void parse_rect(AttrMap *attrs) {
  printf("Parsed a RECT element\n");
}

void parse_circle(AttrMap *attrs) {
  printf("Parsed a CIRCLE element\n");
}

void parse_radial_gradient(AttrMap *attrs) {
  printf("Parsed a RadialGradient element\n");
}

void parse_linear_gradient(AttrMap *attrs) {
  printf("Parsed a LinearGradient element\n");
}

//========================================================================
// Hash table
//========================================================================

typedef void(*fnptr)();         // Function Pointer

// hash map for looking up XML tag names
typedef struct {
  char *name;   // key (use HASH_ADD_KEYPTR)
  fnptr fn;     // value
  UT_hash_handle hh;
} Fnmap;
Fnmap *fnmap = NULL;

void fnmap_add(char *name, fnptr fn) {
  Fnmap *s = malloc(sizeof(Fnmap));
  s->name = name;
  s->fn = fn;
  HASH_ADD_KEYPTR( hh, fnmap, s->name, strlen(s->name), s );
}

void init_fnmap() {
  fnmap_add("svg", parse_svg);
  fnmap_add("path", parse_path);
  fnmap_add("rect", parse_rect);
  fnmap_add("circle", parse_circle);
  fnmap_add("radialGradient", parse_radial_gradient);
  fnmap_add("linearGradient", parse_linear_gradient);
}

void process_svg_element(char *name, AttrMap *attrs) {
  Fnmap *s;
  HASH_FIND_STR(fnmap, name, s);
  if (s)
    (s->fn)(attrs);
  else
    printf("Parsed a <%s> element; IGNORING IT\n", name);
}

//========================================================================
// XML parsing
//========================================================================

bool parse_xml_comment() {
  //comment = '<!--' ([^-] | '-' . [^-])* '-->'     IGNORE
  if(!match("<!--")) return false;
  for(;;) {
    int c = fgetc(input);
    if(c=='-') {
      if(match("->")) {
        if(lex_debug) printf("PARSED A COMMENT\n");
        return true;
      }
    }
  }
}

//------------------------------------------------------------------------
char* parse_xml_name() {
  char *buf;
  size_t bufsize;
  FILE *out = open_memstream(&buf, &bufsize);
  if (out == NULL) {
    perror("open_memstream");
    exit(1);
  }
  int c = fgetc(input);
  //printf("--> '%c'\n", c);

  if (isalpha(c) || c=='_' || c==':') {
    // Other chars (_ and : aren't
    while (isalnum(c) || c=='_' || c==':' || c=='.' || c=='-') {
      fputc(c, out);
      c = fgetc(input);
      //printf("--> '%c'\n", c);
    }
    ungetc(c, input);
    fclose(out);
    //printf("Parsed tag name <%s>\n", buf);
    return buf;
  }
  else {
    ungetc(c, input);
    fclose(out);
    free(buf);
    return NULL;
  }
}

// Parse over (skip) extraneous data
bool skip_attrs() {
  skip_whitespace();
  if(parse_xml_name() == NULL) {
    return false;
  }
  skip_whitespace();
  // '='
  int c = fgetc(input);
  skip_whitespace();
  // '"'
  c = fgetc(input);
  for(;;) {
    c = fgetc(input);
    if (c == '"') break;
  }
  return true;
}

//------------------------------------------------------------------------
// Parse and return xml attribute name and value
bool parse_xml_attr(char **name, char **value) {
  skip_whitespace();

  // TODO: parse [NAMESPACE ':'] NAME

  // attribute name
  char *k = parse_xml_name();
  if(k == NULL) {
    return false;
  }

  skip_whitespace();

  // '='
  int c = fgetc(input);
  if (c != '=') {
    printf("EXPECTED '='\n");
    return false;
  }

  skip_whitespace();

  // open_memstream() dynamically allocates space as the pseudo-file is
  // written.  We must free the buffer when we're done with it.
  char *buf;
  size_t bufsize;
  FILE *out = open_memstream(&buf, &bufsize);
  if (out == NULL) {
    perror("open_memstream");
    exit(1);
  }

  // attribute value (quoted string)
  c = fgetc(input);
  switch (c) {
    case '"':
      for(;;) {
        c = fgetc(input);
        //TODO parse &...; XML entity refs
        if (c == '"') break;
        fputc(c, out);
      }
      break;
    case '\'':
      for(;;) {
        c = fgetc(input);
        //TODO parse &...; XML entity refs
        if (c == '\'') break;
        fputc(c, out);
      }
      break;
    default:
      fclose(out); free(buf);
      printf("EXPECTED xml attr value (quoted string)\n");
      return false;
  }
  fclose(out);
  
  *name = k;
  *value = buf;
  
  return true;
}

bool parse_svg_path(Sprite *sprite, Path *path) {
  
  char *name, *value;
  while(parse_xml_attr(&name, &value));
  
}

//------------------------------------------------------------------------
bool parse_xml_attrs(Sprite *sprite, const char *element) {
  
  char *name, *value;
  
  // Extract height and width data from svg
  if(!strcmp(element, "svg")) {
    while(parse_xml_attr(&name, &value)) {
      if(!strcmp(name, "width")) {
        sprite->width = atof(value);
      } else if (!strcmp(name, "height")) {
        sprite->height = atof(value);
      }
    }
  } else if(!strcmp(element, "g")) {
    // Extract skeleton from group
    // Maybe there's a smarter way to do the skeleton rather than manual
    while(parse_xml_attr(&name, &value)) {
      if(!strcmp(name, "id")) {
        if(!strcmp(value, "skeleton")) {
          printf("**** found the skeleton! ****\n");
        }
      }
    }
  } else if(!strcmp(element, "path")) {
      Path *path = path_new();
      parse_svg_path(sprite, path);
  } else {
    // Parse and skip everything else
    while(skip_attrs());
  }
  
  return true;
}

//------------------------------------------------------------------------
bool parse_xml_pi() {
  // Parse a program instruction ("<?... ?>") and IGNORE IT
  if(!match("<?")) return false;
  //printf("GOT <?\n");
  free(parse_xml_name());
  //printf("GOT name\n");
  while(skip_attrs());
  //printf("GOT attrs\n");
  if(!match("?>")) return false;
  //printf("GOT ?>\n");
  return true;
}

//------------------------------------------------------------------------
bool parse_xml_misc() {
  // Parse "misc" - comments and PIs
  do skip_whitespace();
  while(parse_xml_pi() || parse_xml_comment());
  return true;
}

//------------------------------------------------------------------------
bool parse_xml_prolog() {
  // <?xml ... ?> header
  if (!parse_xml_pi()) return false;
  // Comments and PIs
  parse_xml_misc();
  return true;
}

//------------------------------------------------------------------------
// parse_xml_element() and parse_xml_content() call each other recursively
// to parse the basic XML grammar:
//
// element = '<' name (attr '=' value)* '/>'
//         | '<' name (attr '=' value)* '>' content '</' name '>'
//
// content = element1 element2 ...

bool parse_xml_element(int indent);  // forward ref

bool parse_xml_content(int indent) {
  for(;;) {
    int c = fgetc(input);
    if(c=='<') {
      int c = fgetc(input);
      fseek(input, -2, SEEK_CUR);
      if(c=='/') {
        return true;
      }
      parse_xml_element(indent+1);
    }
  }
}

//------------------------------------------------------------------------
bool parse_xml_element(Sprite *sprite) {
  if(fgetc(input) != '<') return false;
  char *element = parse_xml_name();
  printf("BEGIN <%s> TAG\n", element);

  parse_xml_attrs(sprite, element);

  // parse end of tag
  if(match("/>")) {
    printf("PARSED EMPTY <%s/> TAG\n", element);
    return true;
  }
  if(!match(">")) {
    printf("EXPECTED '>' TO CLOSE <%s> TAG\n", element);
    return false;
  }

  printf("PARSING CONTENT OF <%s> TAG\n", element);
  parse_xml_content();

  if(! (match("</") && match(element) && match(">"))) {
    printf("EXPECTED </%s> CLOSING TAG\n", element);
    return false;
  }
  return true;
}

//------------------------------------------------------------------------
// Parses the given SVG file and stores it in the supplied Sprite.
// Returns true on success.
//
bool svg_load(const char *filename, float32 scale, Sprite *sprite) {
  if(svg_debug) {
    printf("===============================================================\n");
    printf("Loading %s  scale=%f\n", filename, scale);
    printf("===============================================================\n");
  }

  input = fopen(filename, "r");
  if (!input) {
    perror("unable to open input file");
    return false;
  }
  if (!(parse_xml_prolog())) {
    printf("XML prologue not parsed\n");
    return false;
  }
  if (!parse_xml_element(sprite)) {
    printf("FAILED to parse XML body (i.e. <svg>...</svg>\n");
    return false;
  }
  printf("FINISHED PARSING SVG\n");

  // Prepare data structures
/* TODO revise
  // Uhhhh... can't get width/height before parsing!
  // move this to parse_svg() ?
  //
  const char *width_s = top.getAttribute("width");
  const char *height_s = top.getAttribute("height");

  double width = atof(width_s);
  double height = atof(height_s);

  printf("w = %f, h = %f\n", width, height);

  // This flips from SVG cord. space to OpenGL/world coord. space
  transform_ = new Matrix(1, 0, 0, -1, 0, height);

  path_list.clear();
  */

  // Parse the SVG/XML
  if (!(parse_xml_prolog())) {
    printf("XML prologue not parsed\n");
    return false;
  }
  if (!parse_xml_element(0)) {
    printf("FAILED to parse XML body (i.e. <svg>...</svg>\n");
    return false;
  }
  printf("FINISHED PARSING SVG\n");


  // Finalize data structures
/* TODO revise
  skin->path_list = path_list;

  // Render to a GL display list
  GLuint displist = glGenLists(1);
  if(!displist) {
    std::cerr << "WARNING: Could not allocate displist in SVGparser::load()\n";
  }
  else {
    glNewList(displist, GL_COMPILE);
      glRotatef(180, 0, 0, 1);
      glScaled(scale, scale, scale);
      PathList::iterator x = skin->path_list.begin();
      while(x != skin->path_list.end()) {
        (*x)->render();
        ++x;
      }
    glEndList();
  }
  skin->displist = displist;
*/

  return true;
}
//========================================================================
void vsprite_init() {
  init_fnmap();
}
//========================================================================
