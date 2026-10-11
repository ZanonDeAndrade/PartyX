// Abertura em vídeo: decide antes da primeira pintura se ela toca nesta carga de página. Fica num arquivo próprio porque o
// CSP (`script-src 'self'`) não permite script em linha no index.html. Marca `<html data-px-intro>`: o CSS já pinta o fundo
// de preto e o React (src/site/IntroSplash.tsx) lê a mesma marca, então a regra existe só aqui.
//
// Toca só se: é a primeira página aberta na sessão, é vitrine pública (início, eventos, evento), o visitante não pediu menos
// movimento e não está no modo de economia de dados. Sem sessionStorage (bloqueado ou modo privado antigo) não toca, para
// nunca repetir a cada recarga.
(function () {
  var path = location.pathname.replace(/\/+$/, '') || '/';
  var vitrine = path === '/' || path === '/eventos' || /^\/eventos\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path);
  var seen = true;
  try {
    seen = sessionStorage.getItem('partyx_intro_seen') === '1';
    sessionStorage.setItem('partyx_intro_seen', '1');
  } catch {
    // sem armazenamento: trata como já vista
  }
  if (seen || !vitrine) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (navigator.connection && navigator.connection.saveData) return;
  document.documentElement.setAttribute('data-px-intro', '');
})();
