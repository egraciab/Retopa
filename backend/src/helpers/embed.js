const EMBED_URL = process.env.EMBED_URL || 'http://10.10.50.103:7997/embeddings';
const TIMEOUT_MS = parseInt(process.env.EMBED_TIMEOUT_MS || '600', 10);

/**
 * Devuelve el embedding del texto como string '[...]' listo para ::vector,
 * o null si el servicio no responde a tiempo. Nunca lanza.
 */
async function getEmbedding(text) {
  if (!text || !text.trim()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [text.trim()] }),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = j?.data?.[0]?.embedding;
    if (!Array.isArray(v) || v.length !== 1024) throw new Error('vector invalido');
    return '[' + v.join(',') + ']';
  } catch (e) {
    console.warn('[embed] fallback a busqueda clasica:', e.message);
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { getEmbedding };
