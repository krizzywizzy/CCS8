# Main.js Refactoring Summary

## Issues Fixed

### 1. **Incorrect Client Reference**
**Before:** `getSupabase()` returned `window.supabase` (the library object)
**After:** Returns `window.sb` (the initialized client from supabase-init.js)

```javascript
// BEFORE (WRONG)
function getSupabase() {
  if (typeof window.supabase !== 'undefined') return window.supabase;
  return null;
}

// AFTER (CORRECT)
function getSupabase() {
  if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
    return window.sb;
  }
  return null;
}
```

### 2. **Synchronous API Call (Async Handling)**
**Before:** Treated `getSession()` as synchronous
**After:** Properly handles `getSession()` as a Promise

```javascript
// BEFORE (WRONG - treats async as sync)
function getAuthState() {
  var session = sb.auth.getSession();  // ❌ This is async!
  return { user: session && session.data && session.data.session ? session.data.session.user : null };
}

// AFTER (CORRECT - returns Promise)
function getAuthStateAsync() {
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
```

### 3. **Race Condition in DOMContentLoaded**
**Before:** Assumed `window.supabase` was ready on page load
**After:** Properly waits for `window.sb` to initialize with timeout protection

```javascript
// BEFORE (WRONG - assumes it's ready)
document.addEventListener('DOMContentLoaded', function () {
  if (typeof window.supabase !== 'undefined') {
    window.supabase.auth.getSession().then(...)  // ❌ May not exist yet
  }
});

// AFTER (CORRECT - waits for it to be ready)
function initAuthState() {
  getAuthStateAsync()
    .then(function (state) {
      window.__authUser = state.user;
      updateNavAuth();
    });

  var sb = getSupabase();
  if (sb && typeof sb.auth.onAuthStateChange === 'function') {
    sb.auth.onAuthStateChange(function (event, session) {
      window.__authUser = session ? session.user : null;
      updateNavAuth();
    });
  } else if (!sb) {
    // Not ready yet - wait for it
    waitForSupabase(3000).then(function () {
      initAuthState();  // Retry
    });
  }
}
```

### 4. **New Utilities Added**

#### `waitForSupabase(timeoutMs)`
Waits for the Supabase client to be initialized with timeout protection.
```javascript
waitForSupabase(5000)
  .then(function (sb) {
    // Client is ready
    sb.auth.getSession();
  })
  .catch(function (err) {
    console.error('Initialization timeout');
  });
```

#### `getAuthStateAsync()`
Replaces the old synchronous `getAuthState()`. Always returns a Promise.
```javascript
getAuthStateAsync()
  .then(function (state) {
    console.log('User:', state.user);
  });
```

#### Updated `window.PAH` Exports
All utilities are now exposed for other scripts to use:
```javascript
window.PAH.getSupabase()       // Get the client (synchronous check)
window.PAH.waitForSupabase()   // Wait for client (Promise-based)
window.PAH.getAuthStateAsync() // Get session (Promise-based)
window.PAH.setBreadcrumb()     // Set breadcrumb UI
window.PAH.updateNavAuth()     // Update navbar based on auth state
```

---

## Key Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Client Reference** | `window.supabase` (library) | `window.sb` (initialized client) |
| **Session Handling** | Synchronous (broken) | Asynchronous with Promise |
| **Race Conditions** | No protection against timing issues | Proper async waiting with retry logic |
| **Error Handling** | No try/catch | Proper error handling with fallbacks |
| **Initialization** | Assumes client is ready | Waits with timeout protection |

---

## Migration Guide for Other Scripts

If other scripts use these functions, update them:

### Old Code
```javascript
window.PAH.getAuthState()  // Returns {user: ...} synchronously (broken)
```

### New Code
```javascript
window.PAH.getAuthStateAsync()
  .then(function (state) {
    console.log('User:', state.user);
  });
```

---

## ES5 Compatibility

All code uses ES5 syntax:
- ✅ `Promise` instead of async/await
- ✅ `.then()/.catch()` instead of async/await
- ✅ `setInterval` instead of modern schedulers
- ✅ `forEach` with function expressions instead of arrow functions
- ✅ No modern syntax features

---

## Console Logging

The updated code includes helpful logging:
```
[Main] Auth state changed: SIGNED_IN
[Main] Error getting auth session: Network error
[Main] Supabase client not initialized, skipping auth listener setup
```

These logs help with debugging authentication flow issues.

---

## Next Steps

1. Test authentication on the site (sign up, sign in, sign out)
2. Check browser console for `[Main]` and `[Supabase]` messages
3. Verify navbar shows/hides login/logout buttons correctly
4. Test on different pages to ensure global auth state is maintained

All auth-related race conditions should now be resolved! ✅
