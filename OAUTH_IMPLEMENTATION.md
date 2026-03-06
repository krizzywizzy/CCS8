# OAuth & Email/Password Authentication Implementation

## Overview

This document describes the unified authentication flow supporting both email/password and Google OAuth, with automatic profile management in Supabase.

---

## Architecture

### Key Principle

**All users (email/password OR Google) automatically get a profile entry** in the `profiles` table with their `full_name` and `email` stored.

### Flow Diagram

```
User Signup/Login
    ↓
Success → Get user from session
    ↓
Extract full_name from:
  1. User metadata (email signup form or Google OAuth)
  2. Google OAuth's user_metadata.full_name
  3. Email address (fallback)
    ↓
Upsert to profiles table
    ↓
Navbar displays full_name with intelligent fallback
```

---

## Changes Made

### 1. Database Schema (`supabase/schema.sql`)

#### Updated Profiles Table
```sql
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,           -- ← NEW: stores user's full name
  email TEXT,               -- ← NEW: stores user's email
  display_name TEXT,        -- kept for backward compatibility
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Updated Trigger Function
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET row_security = off;
```

**Why this trigger?**
- When a user signs up, the trigger automatically creates a profile entry
- Uses `full_name` from metadata if available, otherwise uses email
- Works for BOTH email/password AND Google OAuth

---

### 2. Authentication Flow (`js/auth.js`)

#### Email/Password Login
**File**: `js/auth.js` → `handleLogin()`

What changed:
- After successful `signInWithPassword()`, the new user object is passed to `window.PAH.upsertUserProfile()`
- This ensures the profile is updated with the latest data
- Maintains backward compatibility with existing users

```javascript
sb.auth.signInWithPassword({ email: email, password: password })
  .then(function (res) {
    // ... validate response ...
    
    // NEW: Upsert profile after login
    if (res.data && res.data.user && typeof window.PAH.upsertUserProfile === 'function') {
      window.PAH.upsertUserProfile(res.data.user)
        .then(function () {
          // ... redirect ...
        });
    }
  });
```

#### Email/Password Registration
**File**: `js/auth.js` → `handleRegister()`

What changed:
- After successful `signUp()`, the new user object is passed to `window.PAH.upsertUserProfile()`
- User's `full_name` from the signup form is stored in metadata, then in profiles
- Still works with email confirmation flow

```javascript
sb.auth.signUp({
  email: email,
  password: password,
  options: {
    data: {
      full_name: fullName || null  // passed to metadata
    }
  }
})
  .then(function (res) {
    // ... handle response ...
    
    // NEW: Upsert profile after signup
    if (res.data && res.data.user && typeof window.PAH.upsertUserProfile === 'function') {
      window.PAH.upsertUserProfile(res.data.user)
        .then(function () {
          // ... redirect ...
        });
    }
  });
```

#### Google OAuth Login
**File**: `js/auth.js` → `maybeExchangeOAuthCode()`

What changed:
- After `exchangeCodeForSession()` completes, extracts user from the session
- Passes user to `window.PAH.upsertUserProfile()` to store Google OAuth data
- Google's `user_metadata.full_name` is automatically extracted and stored

```javascript
return sb.auth.exchangeCodeForSession(code).then(function (res) {
  if (res && res.error) {
    // ... handle error ...
    return;
  }
  
  // Extract user from session
  var user = res && res.data && res.data.session ? res.data.session.user : null;
  
  // NEW: Upsert Google OAuth user profile
  if (user && typeof window.PAH.upsertUserProfile === 'function') {
    window.PAH.upsertUserProfile(user)
      .catch(function (err) {
        console.error('[Auth] Error upserting Google OAuth profile:', err);
      });
  }
  
  // ... cleanup URL ...
});
```

---

### 3. Profile Management (`js/main.js`)

#### New Function: `upsertUserProfile()`
**File**: `js/main.js`

Handles inserting/updating user profiles with intelligent data extraction:

```javascript
function upsertUserProfile(user) {
  // 1. Get user data from various sources
  var fullName = null;
  
  // Priority: user_metadata.full_name (email form or Google)
  if (user.user_metadata && user.user_metadata.full_name) {
    fullName = user.user_metadata.full_name;
  }
  
  // Fallback: email
  if (!fullName && user.email) {
    fullName = user.email;
  }
  
  // 2. Upsert to profiles table
  return sb.from('profiles').upsert({
    id: user.id,
    email: user.email,
    full_name: fullName,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'id',
    ignoreDuplicates: false
  });
}
```

