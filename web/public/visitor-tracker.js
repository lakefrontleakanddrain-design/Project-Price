(function () {
  if (window.__ppVisitorTrackerLoaded) return;
  window.__ppVisitorTrackerLoaded = true;

  var storageKey = 'pp_session_id';
  var landingKey = 'pp_landing_path';

  var getSessionId = function () {
    try {
      var existing = localStorage.getItem(storageKey);
      if (existing) return existing;
      var created = (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
      localStorage.setItem(storageKey, created);
      return created;
    } catch {
      return null;
    }
  };

  var getLandingPath = function (currentPath) {
    try {
      var existing = localStorage.getItem(landingKey);
      if (existing) return existing;
      localStorage.setItem(landingKey, currentPath || '/');
      return currentPath || '/';
    } catch {
      return currentPath || '/';
    }
  };

  var params = new URLSearchParams(window.location.search || '');
  var path = window.location.pathname || '/';
  var payload = {
    sessionId: getSessionId(),
    pagePath: path,
    pageUrl: window.location.href || null,
    referrerUrl: document.referrer || null,
    referrerHost: (() => {
      try { return document.referrer ? (new URL(document.referrer)).hostname : null; } catch { return null; }
    })(),
    utmSource: params.get('utm_source') || null,
    utmMedium: params.get('utm_medium') || null,
    utmCampaign: params.get('utm_campaign') || null,
    utmTerm: params.get('utm_term') || null,
    utmContent: params.get('utm_content') || null,
    landingPath: getLandingPath(path),
  };

  var endpoint = '/.netlify/functions/project-price-web-visit';
  var body = JSON.stringify(payload);

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      return;
    }
  } catch {}

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body,
    keepalive: true,
  }).catch(function () {});
})();
