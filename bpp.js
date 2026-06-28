/* Big Picture Planner — shared landing behaviour.
   Click tracking mirrors the homepage (landing_clicks table). The founder
   request form lives on the homepage (#request); these pages link to it. */
(function () {
  var REDUCE = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var PAGE = window.BPP_PAGE || (location.pathname.replace(/^\//, '').replace(/\.html$/, '') || 'index');

  /* ---- click tracking (fire-and-forget) ---- */
  var URL_BASE = 'https://ovdrrltrhctwvtngjiaw.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im92ZHJybHRyaGN0d3Z0bmdqaWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTE1ODMsImV4cCI6MjA5NjQ4NzU4M30.8c5_67GeGFIxXb11E9D4wGy5j37yeOD8ULMRDDSjXJs';
  window.bppTrack = function (event) {
    try {
      fetch(URL_BASE + '/rest/v1/landing_clicks', {
        method: 'POST', keepalive: true,
        headers: { 'apikey': ANON_KEY, 'Authorization': 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ event: event, page: PAGE })
      }).catch(function () {});
    } catch (e) {}
  };

  document.addEventListener('DOMContentLoaded', function () {
    /* nav shadow */
    var nav = document.querySelector('nav');
    if (nav) {
      var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
      window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }

    /* reveals + app-frame settle */
    var reveals = document.querySelectorAll('.reveal');
    var apps = document.querySelectorAll('.app');
    if (REDUCE || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('reveal-in'); });
      apps.forEach(function (el) { el.classList.add('in'); });
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add(en.target.classList.contains('app') ? 'in' : 'reveal-in');
            io.unobserve(en.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
      apps.forEach(function (el) { io.observe(el); });
    }

    /* FAQ accordion */
    document.querySelectorAll('.faq-q').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.faq-item');
        var isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach(function (o) { o.classList.remove('open'); o.querySelector('.faq-q').setAttribute('aria-expanded', 'false'); });
        if (!isOpen) { item.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
      });
    });
  });
})();
