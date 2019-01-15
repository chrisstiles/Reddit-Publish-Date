self.addEventListener('fetch', e => {
  let { headers } = e.request;

  if (headers.get('Reddit-Publish-Date')) {
    e.respondWith(fetch(e.request)
      .then(response => {
        const { status, statusText, headers, body } = response;

        // Avoid console errors for common server error responses
        const errorCodes = [402, 403, 404, 503, 530];
        if (errorCodes.includes(status)) {
          return new Response(body, { headers: { 'RPD-Error-Status': String(status) } });
        }

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