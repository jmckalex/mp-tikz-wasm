/* mpwasm_figure.c — the JSON figure backend (docs/07 §5).
 *
 * Walks an mp_edge_object (the structure mplib's non-interactive backend
 * collects for every figure) and serialises it. Numbers are printed with
 * %.17g so a JavaScript JSON.parse() recovers the exact double. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <w2c/config.h>
#include "mplib.h"
#include "mplibps.h"
#include "mpwasm_api.h"

typedef struct sb { char *d; size_t n, cap; } sb;

static void sb_grow(sb *b, size_t extra) {
  if (b->n + extra + 1 > b->cap) {
    size_t nc = b->cap ? b->cap : 4096;
    while (nc < b->n + extra + 1) nc *= 2;
    b->d = xrealloc(b->d, nc);
    b->cap = nc;
  }
}
static void sb_put(sb *b, const char *s, size_t l) {
  sb_grow(b, l); memcpy(b->d + b->n, s, l); b->n += l; b->d[b->n] = 0;
}
static void sb_puts(sb *b, const char *s) { sb_put(b, s, strlen(s)); }
static void sb_num(sb *b, double v) {
  char tmp[40];
  if (isnan(v) || isinf(v)) { sb_puts(b, "null"); return; }
  if (v == floor(v) && fabs(v) < 1e15) snprintf(tmp, sizeof tmp, "%.0f", v);
  else snprintf(tmp, sizeof tmp, "%.17g", v);
  /* JSON does not allow "-0" to be distinguishable but it is legal; keep it. */
  sb_puts(b, tmp);
}
static void sb_int(sb *b, long v) { char tmp[32]; snprintf(tmp, sizeof tmp, "%ld", v); sb_puts(b, tmp); }
/* Escape raw bytes as a JSON string. Bytes >= 0x80 become \u00XX so that
 * the JavaScript string's charCodeAt(i) equals the original byte — MetaPost
 * text is font-encoded, not Unicode. */
static void sb_str(sb *b, const char *s, size_t l) {
  size_t i; char tmp[8];
  sb_puts(b, "\"");
  for (i = 0; i < l; i++) {
    unsigned char ch = (unsigned char) s[i];
    switch (ch) {
      case '"': sb_puts(b, "\\\""); break;
      case '\\': sb_puts(b, "\\\\"); break;
      case '\n': sb_puts(b, "\\n"); break;
      case '\r': sb_puts(b, "\\r"); break;
      case '\t': sb_puts(b, "\\t"); break;
      default:
        if (ch < 0x20 || ch >= 0x80) { snprintf(tmp, sizeof tmp, "\\u%04x", ch); sb_puts(b, tmp); }
        else sb_put(b, (const char *) &ch, 1);
    }
  }
  sb_puts(b, "\"");
}
static void sb_cstr(sb *b, const char *s) { if (s) sb_str(b, s, strlen(s)); else sb_puts(b, "null"); }

/* A knot list: open paths end at a knot whose next is NULL or whose
 * right_type is mp_endpoint; cycles are circular. */
static int knots(sb *b, mp_gr_knot p) {
  mp_gr_knot q = p; int closed = 0, first = 1;
  sb_puts(b, "[");
  if (p != NULL) {
    do {
      if (!first) sb_puts(b, ",");
      first = 0;
      sb_puts(b, "{\"x\":"); sb_num(b, q->x_coord);
      sb_puts(b, ",\"y\":"); sb_num(b, q->y_coord);
      sb_puts(b, ",\"lx\":"); sb_num(b, q->left_x);
      sb_puts(b, ",\"ly\":"); sb_num(b, q->left_y);
      sb_puts(b, ",\"rx\":"); sb_num(b, q->right_x);
      sb_puts(b, ",\"ry\":"); sb_num(b, q->right_y);
      sb_puts(b, ",\"leftType\":"); sb_int(b, q->data.types.left_type);
      sb_puts(b, ",\"rightType\":"); sb_int(b, q->data.types.right_type);
      sb_puts(b, "}");
      if (q->data.types.right_type == mp_endpoint) { q = NULL; break; }
      q = q->next;
    } while (q != NULL && q != p);
    closed = (q == p);
  }
  sb_puts(b, "]");
  return closed;
}

