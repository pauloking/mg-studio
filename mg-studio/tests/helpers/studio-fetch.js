'use strict';
module.exports = function studioFetch(app) {
  return (url, options = {}) => fetch(url, {
    ...options,
    headers: { ...options.headers, 'X-Studio-Token': app.csrfToken }
  });
};