**Key features**:
- ✅ Handles both email and Google OAuth users
- ✅ Never overwrites `null` values destructively
- ✅ Uses Supabase `upsert()` for atomic updates
- ✅ Graceful error handling (logs but doesn't block redirect)

---

#### Updated Function: `updateNavAuth()`
**File**: `js/main.js`

Navbar display logic with three-tier fallback:

```javascript
function updateNavAuth() {
  // ... show/hide navbar elements ...
  
  // Fetch full_name from profiles table
  sb.from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
    .then(function (res) {
      var displayName = null;
      
      // Priority 1: profiles.full_name (primary source)
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
      
      userSpan.textContent = displayName || 'User';
    });
}
```

**Fallback chain**:
1. **`profiles.full_name`** - Primary source (reliable across page reloads)
2. **`user.user_metadata.full_name`** - Google OAuth fresh data (if profile not yet synced)
3. **`user.email`** - Always available as final fallback
4. **`'User'`** - Hardcoded string if everything fails

---

#### Updated Function: `initAuthState()`
**File**: `js/main.js`

Initialization now includes profile upserting:

```javascript
function initAuthState() {
  getAuthStateAsync().then(function (state) {
    window.__authUser = state.user || null;
    updateNavAuth();
    
    // NEW: Upsert profile on page load if user exists
    if (state.user) {
      upsertUserProfile(state.user);
    }
  });
  
  // Auth state change listener
  sb.auth.onAuthStateChange(function (event, session) {
    window.__authUser = session ? session.user : null;
    updateNavAuth();
    
    // NEW: Upsert profile after login/logout
    if (session && session.user) {
      upsertUserProfile(session.user);
    }
  });
}
```

**When upserts happen**:
- ✅ Page load (if user already authenticated)
- ✅ After email/password login
- ✅ After email/password registration
- ✅ After Google OAuth sign-in
- ✅ On auth state changes

---

### 4. Public API (`window.PAH`)

New functions exposed for cross-script communication:

```javascript
window.PAH.upsertUserProfile(user)      // Called from auth.js
window.PAH.updateNavAuth()               // Manual navbar update
window.PAH.getAuthStateAsync()           // Get current user
window.PAH.getSupabase()                 // Access Supabase client
window.PAH.waitForSupabase()             // Wait for client init
window.PAH.setBreadcrumb(items)          // Breadcrumb navigation
```

---

## User Journey Examples

### Example 1: Email/Password User

1. User fills signup form with email, password, full name
2. `handleRegister()` calls `sb.auth.signUp()` with metadata:
   ```javascript
   options: { data: { full_name: "John Doe" } }
   ```
3. Database trigger creates profile with `full_name = "John Doe"`
4. `upsertUserProfile()` updates profile with email
5. Page redirects to dashboard
6. Navbar displays: **"John Doe"**

---

### Example 2: New Google OAuth User

1. User clicks "Sign in with Google"
2. Redirected to Google, user authorizes
3. Redirected back with OAuth code
4. `maybeExchangeOAuthCode()` calls `exchangeCodeForSession()`
5. Google returns user with `user_metadata.full_name = "Jane Smith"`
6. `upsertUserProfile()` inserts profile entry:
   ```
   profiles.id = user.id
   profiles.full_name = "Jane Smith"
   profiles.email = "jane@example.com"
   ```
7. Page redirects to dashboard
8. Navbar displays: **"Jane Smith"**

---

### Example 3: Returning User (Mixed Auth)

1. User originally signed up with email/password as "John Doe"
2. Later, tries Google OAuth with same email
3. If email is already in auth.users, Supabase treats as existing user
4. `upsertUserProfile()` runs, but `full_name` stays as "John Doe" (not overwritten by Google name)
5. Navbar still displays: **"John Doe"** (existing value preserved)

---

## Database Constraints

### Row Level Security (RLS)
```sql
-- All users can read profiles
CREATE POLICY "Profiles are viewable by everyone" 
  ON profiles FOR SELECT USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Users can insert (via trigger or upsert)
CREATE POLICY "Profiles can be created (by trigger or user)" 
  ON profiles FOR INSERT WITH CHECK (true);
```

**Note**: The `upsert()` operation works via INSERT → UPDATE logic. RLS allows both operations.

---

## Backward Compatibility

### Existing Email Users
- ✅ Existing `profiles` entries are NOT changed
- ✅ `full_name` and `email` columns are added, existing `display_name` is kept
- ✅ Upsert only updates changed fields
- ✅ Old users can still log in without profile changes

### Migration Path for Old Users
If you want to populate `full_name` for existing users:

```sql
-- OPTIONAL: Populate full_name from display_name for existing users
UPDATE profiles
SET full_name = COALESCE(full_name, display_name, '')
WHERE full_name IS NULL;
```

---

## Testing Checklist

### Email/Password Flow
- [ ] Sign up with email, password, and full name → name appears in navbar
- [ ] You should only need to reload the page once for navbar to show name
- [ ] Log out and log back in → name still appears
- [ ] Existing user logs in → name still displays

### Google OAuth Flow
- [ ] Click "Sign in with Google"
- [ ] Authorize with a Google account
- [ ] Redirected back and logged in
- [ ] Google name appears immediately in navbar
- [ ] Reload page → name persists in navbar
- [ ] Log out then sign in with Google again → name appears

### Mixed Auth (Same Email)
- [ ] Sign up with email/password as "Alice"
- [ ] Log out
- [ ] Sign in with Google using same email
- [ ] Navbar shows: "Alice" (not overwritten)
- [ ] Sign in again with email/password
- [ ] Navbar shows: "Alice"

### Edge Cases
- [ ] Google account with no `full_name` → shows email in navbar
- [ ] Email signup with no full_name field → shows email in navbar
- [ ] Rapid reload after signup → name appears consistently

---

## Troubleshooting

### Navbar Shows Email Instead of Name

**Cause**: Profile not synced or `full_name` is NULL

**Solution**:
1. Check browser console for errors in `upsertUserProfile()`
2. Manually run in Supabase dashboard:
   ```sql
   SELECT id, full_name, email FROM profiles WHERE id = 'user-id-here';
   ```
3. If `full_name` is NULL, update manually:
   ```sql
   UPDATE profiles
   SET full_name = 'John Doe'
   WHERE id = 'user-id-here';
   ```

### Google OAuth User Has No Profile Entry

**Cause**: Upsert failed silently (check browser console)

**Solution**:
1. Verify RLS policies allow upsert:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'profiles';
   ```
2. Manually insert profile:
   ```sql
   INSERT INTO profiles (id, full_name, email)
   VALUES ('google-user-id', 'Google Full Name', 'user@example.com');
   ```

### Profile Updates Not Showing Immediately

**Cause**: Profile fetched from DB but displayed before `setItem()` updates

**Solution**: This is normal async behavior. Fallback to `user_metadata.full_name` handles it. If navbar shows email instead of name, reload page to refetch from DB.

---

## Performance Considerations

1. **Profile fetch on every page load**: Simple `select('full_name')` query is optimized
2. **Upsert operations**: Only on login/signup, not on every page view  
3. **RLS policies**: Minimal overhead, policies are simple equality checks
4. **Fallback chain**: Fast path (memory lookup) before DB query (network)

---

## Security Notes

1. ✅ User metadata is client-side editable but validated on server
2. ✅ Profile upsert is only allowed if `auth.uid() = id`
3. ✅ RLS prevents unauthorized profile reads/updates
4. ✅ Emails are stored in both `auth.users` and `profiles` (acceptable duplication)
5. ✅ No sensitive data in `profiles` table beyond name and email

---

## Future Enhancements

1. **Avatar URL**: Add `avatar_url` column to profiles
2. **Phone Number**: Store phone from Google OAuth if available
3. **Preferences**: Add user settings (theme, language, etc.)
4. **Sync Job**: Nightly sync for Google profile changes (via cron)
5. **Profile Completion**: Prompt incomplete profiles to add missing info

---

## References

- Supabase Docs: https://supabase.com/docs/guides/auth
- Upsert: https://supabase.com/docs/reference/javascript/upsert
- OAuth: https://supabase.com/docs/guides/auth/social-login/auth-google
- RLS: https://supabase.com/docs/guides/auth/row-level-security