static void color(sb *b, int model, mp_color c) {
  sb_puts(b, "{\"model\":");
  switch (model) {
    case mp_grey_model: sb_puts(b, "\"grey\",\"values\":["); sb_num(b, c.a_val); break;
    case mp_rgb_model:  sb_puts(b, "\"rgb\",\"values\":["); sb_num(b, c.a_val); sb_puts(b, ","); sb_num(b, c.b_val); sb_puts(b, ","); sb_num(b, c.c_val); break;
    case mp_cmyk_model: sb_puts(b, "\"cmyk\",\"values\":["); sb_num(b, c.a_val); sb_puts(b, ","); sb_num(b, c.b_val); sb_puts(b, ","); sb_num(b, c.c_val); sb_puts(b, ","); sb_num(b, c.d_val); break;
    default:            sb_puts(b, "\"none\",\"values\":["); break;
  }
  sb_puts(b, "]}");
}

static void scripts(sb *b, const char *pre, const char *post) {
  if (pre)  { sb_puts(b, ",\"prescript\":");  sb_cstr(b, pre); }
  if (post) { sb_puts(b, ",\"postscript\":"); sb_cstr(b, post); }
}

static void path_field(sb *b, const char *name, mp_gr_knot p, int *closed_out) {
  int closed;
  sb_puts(b, ",\""); sb_puts(b, name); sb_puts(b, "\":");
  closed = knots(b, p);
  if (closed_out) *closed_out = closed;
}

