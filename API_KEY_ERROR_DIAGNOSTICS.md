# API Key Error Diagnostics and Fix

## Error Description
When clicking Register, you get a 500 error from Supabase:
```
Failed to load resource: the server responded with a status of 500 ()
{"message":"No API key found in request","hint":"No `apikey` request header or url param was found."}
```

## Root Cause Analysis
The Supabase API is not receiving the API key in the request headers. This suggests one of the following:

1. The Supabase client was created but didn't receive the API key properly
2. The API key is empty or invalid
3. The Supabase library requires different initialization

## Updated Code with Enhanced Logging

I've updated both `supabase-init.js` and `auth.js` to provide detailed console logging. Now you can:

### 1. Check If Client Was Created Properly
When you open the auth page, look for these console logs (press F12):

```
[Supabase] Config loaded - URL length: XX , Key length: YY
[Supabase] Client initialized successfully.
[Supabase] URL: https://vmphufvsbuzzqgcckghe.supabase.co
[Supabase] API Key loaded (first 20 chars): [KEY_START]...
[Supabase] Client auth methods available: {
  signUp: "function",
  signIn: "function",
  signOut: "function",
  getSession: "function"
}
```

### 2. Check When You Click Register
Look for these console logs:

```
[Auth] Attempting signUp for email: test@example.com
[Auth] Client available: true
[Auth] Auth service available: function
[Auth] SignUp method available: function
[Auth] SignUp payload: {
  email: "test@example.com",
  password: "...",
  options: { data: { full_name: null } }
}
```

### 3. If There's an Error
You'll see:

```
[Auth] SignUp error: Error: No API key found in request
[Auth] Error message: No API key found in request
[Auth] Full error object: [FULL_ERROR]
```

## Diagnostic Steps

### Step 1: Check Console Initialization Logs
1. Open auth.html
2. Open DevTools (F12) → Console tab
3. Look for `[Supabase]` messages
4. Verify:
   - ✓ URL length is > 0
   - ✓ Key length is > 0
   - ✓ "Client initialized successfully" message appears
   - ✓ All auth methods show "function"

### Step 2: Check API Key is Loaded
1. In DevTools console, type:
   ```javascript
   window.SUPABASE_ANON_KEY
   ```
2. Press Enter
3. You should see a long JWT token starting with `ey...`
4. If it's undefined or empty, the config.js didn't load properly

### Step 3: Try Register and Check Logs
1. Fill in form with:
   - Email: `test@example.com`
   - Password: `TestPass123`
   - Full Name: `Test`
2. Click Register
3. Look for `[Auth]` messages in console
4. Look for the error message

## Possible Issues and Solutions

### Issue 1: API Key is Empty
**Symptom**: `Key length: 0` in console

**Fix**: 
- Open `js/config.js`
- Verify `SUPABASE_ANON_KEY` has a value (should be a long JWT token)
- Make sure it's not being set to an empty string

### Issue 2: Config.js Not Loading
**Symptom**: `[Supabase] Fatal: SUPABASE_ANON_KEY not found`

**Fix**:
- Verify script order in `auth.html`:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="js/config.js"></script>
  <script src="js/supabase-init.js"></script>
  ```
- Make sure `config.js` comes before `supabase-init.js`

### Issue 3: Supabase Library Not Loaded
**Symptom**: `[Supabase] Fatal: Supabase library (window.supabase) not found`

**Fix**:
- Check that CDN script loads successfully
- In DevTools Network tab, look for `@supabase/supabase-js@2`
- If it fails, check your internet connection or CDN availability

### Issue 4: Client Created but API Key Not Sent
**Symptom**: Client initialized successfully but still get "No API key found" error

**Fix**: 
This could indicate an issue with how the Supabase library is working. Try:
- Check browser console for any warnings about CORS or headers
- Verify the API key format is correct (should be a JWT token)
- Check if Supabase project settings have restrictions

## Manual Testing in Console

If you want to test the client directly, in DevTools console run:

```javascript
// Check client exists
console.log('Client:', window.sb);

// Check auth service
console.log('Auth:', window.sb.auth);

// Try to get current session
window.sb.auth.getSession().then(r => console.log('Session:', r));
```

If `getSession()` works and returns data, the client has the API key. If it fails with "No API key found", the client wasn't initialized properly.

## What to Try If Still Getting Error

1. **Clear browser cache**: The old version of the library might be cached
   - DevTools → Application → Clear Storage → Clear All

2. **Hard refresh page**: 
   - Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

3. **Check Supabase project**: 
   - Log into Supabase dashboard
   - Go to Settings → API
   - Verify your anon key matches what's in `config.js`

4. **Check Row Level Security**:
   - Supabase → SQL Editor → Check `auth.users` permissions
   - Make sure anonymous users can call `auth.signup()`

5. **Test with curl** (advanced):
   ```bash
   curl -X POST \
     'https://vmphufvsbuzzqgcckghe.supabase.co/auth/v1/signup' \
     -H 'apikey: YOUR_ANON_KEY' \
     -H 'Content-Type: application/json' \
     -d '{"email":"test@example.com","password":"password123"}'
   ```

## Next Steps

1. **Check console logs** using the steps above
2. **Share the console output** - specifically the `[Supabase]` and `[Auth]` messages
3. **I'll diagnose** based on what the logs show
4. **We'll apply a targeted fix** once we know what's failing

The enhanced logging will tell us exactly where the problem is!
