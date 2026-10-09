// تنبيه اتصال بسيط: يظهر فقط عند فشل الاتصال، ويختفي تلقائياً
(function () {
  let timer = null;

  function toast(text) {
    let el = document.getElementById('net-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'net-toast';
      el.setAttribute('dir', 'rtl');
      el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:#1f2937;color:#fff;padding:12px 18px;border-radius:12px;font-size:15px;' +
        'z-index:9999;display:none;box-shadow:0 2px 8px rgba(0,0,0,.2);font-family:Tahoma,Arial,sans-serif';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.display = 'block';
    clearTimeout(timer);
    timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
  }

  // أي طلب يفشل بسبب الشبكة يعرض الرسالة القصيرة فقط
  function netFetch(input, init) {
    return fetch(input, init).catch(err => {
      toast('يجب الاتصال بالإنترنت');
      throw err;
    });
  }

  window.addEventListener('offline', () => toast('يجب الاتصال بالإنترنت'));
  window.addEventListener('online', () => window.dispatchEvent(new Event('khatti:online')));

  window.khattiNet = { fetch: netFetch };
})();
