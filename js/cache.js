/* 资源缓存：像网页游戏那样，用 Cache Storage 手动缓存题库与字体，
   不注册 Service Worker —— 页面本身仍走网络，更新即时生效。 */
window.ASSET_CACHE = (function () {
  var NAME = "guoxian-assets-v2";
  var opening = null;

  function open() {
    if (!("caches" in window)) return Promise.resolve(null);
    if (!opening) {
      opening = caches.open(NAME).catch(function () { return null; });
    }
    return opening;
  }

  function load(url, type) {
    return open().then(function (c) {
      var hit = c ? c.match(url).catch(function () { return null; }) : Promise.resolve(null);
      return hit.then(function (res) {
        if (res) return res;
        return fetch(url, { cache: "no-cache" }).then(function (r) {
          if (r && r.ok && c) {
            var copy = r.clone();
            c.put(url, copy).catch(function () {});
          }
          return r;
        });
      });
    }).then(function (res) { return res[type](); });
  }

  return {
    json: function (u) { return load(u, "json"); },
    text: function (u) { return load(u, "text"); },
    version: NAME,
    clear: function () {
      if (!("caches" in window)) return Promise.resolve(false);
      return caches.delete(NAME).then(function () { return true; });
    }
  };
})();
