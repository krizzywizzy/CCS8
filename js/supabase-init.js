

(function () {
  'use strict';

  /**
   * Wait for a condition to be true, with timeout.
   * Polls every 50ms up to 5 seconds.
   */
  function waitFor(condition, timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var startTime = Date.now();
    return new Promise(function (resolve, reject) {
      var interval = setInterval(function () {
        if (condition()) {
          clearInterval(interval);
          resolve();
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Timeout waiting for condition'));
        }
      }, 50);
    });
  }

  /**
   * Initialize Supabase client.
   * Called when both the library and config are available.
   */
  function initializeSupabaseClient() {
    // Prevent re-initialization
    if (window.sb && typeof window.sb.auth !== 'undefined') {
      console.log('[Supabase] Client already initialized.');
      return;
    }

    // Validate Supabase library is available
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.error(
        '[Supabase] Fatal: Supabase library (window.supabase) not found or invalid.\n' +
        'Ensure the CDN script is loaded: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
      );
      console.log('[Supabase] window.supabase:', window.supabase);
      console.log('[Supabase] typeof window.supabase.createClient:', typeof window.supabase?.createClient);
      return;
    }

    // Validate config values exist and are not empty
    if (!window.SUPABASE_URL || window.SUPABASE_URL.length === 0) {
      console.error(
        '[Supabase] Fatal: SUPABASE_URL not found or empty.\n' +
        'Define window.SUPABASE_URL in js/config.js'
      );
      return;
    }
    if (!window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.length === 0) {
      console.error(
        '[Supabase] Fatal: SUPABASE_ANON_KEY not found or empty.\n' +
        'Define window.SUPABASE_ANON_KEY in js/config.js'
      );
      return;
    }

    // Log the key length to verify it was loaded (don't log the full key for security)
    console.log('[Supabase] Config loaded - URL length:', window.SUPABASE_URL.length, ', Key length:', window.SUPABASE_ANON_KEY.length);

    try {
      // Create the Supabase client
      // Note: API key should be automatically added to all requests
      console.log('[Supabase] About to create client with:');
      console.log('[Supabase]   URL:', window.SUPABASE_URL);
      console.log('[Supabase]   KEY (first 30 chars):', window.SUPABASE_ANON_KEY.substring(0, 30));
      console.log('[Supabase]   createClient method exists:', typeof window.supabase.createClient);
      
      window.sb = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
          },
          global: {
            headers: {
              'apikey': window.SUPABASE_ANON_KEY
            }
          }
        }
      );

      // Verify client was created and has auth
      if (!window.sb || !window.sb.auth) {
        console.error('[Supabase] Client created but missing auth property');
        console.log('[Supabase] Client object:', window.sb);
        return;
      }

      console.log('[Supabase] ✓ Client initialized successfully.');
      console.log('[Supabase] ✓ URL:', window.SUPABASE_URL);
      console.log('[Supabase] ✓ API Key loaded (first 20 chars):', window.SUPABASE_ANON_KEY.substring(0, 20) + '...');
      console.log('[Supabase] ✓ Client object keys:', Object.keys(window.sb));
      console.log('[Supabase] ✓ Client auth methods available:', {
        signUp: typeof window.sb.auth.signUp,
        signIn: typeof window.sb.auth.signInWithPassword,
        signOut: typeof window.sb.auth.signOut,
        getSession: typeof window.sb.auth.getSession
      });

      // TEST: Try to get session to verify client can make authenticated requests
      console.log('[Supabase] Testing authenticated request with getSession()...');
      window.sb.auth.getSession().then(function(result) {
        if (result.error) {
          console.error('[Supabase] ✗ getSession returned error:', result.error);
        } else {
          console.log('[Supabase] ✓ getSession succeeded (no active session, but auth key is being used)');
        }
      }).catch(function(err) {
        console.error('[Supabase] ✗ getSession failed with exception:', err);
      });

      // Signal that initialization is complete
      if (window.PAH === undefined) {
        window.PAH = {};
      }
      window.PAH.supabaseReady = true;

    } catch (err) {
      console.error('[Supabase] Failed to create client:', err && err.message ? err.message : err);
      console.error('[Supabase] Full error object:', err);
    }
  }

  /**
   * Main initialization flow.
   * Wait for both the Supabase library and config to be available.
   */
  function initializeAsync() {
    // Check if already done
    if (window.sb) {
      console.log('[Supabase] Client already exists, skipping initialization.');
      return;
    }

    // Wait for both prerequisites
    waitFor(
      function () {
        return (
          typeof window.supabase !== 'undefined' &&
          window.supabase &&
          typeof window.supabase.createClient === 'function' &&
          typeof window.SUPABASE_URL !== 'undefined' &&
          typeof window.SUPABASE_ANON_KEY !== 'undefined'
        );
      },
      5000 // 5 second timeout
    )
      .then(function () {
        initializeSupabaseClient();
      })
      .catch(function (err) {
        console.error(
          '[Supabase] Initialization timeout. Ensure script order is correct:\n' +
          '1. CDN script (supabase-js v2)\n' +
          '2. js/config.js\n' +
          '3. js/supabase-init.js',
          err
        );
      });
  }

  /**
   * Initialize immediately if already in DOM, or wait for DOMContentLoaded
   */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAsync);
  } else {
    initializeAsync();
  }

})();
