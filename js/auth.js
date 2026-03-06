
(function () {
  'use strict';

  /**
   * Wait for Supabase client to initialize.
   * Polls every 50ms up to 5 seconds, then resolves even if not ready.
   */
  function waitForSupabase(timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var startTime = Date.now();
    return new Promise(function (resolve) {
      var interval = setInterval(function () {
        if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
          clearInterval(interval);
          resolve(window.sb);
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          console.warn('[Auth] Supabase client initialization timeout, proceeding anyway');
          resolve(null);
        }
      }, 50);
    });
  }

  /**
   * Get the Supabase client.
   * Checks that window.sb exists and is properly initialized.
   * Returns null if not available (with logging).
   */
  function getSupabase() {
    if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
      return window.sb;
    }

    // Client not available - log helpful diagnostic
    if (!window.sb) {
      console.error(
        '[Auth] Supabase client not initialized (window.sb is undefined).\n' +
        'Ensure js/supabase-init.js has finished initializing.\n' +
        'Check browser console for [Supabase] initialization errors.'
      );
    } else if (typeof window.sb.auth === 'undefined') {
      console.error(
        '[Auth] Supabase client is invalid or incomplete (no auth property).\n' +
        'This may indicate a CDN loading or initialization issue.'
      );
    }

    return null;
  }

  function safeRedirectTarget(raw) {
    if (!raw) return 'index.html';
    var v = String(raw);
    if (/^https?:\/\//i.test(v)) return 'index.html';
    if (v.indexOf('auth.html') === 0) return 'index.html';
    if (v.indexOf('javascript:') === 0) return 'index.html';
    return v;
  }

  function getRedirectTargetFromQuery() {
    var redirect = new URLSearchParams(window.location.search).get('redirect') || 'index.html';
    return safeRedirectTarget(redirect);
  }

  function setMessage(msgEl, text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'alert ' + (kind === 'success' ? 'alert-success' : kind === 'info' ? 'alert-info' : 'alert-error');
    msgEl.style.display = text ? 'block' : 'none';
  }

  function showErrorModal(message) {
    var modal = document.getElementById('error-modal');
    var modalMsg = document.getElementById('error-modal-message');
    var modalTitle = document.getElementById('error-modal-title');
    if (modal && modalMsg) {
      if (modalTitle) modalTitle.textContent = 'Error';
      modalMsg.textContent = message || 'An error occurred. Please try again.';
      modal.style.display = 'flex';
    }
  }

  function showLoginSuccessModal(redirectTarget) {
    var modal = document.getElementById('login-success-modal');
    var modalMsg = document.getElementById('login-success-modal-message');
    var modalTitle = document.getElementById('login-success-modal-title');
    if (modal && modalMsg) {
      if (modalTitle) modalTitle.textContent = 'Login Successful';
      modalMsg.textContent = 'You have been logged in successfully.';
      modal.style.display = 'flex';
      // Store the redirect target for use when modal closes
      modal.dataset.redirectTarget = redirectTarget || 'index.html';
    }
  }

  function setLoading(form, loading) {
    if (!form) return;
    var submit = form.querySelector('button[type="submit"]');
    var google = document.getElementById('google-oauth');
    if (submit) submit.disabled = !!loading;
    if (google) google.disabled = !!loading;
    form.setAttribute('aria-busy', loading ? 'true' : 'false');
  }

  function isProbablyEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function handleLogin(e) {
    e.preventDefault();
    var form = e.target;
    var email = form.querySelector('[name="email"]') && form.querySelector('[name="email"]').value;
    var password = form.querySelector('[name="password"]') && form.querySelector('[name="password"]').value;
    var msgEl = form.querySelector('[data-auth-message]');
    if (!email || !password) {
      setMessage(msgEl, 'Please enter email and password.', 'error');
      return;
    }
    if (!isProbablyEmail(email)) {
      setMessage(msgEl, 'Please enter a valid email address.', 'error');
      return;
    }
    var sb = getSupabase();
    if (!sb) {
      setMessage(msgEl, 'Authentication service is not available. Please refresh the page.', 'error');
      return;
    }
    setMessage(msgEl, '', 'info');
    setLoading(form, true);
    sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (res) {
        if (res.error) {
          showErrorModal(res.error.message);
          setLoading(form, false);
          return;
        }
        
        // Upsert user profile after successful login
        if (res.data && res.data.user && typeof window.PAH !== 'undefined' && typeof window.PAH.upsertUserProfile === 'function') {
          window.PAH.upsertUserProfile(res.data.user)
            .then(function () {
              var redirect = getRedirectTargetFromQuery();
              showLoginSuccessModal(redirect);
            })
            .catch(function (err) {
              console.error('[Auth] Error upserting profile after login:', err);
              // Still show success modal even if upsert fails
              var redirect = getRedirectTargetFromQuery();
              showLoginSuccessModal(redirect);
            });
        } else {
          var redirect = getRedirectTargetFromQuery();
          showLoginSuccessModal(redirect);
        }
      })
      .catch(function (err) {
        showErrorModal((err && err.message) ? err.message : 'Login failed.');
      })
      .finally(function () {
        setLoading(form, false);
      });
  }

  /**
   * Register user via Supabase Auth.
   * Profile data is automatically created by a database trigger on auth.users insert.
   * No manual profile insert is needed in this function.
   */
  function handleRegister(e) {
    e.preventDefault();
    var form = e.target;
    var email = form.querySelector('[name="email"]') && form.querySelector('[name="email"]').value;
    var password = form.querySelector('[name="password"]') && form.querySelector('[name="password"]').value;
    var fullName = form.querySelector('[name="full_name"]') && form.querySelector('[name="full_name"]').value;
    var msgEl = form.querySelector('[data-auth-message]');
    var confirmPassword = form.querySelector('[name="confirm_password"]') && form.querySelector('[name="confirm_password"]').value;

    // Validate inputs
    if (!email || !password) {
      setMessage(msgEl, 'Please enter email and password.', 'error');
      return;
    }
    if (!isProbablyEmail(email)) {
      setMessage(msgEl, 'Please enter a valid email address.', 'error');
      return;
    }
    if (password.length < 6) {
      setMessage(msgEl, 'Password must be at least 6 characters.', 'error');
      return;
    }

    // Unified auth page includes confirm password; legacy register form does not
    if (typeof confirmPassword === 'string') {
      if (!confirmPassword) {
        setMessage(msgEl, 'Please confirm your password.', 'error');
        return;
      }
      if (confirmPassword !== password) {
        showErrorModal('Passwords do not match. Please try again.');
        return;
      }
    }

    var sb = getSupabase();
    if (!sb) {
      setMessage(msgEl, 'Authentication service is not available. Please refresh the page.', 'error');
      return;
    }

    setMessage(msgEl, '', 'info');
    setLoading(form, true);

    // Sign up user. User profile will be created automatically by DB trigger.
    // Full name is passed via auth metadata (options.data), which the trigger can access.
    console.log('[Auth] Attempting signUp for email:', email);
    console.log('[Auth] Client available:', !!sb);
    console.log('[Auth] Auth service available:', typeof sb.auth);
    console.log('[Auth] SignUp method available:', typeof sb.auth.signUp);
    
    var signUpPayload = {
      email: email,
      password: password,
      options: {
        data: {
          full_name: fullName || null
        }
      }
    };
    
    console.log('[Auth] SignUp payload:', signUpPayload);
    
    sb.auth.signUp(signUpPayload)
      .then(function (res) {
        console.log('[Auth] SignUp response received:', res);
        console.log('[Auth] Response error:', res.error);
        console.log('[Auth] Response data:', res.data);
        
        if (res.error) {
          console.error('[Auth] SignUp error from response:', res.error);
          setMessage(msgEl, res.error.message, 'error');
          setLoading(form, false);
          return;
        }

        // Check if user has an active session (auto-confirmed, or email_confirmations disabled)
        var hasSession = !!(res && res.data && res.data.session);
        console.log('[Auth] Has active session:', hasSession);

        if (hasSession) {
          // User is immediately signed in; upsert profile then redirect
          console.log('[Auth] User signed in, upserting profile...');
          
          // Upsert user profile
          if (res.data && res.data.user && typeof window.PAH !== 'undefined' && typeof window.PAH.upsertUserProfile === 'function') {
            window.PAH.upsertUserProfile(res.data.user)
              .then(function () {
                setMessage(msgEl, 'Account created successfully. Redirecting...', 'success');
                var redirect = getRedirectTargetFromQuery();
                setTimeout(function () { window.location.href = redirect; }, 500);
              })
              .catch(function (err) {
                console.error('[Auth] Error upserting profile after signup:', err);
                // Still redirect even if upsert fails
                setMessage(msgEl, 'Account created successfully. Redirecting...', 'success');
                var redirect = getRedirectTargetFromQuery();
                setTimeout(function () { window.location.href = redirect; }, 500);
              });
          } else {
            setMessage(msgEl, 'Account created successfully. Redirecting...', 'success');
            var redirect = getRedirectTargetFromQuery();
            setTimeout(function () { window.location.href = redirect; }, 500);
          }
        } else {
          // Email confirmation required
          console.log('[Auth] Email confirmation required, showing success message');
          
          // Clear form fields
          form.reset();
          
          // Show success modal
          var modal = document.getElementById('success-modal');
          var modalMsg = document.getElementById('modal-message');
          if (modal && modalMsg) {
            modalMsg.textContent = 'Registration successful. Check your email for verification.';
            modal.style.display = 'flex';
          }
          
          setLoading(form, false);
        }
      })
      .catch(function (err) {
        console.error('[Auth] SignUp error:', err);
        console.error('[Auth] Error message:', err && err.message ? err.message : 'Unknown error');
        console.error('[Auth] Full error object:', err);
        
        var errMsg = (err && err.message) ? err.message : 'Registration failed. Please try again.';
        setMessage(msgEl, errMsg, 'error');
        setLoading(form, false);
      });
  }

  function handleLogout() {
    var sb = getSupabase();
    if (sb) sb.auth.signOut().then(function () { window.location.href = 'index.html'; });
  }

  function initUnifiedAuthPage() {
    var form = document.getElementById('auth-form');
    if (!form) return;

    var sb = getSupabase();
    var msgEl = document.getElementById('auth-message') || form.querySelector('[data-auth-message]');

    // If client still isn't ready, show a helpful message and retry
    if (!sb) {
      console.warn('[Auth] Supabase client not ready in initUnifiedAuthPage, will retry');
      if (msgEl) {
        setMessage(msgEl, 'Initializing authentication... Please wait.', 'info');
      }
      // Retry after a short delay
      setTimeout(function () {
        initUnifiedAuthPage();
      }, 500);
      return;
    }

    var titleEl = document.getElementById('auth-title');
    var subtitleEl = document.getElementById('auth-subtitle');
    var submitBtn = document.getElementById('auth-submit');
    var toggleBtn = document.getElementById('auth-toggle');
    var toggleText = document.getElementById('auth-toggle-text');
    var fullNameWrap = document.getElementById('auth-fullname-wrap');
    var confirmWrap = document.getElementById('auth-confirm-wrap');
    var passwordInput = document.getElementById('auth-password');
    var confirmInput = document.getElementById('auth-confirm');
    var googleBtn = document.getElementById('google-oauth');

    // helper: show/hide password when eye button clicked
    function attachPasswordToggles() {
      var buttons = document.querySelectorAll('.toggle-password');
      buttons.forEach(function (btn) {
        var input = btn.previousElementSibling;
        if (!input || input.tagName.toLowerCase() !== 'input') return;
        btn.addEventListener('click', function () {
          var showing = input.type === 'text';
          input.type = showing ? 'password' : 'text';
          btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
          // optionally rotate icon by adding class if desired
        });
      });
    }

    function setMode(mode, updateUrl) {
      var isRegister = mode === 'register';

      if (titleEl) titleEl.textContent = isRegister ? 'Create your account' : 'Login';
      if (subtitleEl) subtitleEl.textContent = isRegister
        ? 'Create an account with email/password, or continue with Google.'
        : 'Sign in with email/password, or continue with Google.';
      if (submitBtn) submitBtn.textContent = isRegister ? 'Register' : 'Login';
      if (toggleText) toggleText.textContent = isRegister ? 'Already have an account?' : "Don't have an account?";
      if (toggleBtn) toggleBtn.textContent = isRegister ? 'Log in' : 'Sign up';

      if (fullNameWrap) fullNameWrap.style.display = isRegister ? '' : 'none';
      if (confirmWrap) confirmWrap.style.display = isRegister ? '' : 'none';

      if (passwordInput) passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
      if (confirmInput) confirmInput.required = !!isRegister;

      if (updateUrl) {
        var params = new URLSearchParams(window.location.search);
        params.set('mode', isRegister ? 'register' : 'login');
        window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
      }
    }

    function currentMode() {
      var m = new URLSearchParams(window.location.search).get('mode');
      return m === 'register' ? 'register' : 'login';
    }

    function redirectIfAuthed() {
      if (window.__authUser) {
        window.location.replace(getRedirectTargetFromQuery());
        return;
      }
      if (!sb) return;
      sb.auth.getSession().then(function (r) {
        if (r && r.data && r.data.session) {
          window.location.replace(getRedirectTargetFromQuery());
        }
      });
    }

    function maybeExchangeOAuthCode() {
      if (!sb) return Promise.resolve();
      var params = new URLSearchParams(window.location.search);
      var code = params.get('code');
      var errorDesc = params.get('error_description') || params.get('error');

      if (errorDesc) {
        setMessage(msgEl, decodeURIComponent(String(errorDesc).replace(/\+/g, ' ')), 'error');
      }
      if (!code) return Promise.resolve();

      setMessage(msgEl, 'Completing Google sign-in…', 'info');
      return sb.auth.exchangeCodeForSession(code).then(function (res) {
        if (res && res.error) {
          setMessage(msgEl, res.error.message || 'Could not complete Google sign-in.', 'error');
          return;
        }
        
        // Extract user from session after code exchange
        var user = res && res.data && res.data.session ? res.data.session.user : null;
        
        // Upsert user profile with Google OAuth data
        if (user && typeof window.PAH !== 'undefined' && typeof window.PAH.upsertUserProfile === 'function') {
          console.log('[Auth] Upserting Google OAuth user profile:', user.id);
          window.PAH.upsertUserProfile(user)
            .catch(function (err) {
              console.error('[Auth] Error upserting Google OAuth profile:', err);
              // Continue anyway - don't block redirect
            });
        }
        
        params.delete('code');
        params.delete('state');
        params.delete('error');
        params.delete('error_description');
        var cleaned = window.location.pathname + (params.toString() ? ('?' + params.toString()) : '');
        window.history.replaceState({}, '', cleaned);
      }).catch(function () {
        setMessage(msgEl, 'Could not complete Google sign-in.', 'error');
      });
    }

    // Default mode: login (unless URL forces register)
    setMode(currentMode(), false);
    // wire up password visibility toggles after elements exist
    attachPasswordToggles();

    form.addEventListener('submit', function (e) {
      if (currentMode() === 'register') return handleRegister(e);
      return handleLogin(e);
    });

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        setMessage(msgEl, '', 'info');
        setMode(currentMode() === 'register' ? 'login' : 'register', true);
      });
    }

    if (googleBtn) {
      googleBtn.addEventListener('click', function () {
        if (!sb) {
          setMessage(msgEl, 'Authentication service is not available. Please refresh the page.', 'error');
          return;
        }
        setMessage(msgEl, '', 'info');
        setLoading(form, true);

        var redirect = getRedirectTargetFromQuery();
        var redirectTo = window.location.origin + window.location.pathname +
          '?redirect=' + encodeURIComponent(redirect) +
          '&mode=' + encodeURIComponent(currentMode());

        sb.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectTo }
        }).catch(function () {
          setMessage(msgEl, 'Could not start Google sign-in.', 'error');
          setLoading(form, false);
        });
      });
    }

    maybeExchangeOAuthCode().then(function () {
      redirectIfAuthed();
    });
  }


  window.testSupabaseAuth = function() {
    console.log('=== SUPABASE CLIENT TEST ===');
    console.log('window.sb exists:', !!window.sb);
    
    if (!window.sb) {
      console.error('ERROR: window.sb is not defined!');
      console.log('window.supabase exists:', !!window.supabase);
      return;
    }
    
    console.log('window.sb.auth exists:', !!window.sb.auth);
    console.log('window.SUPABASE_ANON_KEY exists:', !!window.SUPABASE_ANON_KEY);
    console.log('ANON_KEY (first 30 chars):', window.SUPABASE_ANON_KEY.substring(0, 30) + '...');
    console.log('SUPABASE_URL:', window.SUPABASE_URL);
    
    // Check client internals
    console.log('window.sb object keys:', Object.keys(window.sb));
    console.log('window.sb.auth object keys:', Object.keys(window.sb.auth));
    
    // Try to call getSession to see if client is authenticated
    console.log('');
    console.log('TEST 1: Attempting getSession()...');
    window.sb.auth.getSession().then(function(result) {
      console.log('✓ getSession() promise resolved!');
      console.log('Result:', result);
      if (result.error) {
        console.error('✗ ERROR in session result:', result.error);
      } else {
        console.log('✓ No error in session. Session data:', result.data);
      }
    }).catch(function(err) {
      console.error('✗ getSession() promise rejected!');
      console.error('Error:', err);
      console.error('Error message:', err && err.message ? err.message : 'No message');
    });
    
    // Try a test signup with a test email
    console.log('');
    console.log('TEST 2: Attempting signUp with test data...');
    var testEmail = 'test-' + Date.now() + '@example.com';
    console.log('Using test email:', testEmail);
    
    window.sb.auth.signUp({
      email: testEmail,
      password: 'TestPassword123456',
      options: {
        data: {
          full_name: 'Test User'
        }
      }
    }).then(function(result) {
      console.log('✓ signUp() promise resolved!');
      console.log('Result:', result);
      if (result.error) {
        console.error('✗ ERROR in signup result:', result.error);
      } else {
        console.log('✓ signUp succeeded. User data:', result.data);
      }
    }).catch(function(err) {
      console.error('✗ signUp() promise rejected!');
      console.error('Error:', err);
      console.error('Error message:', err && err.message ? err.message : 'No message');
      console.error('Full error object:', err);
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var loginForm = document.getElementById('login-form');
    var registerForm = document.getElementById('register-form');
    var logoutBtn = document.getElementById('nav-logout');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (logoutBtn) logoutBtn.addEventListener('click', function (e) { e.preventDefault(); handleLogout(); });
    
    // Modal close handlers
    var successModal = document.getElementById('success-modal');
    var modalClose = document.getElementById('modal-close');
    var modalOverlay = successModal ? successModal.querySelector('.modal-overlay') : null;
    
    function closeModal() {
      if (successModal) successModal.style.display = 'none';
      window.location.href = 'auth.html?mode=login';
    }
    
    if (modalClose) modalClose.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);
    
    // Error modal close handlers
    var errorModal = document.getElementById('error-modal');
    var errorModalClose = document.getElementById('error-modal-close');
    var errorModalOk = document.getElementById('error-modal-ok');
    var errorModalOverlay = errorModal ? errorModal.querySelector('.modal-overlay') : null;
    
    function closeErrorModal() {
      if (errorModal) errorModal.style.display = 'none';
    }
    
    if (errorModalClose) errorModalClose.addEventListener('click', closeErrorModal);
    if (errorModalOk) errorModalOk.addEventListener('click', closeErrorModal);
    if (errorModalOverlay) errorModalOverlay.addEventListener('click', closeErrorModal);
    
    // Login success modal close handlers
    var loginSuccessModal = document.getElementById('login-success-modal');
    var loginSuccessModalClose = document.getElementById('login-success-modal-close');
    var loginSuccessModalOk = document.getElementById('login-success-modal-ok');
    var loginSuccessModalOverlay = loginSuccessModal ? loginSuccessModal.querySelector('.modal-overlay') : null;
    
    function closeLoginSuccessModal() {
      if (loginSuccessModal) {
        var redirectTarget = loginSuccessModal.dataset.redirectTarget || 'index.html';
        loginSuccessModal.style.display = 'none';
        window.location.href = redirectTarget;
      }
    }
    
    if (loginSuccessModalClose) loginSuccessModalClose.addEventListener('click', closeLoginSuccessModal);
    if (loginSuccessModalOk) loginSuccessModalOk.addEventListener('click', closeLoginSuccessModal);
    if (loginSuccessModalOverlay) loginSuccessModalOverlay.addEventListener('click', closeLoginSuccessModal);
    
    // Close error modal when pressing Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && errorModal && errorModal.style.display !== 'none') {
        closeErrorModal();
      }
    });
    
    // Close login success modal when pressing Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && loginSuccessModal && loginSuccessModal.style.display !== 'none') {
        closeLoginSuccessModal();
      }
    });
    
    // Close modal when pressing Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && successModal && successModal.style.display !== 'none') {
        closeModal();
      }
    });
    
    // Wait for Supabase client to be ready before initializing auth page
    waitForSupabase(5000).then(function () {
      initUnifiedAuthPage();
    });
  });
})();
