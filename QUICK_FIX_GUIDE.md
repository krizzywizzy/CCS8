# Quick Fix for "No API Key" Error

## Step 1: Test the Client (Right Now)

1. Open auth.html in your browser
2. Press F12 to open DevTools
3. Go to Console tab
4. Run this command:
   ```javascript
   window.testSupabaseAuth()
   ```

5. Look at the output - it will tell you exactly what's wrong:
   - `✓ getSession() succeeded!` = Client has API key ✓
   - `✗ getSession() failed!` = Something is wrong ✗

## Step 2: Check Console Logs

Before running the test, look at the console for these startup messages:

```
[Supabase] Config loaded - URL length: 48 , Key length: 201
[Supabase] Client initialized successfully.
[Supabase] API Key loaded (first 20 chars): eyJhbGciOiJIUzI1Ni...
```

If you don't see these messages, the client didn't initialize properly.

## Step 3: If getSession() Fails

If the test shows an error, check:

**Option A: Clear Cache**
- Ctrl+Shift+Delete (Windows) or Cmd+Shift+Delete (Mac)
- Clear "Cookies and other site data" 
- Close and reopen browser

**Option B: Check Browser Network Tab**
1. Go to Network tab in DevTools
2. Reload page
3. Look for `supabase-js@2` script
4. If red/failed, the CDN didn't load
5. If successful, check the request headers for the next API call

**Option C: Check Config.js**
1. Open DevTools Console
2. Type: `window.SUPABASE_ANON_KEY`
3. Press Enter
4. You should see a long JWT token starting with `ey...`
5. If it says `undefined`, config.js didn't load

## Step 4: Manual Test

If basic test works, try manual signup:

```javascript
window.sb.auth.signUp({
  email: 'test@example.com',
  password: 'TestPassword123',
  options: {
    data: {
      full_name: 'Test User'
    }
  }
}).then(res => {
  console.log('SUCCESS:', res);
}).catch(err => {
  console.log('ERROR:', err);
  console.log('ERROR MESSAGE:', err.message);
});
```

## Step 5: Share Results

Once you've run `window.testSupabaseAuth()`, copy the console output and tell me:

1. Did getSession() succeed or fail?
2. What error message did you get?
3. Are the initial [Supabase] startup messages showing?
4. What does `window.SUPABASE_ANON_KEY` show?

## Most Common Fixes

### Fix 1: Browser Cache
- Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
- Clear all storage: DevTools → Application → Clear All

### Fix 2: Script Order
Check auth.html has this exact order:
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="js/config.js"></script>
<script src="js/supabase-init.js"></script>
<script src="js/auth.js"></script>
```

### Fix 3: Config.js
Verify js/config.js has:
```javascript
const SUPABASE_ANON_KEY = 'eyJh...'; // Should be a long string
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY; // Must be set on window
```

## Once You Have Results

After running the test, tell me:
1. All console output (copy-paste everything)
2. Does it say `✓ getSession() succeeded` or `✗ getSession() failed`?
3. What's the exact error message?

I'll then provide a targeted fix based on the actual error!

---

## Troubleshooting Tree

```
Is window.sb defined?
├─ NO → Config/Init script not loading
│   └─ Check script order, hard refresh, clear cache
│
└─ YES
   ├─ Does getSession() succeed?
   │  ├─ NO → API key not being sent
   │  │   └─ May need to reinitialize client
   │  │
   │  └─ YES → API key works! 
   │      └─ Register should work now
```

Try the test and let me know what you find!
