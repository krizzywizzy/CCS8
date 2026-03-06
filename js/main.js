/**
 * Ace Prosthetics Hub - Shared JS
 * Navbar, breadcrumbs, dropdown (click + keyboard), mobile menu
 *
 * Dependencies:
 * - window.sb (Supabase client initialized in js/supabase-init.js)
 * - window.PAH (shared state object)
 */
(function () {
  'use strict';

  /**
   * Get the Supabase client.
   * Returns window.sb (the initialized Supabase client) or null if not available.
   * Always check the return value before using, as initialization may still be in progress.
   */
  function getSupabase() {
    // Use window.sb (initialized in supabase-init.js), NOT window.supabase (the library)
    if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
      return window.sb;
    }
    return null;
  }

  /**
   * Wait for Supabase client to initialize.
   * Polls every 50ms up to 5 seconds.
   * Resolves when window.sb is ready, rejects on timeout.
   */
  function waitForSupabase(timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    var startTime = Date.now();
    return new Promise(function (resolve, reject) {
      var interval = setInterval(function () {
        if (getSupabase()) {
          clearInterval(interval);
          resolve(getSupabase());
          return;
        }
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(interval);
          reject(new Error('Supabase client initialization timeout'));
        }
      }, 50);
    });
  }

  /**
   * Get current auth session asynchronously.
   * Always use with .then() or async/await.
   * Returns Promise<{user: Object|null}>
   */
  function getAuthStateAsync() {
    var sb = getSupabase();
    if (!sb) {
      // Client not initialized yet
      return Promise.resolve({ user: null });
    }

    // getSession() is async - must be handled with Promise chain
    return sb.auth.getSession()
      .then(function (res) {
        var user = res && res.data && res.data.session ? res.data.session.user : null;
        return { user: user };
      })
      .catch(function (err) {
        console.error('[Main] Error getting auth session:', err && err.message ? err.message : err);
        return { user: null };
      });
  }

  /**
   * Upsert user profile after login (email/password or OAuth).
   * Ensures all users have an entry in the profiles table with their full_name.
   * 
   * For email/password: full_name comes from the signup form
   * For Google OAuth: full_name comes from user_metadata.full_name
   * 
   * Never overwrites an existing full_name with null/email.
   * Returns Promise that resolves when upsert completes or rejects on error.
   */
  function upsertUserProfile(user) {
    var sb = getSupabase();
    if (!sb || !user || !user.id) {
      console.warn('[Main] Cannot upsert profile: no user or Supabase client');
      return Promise.resolve();
    }

    // Extract full_name from various sources
    var fullName = null;
    
    // Priority 1: user_metadata.full_name (set by email signup form or Google OAuth)
    if (user.user_metadata && user.user_metadata.full_name) {
      fullName = user.user_metadata.full_name;
    }
    
    // If no full_name available, use email as fallback
    if (!fullName && user.email) {
      fullName = user.email;
    }

    console.log('[Main] Upserting profile for user:', user.id, 'with full_name:', fullName);

    // Upsert to profiles table
    // This will insert if not exists, update if exists
    // We use a PATCH-like approach: merge data without overwriting existing values
    return sb.from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: fullName
      }, {
        onConflict: 'id',
        ignoreDuplicates: false
      })
      .then(function (res) {
        if (res.error) {
          console.error('[Main] Error upserting profile:', res.error);
          return;
        }
        console.log('[Main] Profile upserted successfully:', res.data);
      })
      .catch(function (err) {
        console.error('[Main] Profile upsert exception:', err && err.message ? err.message : err);
      });
  }

  /**
   * Update navbar UI based on authenticated user state.
   * Fetches full_name from profiles table, with intelligent fallback:
   * 1. Try profiles.full_name (stored for all users)
   * 2. Fallback to user.user_metadata.full_name (Google OAuth)
   * 3. Final fallback to user.email
   */
  function updateNavAuth() {
    var user = window.__authUser || null;
    var signupLink = document.getElementById('nav-signup');
    var logoutWrap = document.querySelector('.nav-item-logout');
    var userSpan = document.getElementById('nav-user');

    if (signupLink) signupLink.style.display = user ? 'none' : '';
    if (logoutWrap) {
      logoutWrap.style.display = user ? '' : 'none';
      
      if (userSpan && user && user.id) {
        // Fetch the full_name from profiles table
        var sb = getSupabase();
        if (sb) {
          sb.from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
            .then(function (res) {
              var displayName = null;
              
              // Priority 1: profiles.full_name (stored during signup or OAuth)
              if (res && res.data && res.data.full_name) {
                displayName = res.data.full_name;
              }
              // Priority 2: user_metadata.full_name (Google OAuth, fresh from auth)
              else if (user.user_metadata && user.user_metadata.full_name) {
                displayName = user.user_metadata.full_name;
              }
              // Priority 3: email (always available)
              else if (user.email) {
                displayName = user.email;
              }
              
              // Set the display name
              if (displayName) {
                userSpan.textContent = displayName;
              } else {
                userSpan.textContent = 'User';
              }
            })
            .catch(function (err) {
              console.error('[Main] Error fetching user profile:', err && err.message ? err.message : err);
              // Fallback display if profile fetch fails
              var displayName = null;
              if (user.user_metadata && user.user_metadata.full_name) {
                displayName = user.user_metadata.full_name;
              } else if (user.email) {
                displayName = user.email;
              }
              userSpan.textContent = displayName || 'User';
            });
        }
      }
    }
  }

  /**
   * Initialize UI dropdowns with click and keyboard support.
   * - Click to toggle
   * - Keyboard (Enter/Space to open, Escape to close)
   * - Click outside to close
   */
  function initDropdowns() {
    document.querySelectorAll('.dropdown-toggle').forEach(function (btn) {
      var menuId = btn.getAttribute('aria-controls');
      var menu = menuId ? document.getElementById(menuId) : btn.nextElementSibling;

      function open() {
        btn.setAttribute('aria-expanded', 'true');
        if (menu) menu.classList.add('is-open');
      }
      function close() {
        btn.setAttribute('aria-expanded', 'false');
        if (menu) menu.classList.remove('is-open');
      }
      function toggle() {
        var isOpen = btn.getAttribute('aria-expanded') === 'true';
        if (isOpen) close(); else open();
      }

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      });

      if (menu) {
        menu.querySelectorAll('a, button').forEach(function (item) {
          item.addEventListener('blur', function () {
            setTimeout(function () {
              if (!menu.contains(document.activeElement) && document.activeElement !== btn) close();
            }, 150);
          });
        });
      }

      btn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
        if (e.key === 'Escape') close();
      });
    });

    document.addEventListener('click', function () {
      document.querySelectorAll('.dropdown-menu.is-open').forEach(function (m) {
        var t = document.querySelector('.dropdown-toggle[aria-controls="' + m.id + '"]');
        if (!t || !m.contains(event.target)) m.classList.remove('is-open');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    });
  }

  /**
   * Initialize mobile navigation toggle.
   * Shows/hides nav menu on small screens with accessibility support.
   * - Toggles menu visibility with .is-open and .active classes
   * - Updates aria-expanded attribute
   * - Closes menu on outside clicks
   * - Closes menu when a menu link is clicked
   * - Supports keyboard navigation (Escape key)
   */
  function initMobileNav() {
    var toggle = document.getElementById('nav-toggle');
    var navContainer = document.getElementById('nav-menu');
    if (!toggle || !navContainer) return;

    // Helper to update aria-expanded based on menu visibility
    function updateAriaExpanded() {
      var isOpen = navContainer.classList.contains('active');
      toggle.setAttribute('aria-expanded', isOpen);
    }

    // Toggle menu on button click
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      navContainer.classList.toggle('active');
      updateAriaExpanded();
    });

    // Close menu when clicking a link inside the nav
    var navLinks = navContainer.querySelectorAll('a, button');
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        navContainer.classList.remove('active');
        updateAriaExpanded();
      });
    });

    // Close menu when clicking outside
    document.addEventListener('click', function (e) {
      var isClickInside = navContainer.contains(e.target);
      var isClickOnToggle = toggle.contains(e.target);
      var isOpen = navContainer.classList.contains('active');

      if (isOpen && !isClickInside && !isClickOnToggle) {
        navContainer.classList.remove('active');
        updateAriaExpanded();
      }
    });

    // Close menu on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navContainer.classList.contains('active')) {
        navContainer.classList.remove('active');
        updateAriaExpanded();
        toggle.focus();
      }
    });
  }

  /**
   * Set breadcrumb navigation.
   * Example: setBreadcrumb([
   *   { label: 'Home', href: 'index.html' },
   *   { label: 'Tutorials', href: 'tutorials.html' },
   *   { label: 'JavaScript Basics' }  // current page, no href
   * ])
   */
  function setBreadcrumb(items) {
    var container = document.getElementById('breadcrumb-list');
    if (!container) return;
    container.innerHTML = '';
    items.forEach(function (item, i) {
      var li = document.createElement('li');
      if (i > 0) {
        var sep = document.createElement('span');
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = ' > ';
        li.appendChild(sep);
      }
      if (item.href) {
        var a = document.createElement('a');
        a.href = item.href;
        a.textContent = item.label;
        li.appendChild(a);
      } else {
        var span = document.createElement('span');
        span.setAttribute('aria-current', 'page');
        span.textContent = item.label;
        li.appendChild(span);
      }
      container.appendChild(li);
    });
  }

  /**
   * Track navigation path in sessionStorage and render breadcrumbs.
   * Maintains an array `pah_breadcrumb_trail` of {label, href} objects.
   * home resets trail; revisiting an existing href truncates to that index.
   */
  function trackAndSetBreadcrumb(pageLabel) {
    var currentUrl = window.location.pathname.split('/').pop() || 'index.html';
    var trail = [];
    try {
      var stored = sessionStorage.getItem('pah_breadcrumb_trail');
      trail = stored ? JSON.parse(stored) : [];
    } catch (e) {
      trail = [];
    }

    // if we arrived from a page that isn't the last item in the trail,
    // assume the user jumped/browsed directly and reset to avoid implying
    // they'd clicked through every nav item previously.
    if (document.referrer) {
      try {
        var refPath = new URL(document.referrer).pathname.split('/').pop() || 'index.html';
        if (trail.length > 0 && trail[trail.length - 1].href !== refPath) {
          trail = [{ label: 'Home', href: 'index.html' }];
        }
      } catch (e) {
        // ignore malformed referrer
      }
    }

    // if empty or landing on home, initialize
    if (trail.length === 0 || currentUrl === 'index.html') {
      trail = [{ label: 'Home', href: 'index.html' }];
    } else {
      // look for existing location
      var idx = trail.findIndex(function (item) { return item.href === currentUrl; });
      if (idx !== -1) {
        // going back - truncate
        trail = trail.slice(0, idx + 1);
      } else {
        // append new page
        trail.push({ label: pageLabel, href: currentUrl });
      }
    }

    // persist
    try {
      sessionStorage.setItem('pah_breadcrumb_trail', JSON.stringify(trail));
    } catch (e) {}

    // prepare output (last item no href)
    var output = trail.map(function (item, i) {
      if (i === trail.length - 1) {
        return { label: item.label };
      }
      return { label: item.label, href: item.href };
    });
    setBreadcrumb(output);
  }

  /**
   * Emit auth-ready event to signal that auth state is available.
   * This is called whenever auth state is established or changes.
   */
  function emitAuthReady() {
    try {
      console.log('[Main] Emitting auth-ready event; window.__authUser=', window.__authUser ? window.__authUser.id : null);
      document.dispatchEvent(new Event('auth-ready'));
    } catch (e) {
      console.error('[Main] Error emitting auth-ready:', e);
    }
  }

  /**
   * Initialize authentication state on page load.
   * 1. Wait for Supabase client to initialize
   * 2. Get current session (async - uses Promise)
   * 3. Set up listener for auth state changes
   * 4. Update navbar UI based on user state
   * 5. Upsert user profile to ensure consistent data
   * 6. Emit auth-ready event to notify other modules
   */
  function initAuthState() {
    // Set window.__authUser to null initially so other modules know auth is initializing
    window.__authUser = null;
    
    // Emit auth-ready immediately with null so other modules don't hang forever waiting
    setTimeout(function () { emitAuthReady(); }, 0);
    
    // Try to get current session
    getAuthStateAsync()
      .then(function (state) {
        window.__authUser = state.user || null;
        updateNavAuth();
        emitAuthReady();
        
        // Upsert profile to ensure all users have profile entries
        if (state.user) {
          return upsertUserProfile(state.user);
        }
      })
      .catch(function (err) {
        console.error('[Main] Failed to get auth state:', err && err.message ? err.message : err);
        window.__authUser = null;
        updateNavAuth();
        emitAuthReady();
      });

    // Set up listener for auth state changes (login, logout, etc.)
    // This will fire immediately and then again on any auth event
    var sb = getSupabase();
    if (sb && typeof sb.auth.onAuthStateChange === 'function') {
      sb.auth.onAuthStateChange(function (event, session) {
        // Update global auth state when it changes
        window.__authUser = session ? session.user : null;
        updateNavAuth();
        emitAuthReady();
        
        // Upsert profile after login
        if (session && session.user) {
          upsertUserProfile(session.user);
        }
        
        console.log('[Main] Auth state changed:', event);
      });
    } else if (!sb) {
      // Client not ready yet - wait for it and retry
      waitForSupabase(3000)
        .then(function () {
          initAuthState();
        })
        .catch(function () {
          console.warn('[Main] Supabase client not initialized, skipping auth listener setup');
          window.__authUser = null;
          emitAuthReady();
        });
    }
  }

  // Expose utilities on window.PAH namespace for use by other scripts
  window.PAH = window.PAH || {};
  window.PAH.setBreadcrumb = setBreadcrumb;
  window.PAH.trackAndSetBreadcrumb = trackAndSetBreadcrumb;
  window.PAH.updateNavAuth = updateNavAuth;
  window.PAH.upsertUserProfile = upsertUserProfile;
  window.PAH.getAuthStateAsync = getAuthStateAsync;
  window.PAH.getSupabase = getSupabase;
  window.PAH.waitForSupabase = waitForSupabase;

  /**
   * Main initialization on page load.
   * Order of operations:
   * 1. Initialize UI components (dropdowns, mobile menu)
   * 2. Set up authentication state (fetch session, listen for changes)
   */
  document.addEventListener('DOMContentLoaded', function () {
    initDropdowns();
    initMobileNav();
    initAuthState();
    setupAdminMenu();
  });

  /**
   * Setup Admin Dropdown Menu
   * Shows admin menu only for authorized users
   */
  function setupAdminMenu() {
    var ALLOWED_ADMIN_EMAILS = [
      'khryzlexito@su.edu.ph',
      'adrianleesalacrito@su.edu.ph',
      'joseargieccavales@su.edu.ph'
    ];

    var adminDropdown = document.querySelector('.nav-admin-dropdown');
    var adminMenuBtn = document.getElementById('admin-menu-btn');

    // Only setup if elements exist on this page
    if (!adminDropdown || !adminMenuBtn) {
      return;
    }

    // Wait for Supabase to be ready
    waitForSupabase(5000)
      .then(function (sb) {
        return sb.auth.getUser();
      })
      .then(function (res) {
        var user = res && res.data ? res.data.user : null;

        if (user && ALLOWED_ADMIN_EMAILS.indexOf(user.email) !== -1) {
          adminDropdown.style.display = 'block';

          // Toggle dropdown on button click
          adminMenuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            adminDropdown.classList.toggle('open');
          });

          // Close dropdown when clicking outside
          document.addEventListener('click', function (e) {
            if (!adminDropdown.contains(e.target)) {
              adminDropdown.classList.remove('open');
            }
          });

          // Close dropdown when clicking a menu item
          var items = adminDropdown.querySelectorAll('.admin-dropdown-item');
          items.forEach(function (item) {
            item.addEventListener('click', function () {
              adminDropdown.classList.remove('open');
            });
          });

          // Handle Escape key
          document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
              adminDropdown.classList.remove('open');
            }
          });
        }
      })
      .catch(function (err) {
        console.warn('[Main] Could not setup admin menu:', err && err.message ? err.message : err);
      });
  }
})();
