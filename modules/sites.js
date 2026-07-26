(function(global){
  'use strict';
  const sites = [
    {
      id: 'komoot',
      matchesHost: host => host.includes('komoot.'),
      matchesRoute: path =>
          /^\/tour\/[^/]+\/edit(?:\/|$)/.test(path) ||
          /^\/plan(?:\/|$)/.test(path)
    },
    {
      id: 'veloplanner',
      matchesHost: host => host == 'veloplanner.com',
      // https://veloplanner.com/pl/plan#map=6.69/51.739/19.625
      // https://veloplanner.com/pl/user-routes/168777/edit#map=6.65/53.938/19.628
      matchesRoute: path =>
        /^\/plan(?:\/|$)/.test(path) ||
        /^\/user-routes\/\d+\/edit(?:\/|$)/.test(path)    }
  ];

  function getCurrentSite() {
    return sites.find(site => site.matchesHost(location.hostname) || null);
  }

  function isSupportedPage(location) {
    const site = getCurrentSite(location);
    if (!site) return false;

    const path = location.pathname.replace(
      /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i,
      ''
    );

    return site.matchesRoute(path);
  }

  global.ZaliczGminySites = {
    isSupportedPage
  };

})(globalThis);
