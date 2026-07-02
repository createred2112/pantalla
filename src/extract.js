'use strict';
// Extracción de datos desde una URL: primero intenta la API REST de WordPress
// (datos limpios de vuestras noticias) y, si no, los metadatos Open Graph de
// cualquier web. Descarga la imagen destacada a data/uploads.
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const { paths } = require('./config');

// --- Protección SSRF: solo URLs http(s) que resuelvan a IPs públicas ---
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
    // IPv4 mapeada (::ffff:x.x.x.x)
    const m = low.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  return (
    p[0] === 0 || p[0] === 10 || p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||     // CGNAT
    (p[0] === 169 && p[1] === 254) ||                   // link-local / metadata cloud
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] >= 224                                         // multicast/reservado
  );
}

async function assertPublicUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Solo se admiten URLs http(s)');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error('URL no permitida (dirección interna)');
    return;
  }
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('URL no permitida (dirección interna)');
  }
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); }
  catch { throw new Error('No se pudo resolver el dominio'); }
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('URL no permitida (resuelve a una dirección interna)');
  }
}

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
    // Redirecciones a mano: cada salto se valida contra IPs internas.
    let current = String(url);
    for (let hop = 0; hop < 5; hop++) {
      const u = new URL(current);
      await assertPublicUrl(u);
      const r = await fetch(u, { signal: c.signal, redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (PantallaBot; gasteizberri)' }, ...opts });
      const loc = r.headers.get('location');
      if (r.status >= 300 && r.status < 400 && loc) {
        current = new URL(loc, u).href;
        continue;
      }
      return r;
    }
    throw new Error('Demasiadas redirecciones');
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
  await assertPublicUrl(u);

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
