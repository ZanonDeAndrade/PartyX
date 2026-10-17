// Abertura do site (logo PartyX em vídeo, cerca de 3 s). Arquivo próprio porque o CSP (`script-src 'self'`) não permite script em
// linha no index.html. No build, ele e o vídeo saem em /assets com hash no nome (plugin px-intro-assets do vite.config.ts): cache de
// 1 ano no aparelho e na Vercel, e um deploy novo troca o nome. A camada já vem no HTML (#px-abertura) e só aparece com
// <html data-px-abertura>, posto aqui antes da primeira pintura: o site não pisca antes dela.
//
// Quando toca (16/10/2026): em toda carga de página (primeira visita, recarregar, nova aba, link de fora), na volta pelo botão Voltar
// restaurada do cache do navegador (pageshow com persisted) e na volta para a aba depois de pelo menos 1 minuto fora. Não guarda
// marca de "já viu": a hora em que a aba ficou escondida fica só na memória da página. Nunca nas rotas de tarefa (ROTAS_SEM).
//
// Como toca: vídeo MP4 sem som. Se o play() for recusado (iPhone em Pouca Energia, navegador interno) ou o vídeo não começar em 1 s,
// entra o logo em SVG com uma animação curta em CSS. Com economia de dados, vai direto para ela, sem baixar o vídeo. Com "reduzir
// movimento", o logo parado com um fade curto. Some em no máximo 4 s, com o fade. O 1 s e os 4 s contam desde que a camada aparece
// (o primeiro quadro desenhado, na carga ou na volta à aba), não desde o clique: antes disso a pessoa vê a tela de carregamento do
// navegador, e pela internet o HTML leva de 0,4 a 1,2 s para chegar (medido em 17/10/2026).
// Um toque em qualquer lugar (ou Esc, ou "Pular") pula; o toque não passa para a página. A página carrega normalmente por baixo,
// inerte e sem rolagem enquanto a abertura está na tela.
//
// Testes (Playwright): `window.__partyxSemAbertura = true` antes do carregamento desliga tudo. Sem efeito para quem visita.
(function () {
  'use strict';
  var LIMITE_MS = 4000; // de quando a camada aparece até sumir, com o fade
  var INICIO_MS = 1000; // o vídeo precisa começar até 1 s depois de a camada aparecer; senão, entra a animação em CSS
  var FADE_MS = 300;
  var CSS_MS = 1900; // animação em CSS (1,5 s) e o logo parado um instante
  var PARADO_MS = 1200; // "reduzir movimento": o logo parado
  var VOLTA_MS = 60000; // fora da aba por pelo menos 1 minuto: toca de novo
  var VIDEO = '/src/intro/partyx-intro.mp4'; // no build, trocado pelo nome com hash em /assets
  // Rotas de tarefa: painel, portaria, compra e pagamento (a pessoa sai para o app do banco e volta), ingressos e QR Code, autorização
  // de menor, entrar, criar conta, primeiro acesso e recuperação de senha. Prefixo vale para as subpáginas.
  var ROTAS_SEM = /^\/(?:(?:admin|portaria|checkout|pedido|ingressos|autorizacao-menor)(?:\/|$)|(?:meus-ingressos|entrar|criar-conta|primeiro-acesso|recuperar-senha|redefinir-senha)$)/;

  var html = document.documentElement;
  var caminho = function () {
    return location.pathname.replace(/\/+$/, '') || '/';
  };
  var agora = function () {
    return performance.now();
  };

  // Vitrine (escura): fundo preto desde o primeiro quadro, mesmo antes do CSS do React e do JavaScript (src/index.css). O React
  // (SiteApp.tsx) mantém a marca nas navegações internas.
  var p0 = caminho();
  if (p0 === '/' || p0 === '/eventos' || /^\/eventos\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p0)) html.setAttribute('data-px-vitrine', '');

  if (window.__partyxSemAbertura === true) return;

  var estado = null; // abertura na tela: { t0, timers, camada, video, root, foco, saindo, pintada, prazos }
  var escondidaEm = null; // Date.now() de quando a aba ficou escondida (relógio de parede: sobrevive ao aparelho suspenso)
  var pendente = false; // carga com a aba escondida (aberta em segundo plano): toca quando ela aparecer

  var pode = function () {
    return !ROTAS_SEM.test(caminho());
  };
  function modo() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'parado';
    var c = navigator.connection;
    return c && c.saveData ? 'css' : 'video';
  }
  // Qualquer erro inesperado tira a camada: o site nunca fica preso atrás da abertura.
  function seguro(fn) {
    return function (x) {
      try {
        fn(x);
      } catch {
        terminar();
      }
    };
  }
  function depois(e, em, fn) {
    e.timers.push(
      setTimeout(
        seguro(function () {
          if (estado === e) fn(e);
        }),
        Math.max(0, em - agora()),
      ),
    );
  }
  function pararVideo(v) {
    if (!v) return;
    v.onplaying = v.onended = v.onerror = null;
    try {
      v.pause();
      if (v.getAttribute('src')) {
        v.removeAttribute('src');
        v.load(); // solta o arquivo
      }
    } catch {
      // nada a fazer: a camada some do mesmo jeito
    }
  }

  function terminar() {
    var e = estado;
    estado = null;
    html.removeAttribute('data-px-abertura');
    html.removeAttribute('data-px-abertura-saindo');
    if (!e) return;
    for (var i = 0; i < e.timers.length; i++) clearTimeout(e.timers[i]);
    pararVideo(e.video);
    if (e.root) {
      e.root.inert = false;
      e.root.removeAttribute('inert');
    }
    if (e.foco && e.foco !== document.body && e.foco.isConnected && e.foco.focus) e.foco.focus({ preventScroll: true });
  }

  // Fade de saída, dentro do limite: se sobra pouco (o vídeo começou atrasado e acabou agora), o fade encurta.
  function sair(e) {
    if (e.saindo) return;
    e.saindo = true;
    var fade = Math.min(FADE_MS, e.t0 + LIMITE_MS - agora());
    if (fade < 20) return terminar();
    e.camada.style.setProperty('--px-abertura-fade', Math.round(fade) + 'ms');
    html.setAttribute('data-px-abertura-saindo', '');
    depois(e, agora() + fade, terminar);
  }

  function animacaoCss(e) {
    pararVideo(e.video);
    html.setAttribute('data-px-abertura', 'css');
    // A animação começa quando aparece: antes do primeiro quadro, o prazo dela espera por ele.
    if (e.pintada) depois(e, agora() + CSS_MS, sair);
    else
      e.prazos = function () {
        depois(e, e.t0 + CSS_MS, sair);
      };
  }

  function tocarVideo(e) {
    var v = e.video;
    var comecou = false;
    var plano = seguro(function () {
      if (estado === e && !comecou && html.getAttribute('data-px-abertura') === 'video') animacaoCss(e);
    });
    v.muted = true;
    v.defaultMuted = true;
    v.onplaying = function () {
      comecou = true;
    };
    v.onended = seguro(function () {
      if (estado === e) sair(e);
    });
    v.onerror = plano;
    v.src = VIDEO;
    try {
      var p = v.play();
      if (p && p.catch) p.catch(plano);
    } catch {
      plano();
    }
    // Os prazos começam no primeiro quadro (ver `comecar`); o vídeo já está baixando.
    e.prazos = function () {
      depois(e, e.t0 + INICIO_MS, plano);
      // Perto do limite: se o vídeo está tocando e acaba antes dele, espera o fim (o fade encurta); senão, começa o fade agora.
      depois(e, e.t0 + LIMITE_MS - FADE_MS, function () {
        var resta = (v.duration - v.currentTime) * 1000;
        if (!(comecou && !v.paused && resta <= e.t0 + LIMITE_MS - agora())) sair(e);
      });
    };
  }

  function comecar() {
    var camada = document.getElementById('px-abertura');
    if (!camada) return terminar();
    var root = document.getElementById('root');
    var e = (estado = {
      t0: agora(), // provisório: vale o do primeiro quadro (abaixo)
      timers: [],
      camada: camada,
      video: camada.querySelector('video'),
      root: root,
      foco: document.activeElement,
      saindo: false,
      pintada: false,
      prazos: null,
    });
    html.removeAttribute('data-px-abertura-saindo');
    if (!html.hasAttribute('data-px-abertura')) html.setAttribute('data-px-abertura', modo());
    if (root) {
      root.inert = true;
      root.setAttribute('inert', '');
    }
    var m = html.getAttribute('data-px-abertura');
    if (m === 'video' && e.video) tocarVideo(e); // o vídeo começa a baixar já
    else if (m === 'parado')
      e.prazos = function () {
        depois(e, e.t0 + PARADO_MS, sair);
      };
    else animacaoCss(e);
    // Os prazos (1 s para o vídeo começar, 4 s na tela) contam do primeiro quadro desenhado com a camada: o CSS do site segura a
    // pintura até chegar. Se ele nunca vier (aba sem pintura), a camada sai assim mesmo.
    depois(e, agora() + 15000, terminar);
    requestAnimationFrame(
      seguro(function () {
        if (estado !== e) return;
        e.t0 = agora();
        e.pintada = true;
        depois(e, e.t0 + LIMITE_MS, terminar);
        if (e.prazos) e.prazos();
      }),
    );
  }

  // Volta à aba ou pelo Voltar: começa de novo.
  function deNovo() {
    if (estado || !pode()) return;
    // A saída anterior precisa ser aplicada antes (na volta do cache do navegador ela pode não ter sido): as animações em CSS
    // recomeçam do início.
    html.removeAttribute('data-px-abertura');
    void html.offsetWidth;
    html.setAttribute('data-px-abertura', modo());
    comecar();
  }

  function ligar() {
    var camada = document.getElementById('px-abertura');
    if (camada) {
      // Clique (não pointerdown): o toque inteiro termina na camada, que continua por cima durante o fade, então nada passa para a
      // página. A página fica inerte até a camada sair.
      camada.addEventListener(
        'click',
        seguro(function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (estado) sair(estado);
        }),
      );
    }
    document.addEventListener(
      'keydown',
      seguro(function (ev) {
        if (estado && ev.key === 'Escape') sair(estado);
      }),
    );
    document.addEventListener(
      'visibilitychange',
      seguro(function () {
        if (document.visibilityState === 'hidden') {
          escondidaEm = Date.now();
          if (estado) terminar();
          return;
        }
        var fora = escondidaEm === null ? 0 : Date.now() - escondidaEm;
        escondidaEm = null;
        if (pendente || fora >= VOLTA_MS) {
          pendente = false;
          deNovo();
        }
      }),
    );
    window.addEventListener('pagehide', function () {
      if (estado) terminar();
    });
    window.addEventListener(
      'pageshow',
      seguro(function (ev) {
        if (!ev.persisted) return;
        escondidaEm = null;
        pendente = false;
        deNovo();
      }),
    );
  }

  // Primeira carga: decide já (antes da pintura) e começa assim que o HTML termina de chegar, antes do JavaScript do site.
  if (pode()) {
    if (document.visibilityState === 'hidden') pendente = true;
    else html.setAttribute('data-px-abertura', modo());
  }
  var pronto = seguro(function () {
    ligar();
    if (html.hasAttribute('data-px-abertura')) comecar();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('readystatechange', function aoMudar() {
      document.removeEventListener('readystatechange', aoMudar);
      pronto();
    });
  } else pronto();
})();
