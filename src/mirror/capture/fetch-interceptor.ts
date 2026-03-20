/**
 * Generates browser-side JavaScript code that monkey-patches window.fetch
 * to capture all outbound HTTP requests and responses.
 *
 * The generated code uses response.clone() to read the response body
 * without consuming the original response stream -- the application
 * continues to work normally while v2cf captures the network traffic.
 */
export function generateFetchInterceptorCode(
  networkPatterns: string[]
): string {
  const patternsJson = JSON.stringify(networkPatterns);

  return `
// v2cf fetch interceptor -- captures network events without consuming responses
(function() {
  var NETWORK_PATTERNS = ${patternsJson};
  window.__v2cf_network_events = window.__v2cf_network_events || [];

  var originalFetch = window.fetch;

  window.fetch = async function(input, init) {
    var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    var method = (init && init.method) || 'GET';
    var requestBody = null;
    var requestHeaders = {};

    try {
      if (init && init.body) {
        requestBody = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      }
    } catch(e) {
      requestBody = '[unreadable body]';
    }

    try {
      if (init && init.headers) {
        var h = new Headers(init.headers);
        h.forEach(function(value, key) { requestHeaders[key] = value; });
      }
    } catch(e) {}

    var startTime = performance.now();
    var response = await originalFetch.call(window, input, init);
    var endTime = performance.now();

    // Clone the response so the application gets the original untouched stream
    var cloned = response.clone();

    // Read the cloned response body asynchronously (non-blocking)
    cloned.text().then(function(responseBody) {
      var responseHeaders = {};
      response.headers.forEach(function(value, key) { responseHeaders[key] = value; });

      var isLlmEndpoint = NETWORK_PATTERNS.some(function(pattern) {
        return url.indexOf(pattern) !== -1;
      });

      window.__v2cf_network_events.push({
        timestamp: Date.now(),
        method: method,
        url: url,
        requestBody: requestBody,
        requestHeaders: requestHeaders,
        status: response.status,
        responseHeaders: responseHeaders,
        responseBody: responseBody,
        duration: endTime - startTime,
        isLlmEndpoint: isLlmEndpoint
      });
    }).catch(function() {
      // Silently ignore read failures for opaque responses
    });

    // Return the original response to the application
    return response;
  };
})();
`.trim();
}
