// Service worker do Painel Santiago — cacheia só o "app shell" estático.
// Os dados de verdade (famílias, confirmações) vêm sempre do Apps Script,
// então este SW nunca intercepta chamadas pra script.google.com nem pra
// script.googleusercontent.com: o painel exige internet pra funcionar de
// verdade, só a casca visual (HTML/JS/ícones) fica disponível offline.

var CACHE_NAME = "painel-santiago-v1";
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

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Nunca cacheia/intercepta chamadas ao Apps Script — sempre vão pra rede.
  if (url.hostname.indexOf("script.google") > -1 || url.hostname.indexOf("googleusercontent") > -1) {
    return;
  }
  // Não mexe em recursos de outras origens (ex.: fontes do Google).
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
