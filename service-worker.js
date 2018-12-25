self.addEventListener('fetch', e => {
  let { headers } = e.request;

  if (headers.get('Reddit-Publish-Date')) {
    e.respondWith(fetch(e.request)
      .then(response => {
        const { status, statusText, headers, body } = response;

        // Avoid console errors for common server error responses
        if (status === 402 || status === 404) return new Response(body);

        const init = {
          status: status,
          statusText: statusText,
          headers: {}
        };

        // Prevent attempts to preload resources
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