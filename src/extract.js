'use strict';
// Extracción de datos desde una URL: primero intenta la API REST de WordPress
// (datos limpios de vuestras noticias) y, si no, los metadatos Open Graph de
// cualquier web. Descarga la imagen destacada a data/uploads.
const fs = require('fs');
const path = require('path');
const { paths } = require('./config');

function strip(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&#8217;|&#x2019;/g, '’').replace(/&#8216;/g, '‘')
    .replace(/&#8211;|&#8212;/g, '–').replace(/&hellip;|&#8230;/g, '…')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/&[a-z0-9#]+;/gi, '').replace(/\s+/g, ' ').trim();
}

async function fetchT(url, opts = {}) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 9000);
  try {
    return await fetch(url, { signal: c.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (PantallaBot; gasteizberri)' }, ...opts });
  } finally { clearTimeout(t); }
}

async function downloadImage(imgUrl) {
  try {
    const r = await fetchT(imgUrl);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : ct.includes('gif') ? 'gif' : 'jpg';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1024) return null;
    fs.mkdirSync(paths.uploads, { recursive: true });
    const name = 'url_' + Date.now() + '.' + ext;
    fs.writeFileSync(path.join(paths.uploads, name), buf);
    return 'data/uploads/' + name;
  } catch { return null; }
}

function meta(html, prop) {
  const re1 = new RegExp('<meta[^>]+(?:property|name)=["\']' + prop + '["\'][^>]*?content=["\']([^"\']+)["\']', 'i');
  const re2 = new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]*?(?:property|name)=["\']' + prop + '["\']', 'i');
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

// Quita el nombre del sitio de un titular ("Mi noticia | El Diario" -> "Mi noticia").
function cleanTitle(title, site) {
  let t = String(title || '').trim();
  if (!t) return t;
  if (site) {
    const s = site.trim();
    const re = new RegExp('\\s*[|\\-–—·»]\\s*' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
    t = t.replace(re, '').trim();
  }
  // Si aún queda un separador final con texto corto (nombre de medio), recórtalo.
  const parts = t.split(/\s+[|–—»]\s+/);
  if (parts.length > 1 && parts[parts.length - 1].length <= 30) t = parts.slice(0, -1).join(' — ').trim();
  return t || String(title || '').trim();
}

// Intenta sacar titular/imagen del JSON-LD (schema.org NewsArticle/Article).
function jsonLd(html) {
  const out = {};
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const arr = Array.isArray(data) ? data : (data['@graph'] ? data['@graph'] : [data]);
    for (const node of arr) {
      if (!node || typeof node !== 'object') continue;
      const type = String(node['@type'] || '').toLowerCase();
      if (!/article|newsarticle|blogposting|webpage/.test(type)) continue;
      if (!out.title && node.headline) out.title = strip(node.headline);
      if (!out.body && node.description) out.body = strip(node.description);
      if (!out.date && node.datePublished) out.date = String(node.datePublished).slice(0, 10);
      if (!out.image) {
        let img = node.image;
        if (Array.isArray(img)) img = img[0];
        if (img && typeof img === 'object') img = img.url || null;
        out.image = typeof img === 'string' ? img : null;
      }
    }
  }
  return out;
}

async function extract(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('URL no válida'); }

  // 1) WordPress REST API por slug.
  const slug = u.pathname.split('/').filter(Boolean).pop();
  if (slug && !/\.\w{2,4}$/.test(slug)) {
    try {
      const r = await fetchT(`${u.origin}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&_embed`);
      if (r.ok) {
        const a = await r.json();
        if (Array.isArray(a) && a[0]) {
          const p = a[0];
          let image = null, cat = null;
          try { image = p._embedded['wp:featuredmedia'][0].source_url; } catch {}
          try { cat = p._embedded['wp:term'][0][0].name; } catch {}
          return {
            source: 'wordpress',
            title: strip(p.title && p.title.rendered),
            body: strip(p.excerpt && p.excerpt.rendered),
            subtitle: cat || null,
            date: (p.date || '').slice(0, 10),
            image: image ? await downloadImage(image) : null,
          };
        }
      }
    } catch {}
  }

  // 2) Open Graph + JSON-LD del HTML.
  const r = await fetchT(url);
  if (!r.ok) throw new Error('No se pudo abrir la URL (' + r.status + ')');
  const html = await r.text();
  const ld = jsonLd(html);
  const site = strip(meta(html, 'og:site_name'));
  const rawTitle = strip(meta(html, 'og:title') || meta(html, 'twitter:title') || ld.title || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]);
  const title = cleanTitle(rawTitle, site);
  const body = strip(meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description') || ld.body);
  const img = meta(html, 'og:image') || meta(html, 'twitter:image') || ld.image;
  const date = ((meta(html, 'article:published_time') || ld.date) || '').slice(0, 10);
  return {
    source: 'opengraph',
    title, body, subtitle: site || null, date,
    image: img ? await downloadImage(new URL(img, u).href) : null,
  };
}

module.exports = { extract };
