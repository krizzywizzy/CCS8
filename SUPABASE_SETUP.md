# Supabase Frontend Setup Guide

## Overview

This document explains the Supabase client initialization architecture and how to properly set up your HTML pages to avoid race conditions and missing API key errors.

## Key Components

### 1. **js/config.js** - Configuration
- Stores `SUPABASE_URL` and `SUPABASE_ANON_KEY` in window globals
- These values are read from environment at build time
- No logic here, just variable declarations

### 2. **js/supabase-init.js** - Initialization
- Waits for the Supabase library to load via CDN
- Checks that `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` exist
- Creates the client using `window.supabase.createClient()`
- **Stores the client in `window.sb`** (NOT `window.supabase`)
- Logs clear console errors if anything fails
- Prevents race conditions with proper async waiting

### 3. **js/auth.js** - Authentication Logic
- Uses `window.sb` instead of `window.supabase`
- Includes helpful error messages and logging
- Works with both email/password auth and Google OAuth
- Detects initialization failures and logs debugging info

---

## Correct HTML Script Load Order

**This order is CRITICAL to avoid race conditions:**

```html
<!-- 1. CDN Library (must be first) -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

<!-- 2. Configuration (defines window.SUPABASE_URL and window.SUPABASE_ANON_KEY) -->
<script src="js/config.js"></script>

<!-- 3. Supabase Client Initialization (creates window.sb) -->
<script src="js/supabase-init.js"></script>

<!-- 4. Other scripts that depend on window.sb -->
<script src="js/main.js"></script>
<script src="js/auth.js"></script>
```

### Why This Order Matters

1. **CDN first**: Loads the library, makes `window.supabase` available
2. **Config second**: Sets up credentials for initialization
3. **Init third**: Creates and stores the client in `window.sb`
4. **Auth last**: Can safely use `window.sb` (already initialized)

If you load these out of order, you'll get:
- "No API key found in request" errors
- "window.sb is undefined" errors
- Silent failures with no console output

---

## Quick HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <!-- Your page content here -->

  <!-- SCRIPTS (correct order) -->
  <!-- 1. Library -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <!-- 2. Config -->
  <script src="js/config.js"></script>
  <!-- 3. Init -->
  <script src="js/supabase-init.js"></script>
  <!-- 4. Your app -->
  <script src="js/main.js"></script>
  <script src="js/auth.js"></script>
</body>
</html>
```

---

## How to Use the Initialized Client

### In Your JavaScript

```javascript
// After supabase-init.js has run, you can access the client:
var sb = window.sb;

// Check if it's available
if (!sb || !sb.auth) {
  console.error('Supabase client not initialized');
  return;
}

// Use it
sb.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
})
  .then(res => console.log('Success', res))
  .catch(err => console.error('Error', err));
```

### Checking Initialization Status

The initialization script sets a flag you can check:

```javascript
// After page load
if (window.PAH && window.PAH.supabaseReady) {
  console.log('Supabase is ready to use');
} else {
  console.warn('Supabase initialization in progress or failed');
}
```

### Common Initialization Checks

```javascript
function getSupabase() {
  if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
    return window.sb;
  }
  console.error('Supabase client not available');
  return null;
}
```

---

## Debugging

### Check Console Logs

The initialization script logs helpful messages:

```
[Supabase] Client initialized successfully.
[Supabase] URL: https://vmphufvsbuzzqgcckghe.supabase.co
```

Errors will appear as:

```
[Supabase] Fatal: SUPABASE_URL not found.
[Supabase] Initialization timeout. Ensure script order is correct...
```

### If You See "No API Key Found" Error

This means:
1. The client was used before `window.sb` was initialized
2. The anon key wasn't loaded properly from config.js
3. Scripts are loading in the wrong order

**Fix**: Check browser console for `[Supabase]` messages and verify script order.

### If You See "Supabase is undefined"

The CDN script didn't load or failed. Check:
1. Is the CDN URL correct? 
2. Is your internet connection working?
3. Try refreshing the page to retry CDN loading

---

## Configuration File Example (js/config.js)

```javascript
// Supabase Project Credentials
// These should be loaded from environment variables at build time
const SUPABASE_URL = 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

if (typeof window !== 'undefined') {
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
}
```

---

## Environment Variables (Production)

For production, replace the hardcoded values with environment variables:

```javascript
// js/config.js (production version)
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || '';

if (typeof window !== 'undefined') {
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
}
```

Then set environment variables in your deployment:
- `REACT_APP_SUPABASE_URL`
- `REACT_APP_SUPABASE_ANON_KEY`

---

## Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "No API key found in request" | Client initialized before config loaded | Check script order, verify config.js runs before init |
| "window.sb is undefined" | Init script hasn't run yet | Use same script order, check console for timeout errors |
| Silent failures, no console output | Missing error handling | Check browser console for `[Supabase]` messages |
| Google OAuth redirects to blank page | Client not available at callback time | Ensure `window.sb` is initialized on every page |
| "Cannot read property 'auth' of undefined" | window.sb exists but isn't valid | Check for init errors, may need to refresh |

---

## API Key Security

The anon key is **public-facing** and should:
- ✅ Be included in frontend code
- ✅ Be visible in browser console
- ✅ Be stored in version control safely
- ❌ NOT be used for sensitive operations
- ❌ Should have proper Row Level Security (RLS) policies

For sensitive operations, use a backend service with a service role key.

---

## Testing the Setup

### Browser Console Test

```javascript
// After page load, run in console:
console.log('Supabase client:', window.sb);
console.log('Auth available:', window.sb && window.sb.auth);
console.log('Ready flag:', window.PAH && window.PAH.supabaseReady);
```

Expected output:
```
Supabase client: SupabaseClient {...}
Auth available: true
Ready flag: true
```

### Sign In Test

```javascript
sb = window.sb;
sb.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'password'
}).then(res => console.log(res)):
```

---

## Next Steps

1. Verify script order in all HTML files
2. Check browser console for `[Supabase]` initialization messages
3. Test sign-in and sign-up flows
4. Review Row Level Security policies in Supabase dashboard
5. Implement error handling for network failures

---

## References

- [Supabase JavaScript Library](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
