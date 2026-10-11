/**
 * Dados que o servidor embute no HTML (`<script type="application/json">`), como a vitrine da página inicial. Lidos uma vez
 * só: o bloco sai da página depois de lido, e uma volta à página busca dados novos pela API.
 */
export function takeEmbedded<T>(id: string): T | undefined {
  try {
    const el = document.getElementById(id);
    if (!el || el.getAttribute('type') !== 'application/json') return undefined;
    el.remove();
    return JSON.parse(el.textContent ?? '') as T;
  } catch {
    return undefined;
  }
}
