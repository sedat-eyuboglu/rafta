// Sayfa çizilmeden önce kayıtlı temayı uygular (yanıp sönmeyi önlemek için senkron yüklenir).
(function () {
  try {
    var t = localStorage.getItem("rafta-theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) {}
})();
