import { generateFetchInterceptorCode } from './fetch-interceptor.js';
import type { RecorderOptions } from './types.js';

/**
 * Generates a self-contained HTML script block that records user interactions
 * via rrweb and captures network requests via a custom fetch interceptor.
 *
 * The output is a string of HTML (two <script> tags) that the user pastes
 * into their Vercel site's <head>. It runs entirely in the browser with no
 * external dependencies beyond the rrweb CDN script.
 */
export function generateRecorderScript(options: RecorderOptions): string {
  const sessionId = options.sessionId;
  const maxDuration = options.maxDuration ?? 300000;
  const sampleMouseMove = options.sampleMouseMove ?? 50;
  const networkPatterns = options.captureNetworkPatterns ?? ['/api/'];
  const collectionEndpoint = options.collectionEndpoint ?? null;

  const fetchInterceptorCode = generateFetchInterceptorCode(networkPatterns);

  const configJson = JSON.stringify({
    sessionId,
    maxDuration,
    networkPatterns,
    sampling: {
      mousemove: sampleMouseMove,
      mouseInteraction: true,
      scroll: 150,
      input: 'last',
    },
  });

  const collectionSnippet = collectionEndpoint
    ? `
      // Send session data to collection endpoint
      try {
        navigator.sendBeacon(${JSON.stringify(collectionEndpoint)}, JSON.stringify(sessionData));
      } catch(e) {
        console.warn('[v2cf] Failed to send session via beacon:', e);
      }`
    : '';

  return `<script src="https://unpkg.com/rrweb@2.0.0-alpha.20/dist/record/rrweb-record.min.js"></script>
<script>
(function() {
  // v2cf recorder -- captures DOM interactions and network traffic
  var __v2cf_config = ${configJson};
  window.__v2cf_config = __v2cf_config;
  window.__v2cf_events = [];
  window.__v2cf_network_events = [];

  // Install fetch interceptor
  ${fetchInterceptorCode}

  // Wait for rrweb to load, then start recording
  var startTime = Date.now();

  function startRecording() {
    if (typeof rrwebRecord === 'undefined') {
      setTimeout(startRecording, 100);
      return;
    }

    rrwebRecord({
      emit: function(event) {
        window.__v2cf_events.push(event);
      },
      sampling: {
        mousemove: __v2cf_config.sampling.mousemove,
        mouseInteraction: __v2cf_config.sampling.mouseInteraction,
        scroll: __v2cf_config.sampling.scroll,
        input: __v2cf_config.sampling.input
      }
    });
  }

  startRecording();

  // Auto-stop after maxDuration
  setTimeout(function() {
    window.__v2cf_stop();
  }, __v2cf_config.maxDuration);

  // Session finalization
  window.__v2cf_stop = function() {
    var endTime = Date.now();
    var sessionData = {
      sessionId: __v2cf_config.sessionId,
      captureVersion: 1,
      startTime: startTime,
      endTime: endTime,
      sourceUrl: window.location.origin,
      rrwebEvents: window.__v2cf_events,
      networkEvents: window.__v2cf_network_events,
      metadata: {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        recordingDuration: endTime - startTime
      }
    };
${collectionSnippet}

    // Store in localStorage as fallback
    try {
      localStorage.setItem(
        'v2cf_session_' + __v2cf_config.sessionId,
        JSON.stringify(sessionData)
      );
    } catch(e) {
      console.warn('[v2cf] Failed to store session in localStorage:', e);
    }

    console.log('[v2cf] Session ' + __v2cf_config.sessionId + ' captured (' +
      window.__v2cf_events.length + ' DOM events, ' +
      window.__v2cf_network_events.length + ' network events)');
  };
})();
</script>`;
}
