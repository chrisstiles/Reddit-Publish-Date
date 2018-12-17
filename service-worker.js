self.addEventListener('fetch', e => {
  let { headers } = e.request;

  if (headers.get('Reddit-Publish-Date')) {
    e.respondWith(fetch(e.request)
      .then(response => {
        const { status, statusText, headers, body } = response;
        const init = {
          status: status,
          statusText: statusText,
          headers: {}
        };

        headers.forEach((value, key) => {
          if (!value.includes('preload')) {
            init.headers[key] = value;
          }
        });

        return new Response(body, init);
      })
    );
  }
});