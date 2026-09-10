// Service worker do Painel Santiago — cacheia o "app shell" estático.
// Os dados de verdade (famílias, confirmações) vêm sempre do Apps Script,
// então este SW nunca intercepta chamadas pra script.google.com nem pra
// script.googleusercontent.com: o painel exige internet pra funcionar de
// verdade.
//
// IMPORTANTE: o HTML e o JS do painel (index.html, app.js) mudam com
// frequência enquanto o app está sendo ajustado. Por isso, pra esses dois
// arquivos, a estratégia é "rede primeiro, cache só como reserva se a
// internet cair" — assim uma atualização publicada aparece na hora que o
// celular abrir o app de novo, em vez de ficar presa no cache até alguém
// bumpar o CACHE_NAME manualmente. Ícones e manifesto (que quase nunca
// mudam) continuam "cache primeiro", pra abrir mais rápido.
var CACHE_NAME = "painel-santiago-v2";
var SHELL_URLS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

function ehArquivoDeCodigo(url) {
  return url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/painel/") ||
    url.pathname.endsWith("/painel");
}

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Nunca cacheia/intercepta chamadas ao Apps Script — sempre vão pra rede.
  if (url.hostname.indexOf("script.google") > -1 || url.hostname.indexOf("googleusercontent") > -1) {
    return;
  }
  // Não mexe em recursos de outras origens (ex.: fontes do Google).
  if (url.origin !== location.origin) return;

  if (ehArquivoDeCodigo(url)) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then(function (res) {
        var copia = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copia); });
        return res;
      }).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