char *mpwasm_figure_to_json(mp_edge_object *e) {
  sb b = {0, 0, 0};
  mp_graphic_object *p;
  int first = 1;
  sb_puts(&b, "{\"charcode\":"); sb_int(&b, e->charcode);
  sb_puts(&b, ",\"bbox\":["); sb_num(&b, e->minx); sb_puts(&b, ","); sb_num(&b, e->miny);
  sb_puts(&b, ","); sb_num(&b, e->maxx); sb_puts(&b, ","); sb_num(&b, e->maxy); sb_puts(&b, "]");
  sb_puts(&b, ",\"width\":"); sb_num(&b, e->width);
  sb_puts(&b, ",\"height\":"); sb_num(&b, e->height);
  sb_puts(&b, ",\"depth\":"); sb_num(&b, e->depth);
  sb_puts(&b, ",\"italicCorrection\":"); sb_num(&b, e->ital_corr);
  sb_puts(&b, ",\"objects\":[");
  for (p = e->body; p != NULL; p = p->next) {
    if (!first) sb_puts(&b, ",");
    first = 0;
    switch (p->type) {
      case mp_fill_code: {
        mp_fill_object *o = (mp_fill_object *) p; int closed = 0;
        sb_puts(&b, "{\"type\":\"fill\"");
        path_field(&b, "path", o->path_p, &closed);
        sb_puts(&b, ",\"closed\":"); sb_puts(&b, closed ? "true" : "false");
        if (o->htap_p) path_field(&b, "htap", o->htap_p, NULL);
        if (o->pen_p)  path_field(&b, "pen", o->pen_p, NULL);
        sb_puts(&b, ",\"color\":"); color(&b, o->color_model, o->color);
        sb_puts(&b, ",\"ljoin\":"); sb_int(&b, o->ljoin);
        sb_puts(&b, ",\"miterlimit\":"); sb_num(&b, o->miterlim);
        scripts(&b, o->pre_script, o->post_script);
        sb_puts(&b, "}");
        break;
      }
      case mp_stroked_code: {
        mp_stroked_object *o = (mp_stroked_object *) p; int closed = 0;
        sb_puts(&b, "{\"type\":\"stroke\"");
        path_field(&b, "path", o->path_p, &closed);
        sb_puts(&b, ",\"closed\":"); sb_puts(&b, closed ? "true" : "false");
        if (o->pen_p) path_field(&b, "pen", o->pen_p, NULL);
        sb_puts(&b, ",\"color\":"); color(&b, o->color_model, o->color);
        sb_puts(&b, ",\"ljoin\":"); sb_int(&b, o->ljoin);
        sb_puts(&b, ",\"lcap\":"); sb_int(&b, o->lcap);
        sb_puts(&b, ",\"miterlimit\":"); sb_num(&b, o->miterlim);
        if (o->dash_p) {
          int i;
          sb_puts(&b, ",\"dash\":{\"offset\":"); sb_num(&b, o->dash_p->offset);
          sb_puts(&b, ",\"pattern\":[");
          if (o->dash_p->array) {
            /* the array is terminated by a negative entry */
            for (i = 0; o->dash_p->array[i] >= 0; i++) {
              if (i) sb_puts(&b, ",");
              sb_num(&b, o->dash_p->array[i]);
            }
          }
          sb_puts(&b, "]}");
        }
        scripts(&b, o->pre_script, o->post_script);
        sb_puts(&b, "}");
        break;
      }
      case mp_text_code: {
        mp_text_object *o = (mp_text_object *) p;
        sb_puts(&b, "{\"type\":\"text\",\"text\":"); sb_str(&b, o->text_p ? o->text_p : "", o->text_l);
        sb_puts(&b, ",\"font\":"); sb_cstr(&b, o->font_name);
        sb_puts(&b, ",\"designSize\":"); sb_num(&b, o->font_dsize);
        sb_puts(&b, ",\"color\":"); color(&b, o->color_model, o->color);
        sb_puts(&b, ",\"width\":"); sb_num(&b, o->width);
        sb_puts(&b, ",\"height\":"); sb_num(&b, o->height);
        sb_puts(&b, ",\"depth\":"); sb_num(&b, o->depth);
        sb_puts(&b, ",\"transform\":["); sb_num(&b, o->txx); sb_puts(&b, ","); sb_num(&b, o->txy);
        sb_puts(&b, ","); sb_num(&b, o->tyx); sb_puts(&b, ","); sb_num(&b, o->tyy);
        sb_puts(&b, ","); sb_num(&b, o->tx); sb_puts(&b, ","); sb_num(&b, o->ty); sb_puts(&b, "]");
        scripts(&b, o->pre_script, o->post_script);
        sb_puts(&b, "}");
        break;
      }
      case mp_start_clip_code: {
        mp_clip_object *o = (mp_clip_object *) p;
        sb_puts(&b, "{\"type\":\"startClip\""); path_field(&b, "path", o->path_p, NULL); sb_puts(&b, "}");
        break;
      }
      case mp_start_bounds_code: {
        mp_bounds_object *o = (mp_bounds_object *) p;
        sb_puts(&b, "{\"type\":\"startBounds\""); path_field(&b, "path", o->path_p, NULL); sb_puts(&b, "}");
        break;
      }
      case mp_stop_clip_code:   sb_puts(&b, "{\"type\":\"stopClip\"}"); break;
      case mp_stop_bounds_code: sb_puts(&b, "{\"type\":\"stopBounds\"}"); break;
      case mp_special_code: {
        mp_special_object *o = (mp_special_object *) p;
        sb_puts(&b, "{\"type\":\"special\",\"script\":"); sb_cstr(&b, o->pre_script); sb_puts(&b, "}");
        break;
      }
      default:
        sb_puts(&b, "{\"type\":\"unknown\",\"code\":"); sb_int(&b, p->type); sb_puts(&b, "}");
    }
  }
  sb_puts(&b, "]}");
  return b.d;
}
