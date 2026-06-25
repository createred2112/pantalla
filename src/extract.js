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

  // 2) Open Graph del HTML.
  const r = await fetchT(url);
  if (!r.ok) throw new Error('No se pudo abrir la URL (' + r.status + ')');
  const html = await r.text();
  const title = strip(meta(html, 'og:title') || meta(html, 'twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]);
  const body = strip(meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description'));
  const img = meta(html, 'og:image') || meta(html, 'twitter:image');
  const date = (meta(html, 'article:published_time') || '').slice(0, 10);
  const site = strip(meta(html, 'og:site_name'));
  return {
    source: 'opengraph',
    title, body, subtitle: site || null, date,
    image: img ? await downloadImage(new URL(img, u).href) : null,
  };
}

module.exports = { extract };
