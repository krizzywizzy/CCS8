/**
 * Community Forum - Fully functional forum with posts, nested comments, and likes
 * Refactored to support two pages:
 * - forum.html: Directory listing of all posts
 * - post.html: Individual post with comments
 * Uses Supabase for auth and data storage
 * 
 * Features:
 * - Authentication-aware UI (hide/show forms based on login status)
 * - Create forum posts with author attribution
 * - Create nested comment replies (threaded discussion)
 * - Like posts and comments with live counter updates
 * - All data from Supabase with author names from profiles table
 */
(function () {
  'use strict';

  /**
   * Get Supabase client from window.sb (initialized in supabase-init.js)
   */
  function getSupabase() {
    if (typeof window.sb !== 'undefined' && window.sb && typeof window.sb.auth !== 'undefined') {
      return window.sb;
    }
    return null;
  }

  /**
   * Get current authenticated user from window.__authUser (set by main.js)
   */
  function getUser() {
    return window.__authUser || null;
  }

  /**
   * Detect which page we're on
   * @returns 'forum' for forum.html, 'post' for post.html
   */
  function getCurrentPage() {
    var pathname = window.location.pathname;
    if (pathname.indexOf('post.html') !== -1) {
      return 'post';
    }
    return 'forum';
  }

  /**
   * Get the post ID from URL query parameter (for post.html)
   * @returns post ID or null
   */
  function getPostIdFromUrl() {
    var params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  /**
   * Resolve and cache the current user's profile (profiles.id) from auth user id
   * Stores result in window.currentProfile or null
   */
  function resolveCurrentProfile() {
    var sb = getSupabase();
    var user = getUser();
    if (!sb || !user) {
      window.currentProfile = null;
      return Promise.resolve(null);
    }

    return sb.from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(function (res) {
        if (res.error) {
          console.error('[Forum] Error resolving profile:', res.error);
          window.currentProfile = null;
          return null;
        }
        window.currentProfile = res.data || null;
        return window.currentProfile;
      })
      .catch(function (err) {
        console.error('[Forum] Error resolving profile:', err);
        window.currentProfile = null;
        return null;
      });
  }

  /**
   * Delete a post (owner only)
   */
  function deletePost(postId) {
    var profile = window.currentProfile || null;
    var sb = getSupabase();

    console.log("🔥 [STEP 1] deletePost triggered for ID:", postId);
    console.log("🔥 [STEP 2] Current profile:", profile);

    if (!profile || !sb) {
      showLoginModal();
      return;
    }

    showConfirmModal('Are you sure you want to delete this post? This cannot be undone.', function () {
      console.log("🔥 [STEP 3] Confirm modal OK clicked! Deleting post and related data...");
      (async function () {
        try {
          // First: fetch any comments for this post so we can remove comment likes
          var commentIds = [];
          var commentsRes = await sb.from('forum_comments').select('id').eq('post_id', postId);
          if (commentsRes.error) {
            console.error('[Forum] Error fetching comments for cleanup:', commentsRes.error);
            showErrorModal('Error deleting post. Please try again.');
            return;
          }
          (commentsRes.data || []).forEach(function (c) { if (c && c.id) commentIds.push(c.id); });

          // Delete comment likes for those comments (if any)
          if (commentIds.length) {
            var delCommentLikes = await sb.from('forum_comment_likes').delete().in('comment_id', commentIds);
            if (delCommentLikes.error) {
              console.warn('[Forum] Warning deleting comment likes:', delCommentLikes.error);
            }
          }

          // Delete the comments themselves
          var delComments = await sb.from('forum_comments').delete().eq('post_id', postId);
          if (delComments.error) {
            console.error('[Forum] Error deleting comments for post:', delComments.error);
            showErrorModal('Error deleting post comments. Please try again.');
            return;
          }

          // Delete any post likes
          var delPostLikes = await sb.from('forum_post_likes').delete().eq('post_id', postId);
          if (delPostLikes.error) {
            console.warn('[Forum] Warning deleting post likes:', delPostLikes.error);
          }

          // Finally delete the post (owner check)
          var delPost = await sb.from('forum_posts').delete().eq('id', postId).eq('user_id', profile.id);
          console.log('🔥 [STEP 4] delete post response:', delPost);
          if (delPost.error) {
            console.error('[Forum] Error deleting post:', delPost.error);
            showErrorModal('Error deleting post: ' + (delPost.error.message || 'Unknown error'));
            return;
          }

          console.log('[Forum] Post deleted:', postId);
          showSuccessModal('Post deleted successfully.');

          // update UI depending on which page we're on
          if (getCurrentPage() === 'post') {
            // when viewing a single post, go back to directory after a short delay
            setTimeout(function () {
              window.location.href = 'forum.html';
            }, 1500);
          } else {
            // on the directory page, refresh the list immediately so the card disappears
            loadPostsForDirectory();
          }
        } catch (err) {
          console.error('[Forum] Error deleting post:', err);
          showErrorModal('Error deleting post. Please try again.');
        }
      })();
    });
  }

  /**
   * Delete a comment (owner only)
   */
  function deleteComment(commentId, postId) {
    var profile = window.currentProfile || null;
    var sb = getSupabase();

    if (!profile || !sb) {
      showLoginModal();
      return;
    }

    showConfirmModal('Are you sure you want to delete this comment? This cannot be undone.', function () {
      (async function () {
        try {
          // Remove likes for the comment first
          var delLikes = await sb.from('forum_comment_likes').delete().eq('comment_id', commentId);
          if (delLikes.error) {
            console.warn('[Forum] Warning deleting comment likes:', delLikes.error);
          }

          // Delete the comment (owner check)
          var del = await sb.from('forum_comments').delete().eq('id', commentId).eq('user_id', profile.id);
          if (del.error) {
            console.error('[Forum] Error deleting comment:', del.error);
            showErrorModal('Error deleting comment: ' + (del.error.message || 'Unknown error'));
            return;
          }

          console.log('[Forum] Comment deleted:', commentId);
          // Remove comment element from DOM
          var commentEl = document.querySelector('.forum-comment[data-comment-id="' + commentId + '"]');
          if (commentEl && commentEl.parentNode) commentEl.parentNode.removeChild(commentEl);

          // decrease comment count in header if present
          var countHeader = document.querySelector('#forum-post-comments h2');
          if (countHeader) {
            var match = countHeader.textContent.match(/Comments \((\d+)\)/);
            if (match) {
              var num = parseInt(match[1], 10) - 1;
              countHeader.textContent = 'Comments (' + (num >= 0 ? num : 0) + ')';
            }
          }

          showSuccessModal('Comment deleted successfully.');
        } catch (err) {
          console.error('[Forum] Error deleting comment:', err);
          showErrorModal('Error deleting comment. Please try again.');
        }
      })();
    });
  }

  /**
   * Show login modal
   */
  function showLoginModal() {
    var modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * Hide login modal
   */
  function hideLoginModal() {
    var modal = document.getElementById('login-modal');
    if (modal) {
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * Attach modal event listeners (close button, overlay click)
   */
  function attachModalListeners() {
    var modal = document.getElementById('login-modal');
    if (!modal) return;

    var overlay = modal.querySelector('.modal-overlay');
    var closeButtons = modal.querySelectorAll('[data-dismiss="modal"]');

    // Close on overlay click
    if (overlay) {
      overlay.addEventListener('click', function () {
        hideLoginModal();
      });
    }

    // Close on button click
    closeButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        hideLoginModal();
      });
    });
  }

  /**
   * Confirm modal helpers
   */
  var _confirmCallback = null;
  var _activeModal = null;
  var _previousActive = null;

  function trapFocus(modal) {
    if (!modal) return;
    _activeModal = modal;
    _previousActive = document.activeElement;
    var focusable = modal.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
    focusable = Array.prototype.slice.call(focusable).filter(function (el) { return el.offsetParent !== null; });
    if (focusable.length) focusable[0].focus();

    function handleKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        hideConfirmModal();
      }
      if (e.key === 'Tab') {
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    modal.__focusHandler = handleKey;
    document.addEventListener('keydown', handleKey);
  }

  function releaseFocus(modal) {
    if (!modal || !modal.__focusHandler) return;
    document.removeEventListener('keydown', modal.__focusHandler);
    modal.__focusHandler = null;
    _activeModal = null;
    if (_previousActive && typeof _previousActive.focus === 'function') _previousActive.focus();
    _previousActive = null;
  }

  function showConfirmModal(message, onConfirm) {
    var modal = document.getElementById('confirm-modal');
    var msg = document.getElementById('confirm-modal-message');
    var ok = document.getElementById('confirm-modal-ok');
    if (!modal) return;
    if (msg) msg.textContent = message || 'Are you sure?';
    _confirmCallback = typeof onConfirm === 'function' ? onConfirm : null;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    trapFocus(modal);
    if (ok) ok.focus();
  }

  function hideConfirmModal() {
    var modal = document.getElementById('confirm-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    _confirmCallback = null;
    releaseFocus(modal);
  }

  function attachConfirmModalListeners() {
    var modal = document.getElementById('confirm-modal');
    if (!modal) return;
    var overlay = modal.querySelector('.modal-overlay');
    var cancelBtns = modal.querySelectorAll('[data-dismiss-confirm]');
    var ok = document.getElementById('confirm-modal-ok');
    if (overlay) overlay.addEventListener('click', hideConfirmModal);
    cancelBtns.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); hideConfirmModal(); }); });
    if (ok) ok.addEventListener('click', function (e) {
      e.preventDefault();

      // Save callback before hiding the modal so it isn't cleared.
      var savedCallback = _confirmCallback;

      hideConfirmModal();

      if (savedCallback) {
        try { savedCallback(); } catch (err) { console.error('[Forum] confirm callback error', err); }
      }
    });
  }

  /**
   * Success modal helpers
   */
  function showSuccessModal(message) {
    var modal = document.getElementById('success-modal');
    var msg = document.getElementById('success-modal-message');
    if (!modal) return;
    if (msg) msg.textContent = message || 'Action completed successfully.';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function hideSuccessModal() {
    var modal = document.getElementById('success-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function attachSuccessModalListeners() {
    var modal = document.getElementById('success-modal');
    if (!modal) return;
    var overlay = modal.querySelector('.modal-overlay');
    var closeBtns = modal.querySelectorAll('[data-dismiss-success]');
    if (overlay) overlay.addEventListener('click', hideSuccessModal);
    closeBtns.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); hideSuccessModal(); }); });
    // auto-close after 2s when shown
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName === 'class') {
          if (modal.classList.contains('active')) {
            setTimeout(function () { hideSuccessModal(); }, 2000);
          }
        }
      });
    });
    observer.observe(modal, { attributes: true });
  }

  /** Error modal helpers */
  function showErrorModal(message) {
    var modal = document.getElementById('error-modal');
    var msg = document.getElementById('error-modal-message');
    if (!modal) return;
    if (msg) msg.textContent = message || 'An error occurred.';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function hideErrorModal() {
    var modal = document.getElementById('error-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  }

  function attachErrorModalListeners() {
    var modal = document.getElementById('error-modal');
    if (!modal) return;
    var overlay = modal.querySelector('.modal-overlay');
    var closeBtns = modal.querySelectorAll('[data-dismiss-error]');
    if (overlay) overlay.addEventListener('click', hideErrorModal);
    closeBtns.forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); hideErrorModal(); }); });
  }

  /**
   * Fetch which posts/comments the current user has liked
   * Returns object mapping post/comment ID to true if liked
   */
  function fetchUserLikes() {
    var profile = window.currentProfile || null;
    var sb = getSupabase();
    
    if (!profile || !sb) {
      return Promise.resolve({ posts: {}, comments: {} });
    }

    // Fetch user's post likes
    var postLikesPromise = sb.from('forum_post_likes')
      .select('post_id')
      .eq('user_id', profile.id)
      .then(function (res) {
        var likes = {};
        if (res.data) {
          res.data.forEach(function (row) {
            likes[row.post_id] = true;
          });
        }
        return likes;
      })
      .catch(function (err) {
        console.error('[Forum] Error fetching post likes:', err);
        return {};
      });

    // Fetch user's comment likes
    var commentLikesPromise = sb.from('forum_comment_likes')
      .select('comment_id')
      .eq('user_id', profile.id)
      .then(function (res) {
        var likes = {};
        if (res.data) {
          res.data.forEach(function (row) {
            likes[row.comment_id] = true;
          });
        }
        return likes;
      })
      .catch(function (err) {
        console.error('[Forum] Error fetching comment likes:', err);
        return {};
      });

    return Promise.all([postLikesPromise, commentLikesPromise])
      .then(function (results) {
        return { posts: results[0], comments: results[1] };
      });
  }

  /**
   * Store user's likes in memory for quick checking
   */
  var userLikesCache = { posts: {}, comments: {} };

  function toggleLike(targetType, targetId, btn) {
    var profile = window.currentProfile || null;
    var sb = getSupabase();
    var countSpan = btn.querySelector('.like-count');

    if (!profile) {
      showLoginModal();
      return;
    }

    if (!sb) {
      showErrorModal('Forum not available.');
      return;
    }

    btn.disabled = true;
    var isLiked = btn.classList.contains('liked');
    var likesTable = targetType === 'post' ? 'forum_post_likes' : 'forum_comment_likes';
    var itemIdField = targetType === 'post' ? 'post_id' : 'comment_id';

    if (isLiked) {
      // Unlike: delete the like row
      var deleteFilter = {};
      deleteFilter[itemIdField] = targetId;

      sb.from(likesTable)
        .delete()
        .eq('user_id', profile.id)
        .eq(itemIdField, targetId)
        .then(function (res) {
          if (res.error) {
            console.error('[Forum] Error unliking:', res.error);
            showErrorModal('Could not unlike. Please try again.');
            btn.disabled = false;
            return;
          }

          // Update cache
          var cacheType = targetType === 'post' ? 'posts' : 'comments';
          delete userLikesCache[cacheType][targetId];

          // Update UI
          var currentCount = parseInt(countSpan.textContent) || 0;
          var newCount = Math.max(0, currentCount - 1);
          countSpan.textContent = newCount;
          btn.classList.remove('liked');
          btn.disabled = false;
          console.log('[Forum] Unliked', targetType, targetId);
        })
        .catch(function (err) {
          console.error('[Forum] Error unliking:', err);
          showErrorModal('Error unliking. Please try again.');
          btn.disabled = false;
        });
    } else {
      // Like: insert or ignore if already exists (UNIQUE constraint prevents duplicates)
      var insertData = { user_id: profile.id };
      insertData[itemIdField] = targetId;

      sb.from(likesTable)
        .insert([insertData])
        .then(function (res) {
            if (res.error) {
            // If it's a duplicate key error, user already liked it
            if (res.error.code === '23505') {
              console.log('[Forum] Already liked this', targetType);
              btn.classList.add('liked');
              btn.disabled = false;
              return;
            }
            console.error('[Forum] Error liking:', res.error);
            showErrorModal('Could not like. Please try again.');
            btn.disabled = false;
            return;
          }

          // Update cache
          var cacheType = targetType === 'post' ? 'posts' : 'comments';
          userLikesCache[cacheType][targetId] = true;

          // Update UI
          var currentCount = parseInt(countSpan.textContent) || 0;
          var newCount = currentCount + 1;
          countSpan.textContent = newCount;
          btn.classList.add('liked');
          btn.disabled = false;
          console.log('[Forum] Liked', targetType, targetId);
        })
        .catch(function (err) {
          console.error('[Forum] Error liking:', err);
          showErrorModal('Error liking. Please try again.');
          btn.disabled = false;
        });
    }
  }

  /**
   * Escape HTML to prevent XSS attacks
   */
  function escapeHtml(str) {
    if (!str) return '';
    var map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(str).replace(/[&<>"']/g, function (c) { return map[c]; });
  }

  /**
   * Format timestamp for display (relative time)
   */
  function formatDate(timestamp) {
    if (!timestamp) return '';
    var date = new Date(timestamp);
    var now = new Date();
    var diff = now - date;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) {
      var mins = Math.floor(diff / 60000);
      return mins + 'm ago';
    }
    if (diff < 86400000) {
      var hours = Math.floor(diff / 3600000);
      return hours + 'h ago';
    }
    if (diff < 604800000) {
      var days = Math.floor(diff / 86400000);
      return days + 'd ago';
    }
    return date.toLocaleDateString();
  }

  /**
   * Fetch author names map from profiles table
   */
  function fetchAuthorMap(userIds) {
    var sb = getSupabase();
    if (!sb || !userIds.length) return Promise.resolve({});
    
    return sb.from('profiles')
      .select('id, full_name')
      .in('id', userIds)
      .then(function (res) {
        var map = {};
        if (res.data) {
          res.data.forEach(function (profile) {
            map[profile.id] = profile.full_name || profile.id;
          });
        }
        return map;
      })
      .catch(function (err) {
        console.error('[Forum] Error fetching author map:', err);
        return {};
      });
  }

  /**
   * Fetch all comments for a post
   */
  function fetchComments(postId) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve([]);
    
    return sb.from('forum_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(function (res) {
        return res.data || [];
      })
      .catch(function (err) {
        console.error('[Forum] Error fetching comments:', err);
        return [];
      });
  }

  /**
   * Fetch a single post by ID
   */
  function fetchPost(postId) {
    var sb = getSupabase();
    if (!sb) return Promise.resolve(null);
    
    return sb.from('forum_posts')
      .select('*')
      .eq('id', postId)
      .single()
      .then(function (res) {
        if (res.error) {
          console.error('[Forum] Error fetching post:', res.error);
          return null;
        }
        return res.data || null;
      })
      .catch(function (err) {
        console.error('[Forum] Error fetching post:', err);
        return null;
      });
  }

  /**
   * Render comment HTML (flat, no nesting)
   */
  function buildCommentList(comments) {
    return comments.map(function (c) {
      return { comment: c, replies: [] };
    });
  }

  function renderCommentHTML(commentNode, authorMap) {
    var c = commentNode.comment;
    var profile = window.currentProfile || null;
    var author = authorMap[c.user_id] || c.user_id || 'Anonymous';
    var isOwner = profile && profile.id === c.user_id;
    
    var html = (
      '<div class="forum-comment" data-comment-id="' + escapeHtml(c.id) + '" data-post-id="' + escapeHtml(c.post_id) + '" data-user-id="' + escapeHtml(c.user_id) + '">' +
      '  <div class="comment-header">' +
      '    <div>' +
      '      <strong class="comment-author">' + escapeHtml(author) + '</strong>' +
      '      <span class="comment-time">' + formatDate(c.created_at) + '</span>' +
      '    </div>' +
      (isOwner ? (
        '    <button type="button" class="kebab-btn" aria-expanded="false" aria-haspopup="menu" aria-label="Options for comment by ' + author + '">' +
        '      <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '        <circle cx="2" cy="2" r="2"/>' +
        '        <circle cx="2" cy="8" r="2"/>' +
        '        <circle cx="2" cy="14" r="2"/>' +
        '      </svg>' +
        '    </button>' +
        '    <div class="kebab-menu" role="menu" hidden>' +
        '      <button type="button" class="kebab-menu-item kebab-menu-danger" role="menuitem" data-action="delete-comment" data-comment-id="' + escapeHtml(c.id) + '" data-post-id="' + escapeHtml(c.post_id) + '">Delete</button>' +
        '    </div>'
      ) : '') +
      '  </div>' +
      '  <div class="comment-body">' + escapeHtml(c.content) + '</div>' +
      '  <div class="comment-actions">' +
      '    <button type="button" class="btn-like-comment" data-comment-id="' + escapeHtml(c.id) + '" data-target-type="comment">' +
      '      ♥ <span class="like-count">' + (c.likes || 0) + '</span>' +
      '    </button>' +
      '  </div>' +
      '</div>'
    );
    
    return html;
  }

  /**
   * ============================================================================
   * FORUM.HTML PAGE - Directory listing
   * ============================================================================
   */

  /**
   * Load and render all posts for forum.html (directory listing)
   */
  function loadPostsForDirectory() {
    var sb = getSupabase();
    var container = document.getElementById('forum-posts');
    if (!container) return;

    if (!sb) {
      // Supabase client not available yet; retry after a brief delay
      if (window.PAH && typeof window.PAH.waitForSupabase === 'function') {
        window.PAH.waitForSupabase(3000).then(function () {
          loadPostsForDirectory();
        }).catch(function () {
          container.innerHTML = '<p class="alert alert-error">Forum not available.</p>';
        });
        return;
      }

      container.innerHTML = '<p class="alert alert-error">Forum not available.</p>';
      return;
    }

    container.innerHTML = '<p class="alert alert-info">Loading posts…</p>';

    sb.from('forum_posts')
      .select('*')
      .order('created_at', { ascending: false })
      .then(function (res) {
        if (res.error) {
          console.error('[Forum] Error fetching posts:', res.error);
          container.innerHTML = '<p class="alert alert-error">Could not load posts.</p>';
          return;
        }

        var posts = res.data || [];
        
        if (!posts.length) {
          container.innerHTML = '<p class="alert alert-info">No posts yet. Create the first one!</p>';
          return;
        }

        var userIds = [];
        posts.forEach(function (p) {
          if (p.user_id && userIds.indexOf(p.user_id) === -1) {
            userIds.push(p.user_id);
          }
        });

        fetchAuthorMap(userIds).then(function (authorMap) {
          // Fetch comment counts for each post
          var commentCountPromises = posts.map(function (post) {
            return sb.from('forum_comments')
              .select('id', { count: 'exact' })
              .eq('post_id', post.id)
              .then(function (res) {
                post._commentCount = res.count || 0;
                return post;
              });
          });

          Promise.all(commentCountPromises).then(function (postsWithCounts) {
            renderPostsForDirectory(container, postsWithCounts, authorMap);
          });
        });
      })
      .catch(function (err) {
        console.error('[Forum] Error loading posts:', err);
        container.innerHTML = '<p class="alert alert-error">Error loading forum.</p>';
      });
  }

  /**
   * Render all posts as directory list (forum.html) - Professional light theme
   */
  function renderPostsForDirectory(container, posts, authorMap) {
    var profile = window.currentProfile || null;
    var html = '';
    
    posts.forEach(function (post) {
      var author = authorMap[post.user_id] || post.user_id || 'Anonymous';
      var isOwner = profile && profile.id === post.user_id;
      var postLink = 'post.html?id=' + encodeURIComponent(post.id);
      var preview = escapeHtml(post.content.substring(0, 100)) + (post.content.length > 100 ? '...' : '');
      var comments = post._commentCount || 0;
      var postTitle = escapeHtml(post.title);
      
        html += (
            '<article class="forum-post-card" data-post-id="' + escapeHtml(post.id) + '" data-user-id="' + escapeHtml(post.user_id) + '">' +
            '  <div class="forum-card-content">' +
            '    <div class="post-header">' +
            '      <h3 class="forum-card-title"><a href="' + postLink + '" class="post-link">' + postTitle + '</a></h3>' +
            '      <button type="button" class="kebab-btn" aria-expanded="false" aria-haspopup="menu" aria-label="Options for post: ' + postTitle + '">' +
            '        <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
            '          <circle cx="2" cy="2" r="2"/>' +
            '          <circle cx="2" cy="8" r="2"/>' +
            '          <circle cx="2" cy="14" r="2"/>' +
            '        </svg>' +
            '      </button>' +
            '      <div class="kebab-menu" role="menu" hidden>' +
            '        <button type="button" class="kebab-menu-item" role="menuitem" data-action="view" data-post-id="' + escapeHtml(post.id) + '">View</button>' +
            (isOwner ? '        <button type="button" class="kebab-menu-item kebab-menu-danger" role="menuitem" data-action="delete" data-post-id="' + escapeHtml(post.id) + '">Delete</button>' : '') +
            '      </div>' +
            '    </div>' +
            '    <p class="forum-card-preview">' + preview + '</p>' +
            '    <div class="post-author-meta">' +
            '      <span class="meta-author">' + escapeHtml(author) + '</span>' +
            '      <span class="meta-sep"> &middot; </span>' +
            '      <span class="meta-date">' + formatDate(post.created_at) + '</span>' +
            '    </div>' +
            '  </div>' +
            '  <div class="forum-card-right">' +
            '    <div class="forum-card-stat">' +
            '      <span class="stat-label">Comments</span>' +
            '      <span class="stat-value">' + comments + '</span>' +
            '    </div>' +
            '  </div>' +
            '</article>'
          );
    });
    
    container.innerHTML = html;

    // Attach event listeners
    attachEventListenersForDirectory();
  }

  /**
   * Attach event listeners for directory page (forum.html)
   */
  function attachEventListenersForDirectory() {
    // Kebab menu functionality
    document.querySelectorAll('.kebab-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = btn.nextElementSibling;
        if (!menu || !menu.classList.contains('kebab-menu')) return;
        
        var isOpen = !btn.getAttribute('aria-expanded') || btn.getAttribute('aria-expanded') === 'false';
        btn.setAttribute('aria-expanded', isOpen);
        menu.hidden = !isOpen;
        
        if (isOpen) {
          // reposition menu under this button (cards can be tall)
          var parent = btn.offsetParent;
          if (parent) {
            menu.style.top = (btn.offsetTop + btn.offsetHeight + 4) + 'px';
            menu.style.right = '0.5rem';
          }

          // Close other open menus
          document.querySelectorAll('.kebab-menu:not([hidden])').forEach(function (m) {
            if (m !== menu) {
              m.hidden = true;
              // clear any inline positioning so it will be recalculated next time
              m.style.top = '';
              m.style.right = '';
              var otherBtn = m.previousElementSibling;
              if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
            }
          });
        }
      });
    });

    // Close kebab menu when clicking outside
    document.addEventListener('click', function (e) {
      var clickedKebab = e.target.closest('.kebab-btn');
      var clickedMenu = e.target.closest('.kebab-menu');
      
      if (!clickedKebab && !clickedMenu) {
        document.querySelectorAll('.kebab-menu:not([hidden])').forEach(function (menu) {
          menu.hidden = true;
          var btn = menu.previousElementSibling;
          if (btn && btn.classList.contains('kebab-btn')) {
            btn.setAttribute('aria-expanded', 'false');
          }
        });
      }
    });

    // Handle escape key in kebab menu
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) {
        var openMenu = document.querySelector('.kebab-menu:not([hidden])');
        if (openMenu) {
          openMenu.hidden = true;
          var btn = openMenu.previousElementSibling;
          if (btn && btn.classList.contains('kebab-btn')) {
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
          }
        }
      }
    });

    // Kebab menu item clicks
    document.querySelectorAll('.kebab-menu-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var action = item.getAttribute('data-action');
        var postId = item.getAttribute('data-post-id');
        var menu = item.closest('.kebab-menu');
        
        // Close menu
        if (menu) {
          menu.hidden = true;
          var btn = menu.previousElementSibling;
          if (btn && btn.classList.contains('kebab-btn')) {
            btn.setAttribute('aria-expanded', 'false');
          }
        }
        
        if (action === 'view') {
          window.location.href = 'post.html?id=' + encodeURIComponent(postId);
        } else if (action === 'delete') {
          deletePost(postId);
        }
      });
    });

    // Click on post card to navigate to post
    document.querySelectorAll('.forum-post-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        // Don't navigate if clicking on kebab button or menu
        if (e.target.closest('.kebab-btn') || e.target.closest('.kebab-menu')) {
          return;
        }
        var postId = card.getAttribute('data-post-id');
        if (postId) {
          window.location.href = 'post.html?id=' + encodeURIComponent(postId);
        }
      });
      card.style.cursor = 'pointer';
    });
  }

  /**
   * Initialize forum.html (directory page)
   */
  function initForumPage() {
    console.log('[Forum] Initializing forum.html (directory page)');
    
    var user = getUser();
    var newPostSection = document.getElementById('new-post-section');
    var createPostBtn = document.getElementById('create-post-btn');
    var createPrompt = document.getElementById('create-post-prompt');
    var cancelPostBtn = document.getElementById('cancel-post-btn');
    var closeModalBtn = document.getElementById('close-post-modal');
    var modalOverlay = document.getElementById('forum-modal-overlay');
    
    // Adjust visibility based on auth (show/hide every time init runs)
    if (user) {
      if (createPostBtn) createPostBtn.style.display = '';
      if (createPrompt) createPrompt.style.display = 'none';
    } else {
      if (createPostBtn) createPostBtn.style.display = 'none';
      if (createPrompt) createPrompt.style.display = 'inline-block';
    }

    // Open modal when Create Post button clicked
    if (createPostBtn) {
      createPostBtn.addEventListener('click', function() {
        if (!getUser()) {
          showLoginModal();
          return;
        }
        if (newPostSection) {
          newPostSection.style.display = 'flex';
        }
      });
    }
    
    // Close modal when Cancel button clicked
    if (cancelPostBtn) {
      cancelPostBtn.addEventListener('click', function() {
        if (newPostSection) {
          newPostSection.style.display = 'none';
        }
      });
    }
    
    // Close modal when close button clicked
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', function() {
        if (newPostSection) {
          newPostSection.style.display = 'none';
        }
      });
    }
    
    // Close modal when clicking overlay
    if (modalOverlay) {
      modalOverlay.addEventListener('click', function() {
        if (newPostSection) {
          newPostSection.style.display = 'none';
        }
      });
    }
    
    // Close modal when clicking outside (ESC key support)
    if (newPostSection) {
      newPostSection.addEventListener('click', function(e) {
        if (e.target === newPostSection || e.target === modalOverlay) {
          newPostSection.style.display = 'none';
        }
      });
    }

    // Resolve the current user's profiles.id before loading posts
    resolveCurrentProfile().then(function () {
      loadPostsForDirectory();
    }).catch(function (err) {
      console.error('[Forum] Error resolving profile:', err);
      loadPostsForDirectory();
    });

    var form = document.getElementById('new-post-form');
    if (form) {
      form.onsubmit = function (e) {
        e.preventDefault();

        var user = getUser();
        if (!user) {
          showLoginModal();
          return;
        }

        var titleInput = form.querySelector('[name="title"]');
        var contentInput = form.querySelector('[name="content"]');
        var title = titleInput.value.trim();
        var content = contentInput.value.trim();

        if (!title || !content) {
          showErrorModal('Please enter both title and content.');
          return;
        }

        var sb = getSupabase();
        if (!sb) {
          showErrorModal('Forum not available.');
          return;
        }

        sb.from('forum_posts')
          .insert({
            user_id: user.id,
            title: title,
            content: content,
            likes: 0
          })
          .then(function (res) {
            if (res.error) {
              showErrorModal('Failed to create post: ' + (res.error.message || 'Unknown error'));
              return;
            }
            titleInput.value = '';
            contentInput.value = '';
            if (newPostSection) newPostSection.style.display = 'none';
            loadPostsForDirectory();
          });
      };
    }
  }

  /**
   * ============================================================================
   * POST.HTML PAGE - Individual post with comments
   * ============================================================================
   */

  /**
   * Load and render a single post with comments for post.html
   */
  function loadPostDetail() {
    var postId = getPostIdFromUrl();
    if (!postId) {
      var detail = document.getElementById('forum-post-detail');
      if (detail) detail.innerHTML = '<p class="alert alert-error">No post ID provided.</p>';
      return;
    }

    var sb = getSupabase();
    if (!sb) {
      if (window.PAH && typeof window.PAH.waitForSupabase === 'function') {
        window.PAH.waitForSupabase(3000).then(function () {
          loadPostDetail();
        }).catch(function () {
          var detail = document.getElementById('forum-post-detail');
          if (detail) detail.innerHTML = '<p class="alert alert-error">Forum not available.</p>';
        });
        return;
      }
      var detail = document.getElementById('forum-post-detail');
      if (detail) detail.innerHTML = '<p class="alert alert-error">Forum not available.</p>';
      return;
    }

    var detail = document.getElementById('forum-post-detail');
    if (detail) detail.innerHTML = '<p class="alert alert-info">Loading post…</p>';

    fetchPost(postId).then(function (post) {
      if (!post) {
        if (detail) detail.innerHTML = '<p class="alert alert-error">Post not found.</p>';
        return;
      }

      var userIds = [post.user_id];
      fetchAuthorMap(userIds).then(function (authorMap) {
        renderPostDetail(post, authorMap);
        loadAndRenderCommentsForPost(postId, authorMap);
      });
    });
  }

  /**
   * Render a single post (post.html)
   */
  function renderPostDetail(post, authorMap) {
    var profile = window.currentProfile || null;
    var author = authorMap[post.user_id] || post.user_id || 'Anonymous';
    // compare as strings to avoid type mismatches
    var isOwner = profile && String(profile.id) === String(post.user_id);
    console.log('[Forum] renderPostDetail owner check', { profileId: profile && profile.id, postUserId: post.user_id, isOwner: isOwner });
    var detail = document.getElementById('forum-post-detail');

    if (!detail) return;

    var postTitle = escapeHtml(post.title);
    var html = (
      '<div class="post-detail">' +
      '  <div class="post-header-detail">' +
      '    <div>' +
      '      <h1 class="post-title">' + postTitle + '</h1>' +
      '      <div class="post-meta">By <strong>' + escapeHtml(author) + '</strong> · ' + formatDate(post.created_at) + '</div>' +
      '    </div>' +
      (isOwner ? (
        '    <button type="button" class="kebab-btn" aria-expanded="false" aria-haspopup="menu" aria-label="Options for post: ' + postTitle + '">' +
        '      <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">' +
        '        <circle cx="2" cy="2" r="2"/>' +
        '        <circle cx="2" cy="8" r="2"/>' +
        '        <circle cx="2" cy="14" r="2"/>' +
        '      </svg>' +
        '    </button>' +
        '    <div class="kebab-menu" role="menu" hidden>' +
        '      <button type="button" class="kebab-menu-item kebab-menu-danger" role="menuitem" data-action="delete" data-post-id="' + escapeHtml(post.id) + '">Delete Post</button>' +
        '    </div>'
      ) : '') +
      '  </div>' +
      '  <div class="post-body">' + escapeHtml(post.content) + '</div>' +
      '  <div class="post-actions">' +
      '    <button type="button" class="btn-like-post" data-post-id="' + escapeHtml(post.id) + '" data-target-type="post">' +
      '      ♥ <span class="like-count">' + (post.likes || 0) + '</span>' +
      '    </button>' +
      '  </div>' +
      '</div>'
    );

    detail.innerHTML = html;
    
    // Attach like button listener
    fetchUserLikes().then(function (likes) {
      userLikesCache = likes;
      attachEventListenersForPostDetail();
    }).catch(function (err) {
      console.error('[Forum] Error loading user likes:', err);
      attachEventListenersForPostDetail();
    });
  }

  /**
   * Load and render comments for post.html
   */
  function loadAndRenderCommentsForPost(postId, authorMap) {
    fetchComments(postId).then(function (comments) {
      var toFetch = comments.map(function (c) { return c.user_id; })
        .filter(function (id, idx, arr) { return arr.indexOf(id) === idx && !authorMap[id]; });
      
      if (toFetch.length) {
        fetchAuthorMap(toFetch).then(function (newMap) {
          var combined = Object.assign({}, authorMap, newMap);
          renderCommentsForPost(postId, comments, combined);
        });
      } else {
        renderCommentsForPost(postId, comments, authorMap);
      }
    });
  }

  /**
   * Render comments for post.html
   */
  function renderCommentsForPost(postId, comments, authorMap) {
    var container = document.getElementById('forum-post-comments');
    if (!container) return;

    var html = '<div class="post-comments-section"><h2>Comments (' + comments.length + ')</h2>';

    if (!comments.length) {
      html += '<p class="alert alert-info">No comments yet. Be the first!</p>';
    } else {
      var list = buildCommentList(comments);
      list.forEach(function (node) {
        html += renderCommentHTML(node, authorMap);
      });
    }

    html += '</div>';
    container.innerHTML = html;
    attachEventListenersForPostDetail();
  }

  /**
   * Attach event listeners for post detail page (post.html)
   */
  function attachEventListenersForPostDetail() {
    var user = getUser();
    var sb = getSupabase();

    // Like post button
    document.querySelectorAll('.btn-like-post').forEach(function (btn) {
      var postId = btn.getAttribute('data-post-id');
      if (userLikesCache.posts[postId]) {
        btn.classList.add('liked');
      }
      
      btn.onclick = function (e) {
        e.preventDefault();
        toggleLike('post', postId, btn);
      };
    });

    // Like comment buttons
    document.querySelectorAll('.btn-like-comment').forEach(function (btn) {
      var commentId = btn.getAttribute('data-comment-id');
      if (userLikesCache.comments[commentId]) {
        btn.classList.add('liked');
      }
      
      btn.onclick = function (e) {
        e.preventDefault();
        toggleLike('comment', commentId, btn);
      };
    });

    // Kebab menu functionality for post detail
    document.querySelectorAll('.kebab-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menu = btn.nextElementSibling;
        if (!menu || !menu.classList.contains('kebab-menu')) {
          return;
        }
        var isOpen = !menu.hasAttribute('hidden');
        // Close all other menus
        document.querySelectorAll('.kebab-menu').forEach(function (m) {
          m.setAttribute('hidden', '');
        });
        document.querySelectorAll('.kebab-btn').forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });
        // Toggle current menu
        if (!isOpen) {
          // position the menu right under the button instead of depending purely on CSS
          var parent = btn.offsetParent;
          if (parent) {
            // offsetTop is relative to offsetParent (should be the post-header container)
            menu.style.top = (btn.offsetTop + btn.offsetHeight + 4) + 'px';
            // keep right aligned with container padding
            menu.style.right = '0.5rem';
          }

          menu.removeAttribute('hidden');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });

    // Close menu on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.kebab-btn') && !e.target.closest('.kebab-menu')) {
        document.querySelectorAll('.kebab-menu').forEach(function (m) {
          m.setAttribute('hidden', '');
          m.style.top = '';
          m.style.right = '';
        });
        document.querySelectorAll('.kebab-btn').forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });
      }
    });

    // Escape key to close menu
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.kebab-menu').forEach(function (m) {
          m.setAttribute('hidden', '');
          m.style.top = '';
          m.style.right = '';
        });
        document.querySelectorAll('.kebab-btn').forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });
      }
    });

    // Menu item click handlers
    document.querySelectorAll('.kebab-menu-item').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var action = item.getAttribute('data-action');
        if (action === 'delete') {
          var postId = item.getAttribute('data-post-id');
          deletePost(postId);
        } else if (action === 'delete-comment') {
          var commentId = item.getAttribute('data-comment-id');
          var postId = item.getAttribute('data-post-id');
          deleteComment(commentId, postId);
        }
      });
    });

    // New comment form submission
    var newCommentForm = document.getElementById('new-comment-form');
    if (newCommentForm) {
      newCommentForm.onsubmit = function (e) {
        e.preventDefault();

        if (!user) {
          showLoginModal();
          return;
        }

        if (!sb) {
          showErrorModal('Forum not available.');
          return;
        }

        var postId = getPostIdFromUrl();
        var textarea = document.getElementById('comment-content');
        var content = textarea.value.trim();

        if (!content) {
          showErrorModal('Please enter a comment.');
          return;
        }

        sb.from('forum_comments')
          .insert({
            post_id: postId,
            user_id: user.id,
            content: content,
            likes: 0
          })
          .then(function (res) {
            if (res.error) {
              showErrorModal('Failed to post comment: ' + (res.error.message || 'Unknown error'));
              return;
            }
            textarea.value = '';
            loadAndRenderCommentsForPost(postId, {});
          });
      };
    }
  }

  /**
   * Initialize post.html (individual post page)
   */
  function initPostPage() {
    console.log('[Forum] Initializing post.html (individual post page)');
    
    var user = getUser();
    var newCommentSection = document.getElementById('forum-post-new-comment');
    var loginMessage = document.getElementById('forum-comment-login-message');
    var formContainer = document.getElementById('forum-comment-form-container');

    // Show new comment section regardless of login status
    if (newCommentSection) {
      newCommentSection.style.display = 'block';
    }

    // Show login message if not logged in, show form if logged in
    if (user) {
      if (loginMessage) loginMessage.style.display = 'none';
      if (formContainer) formContainer.style.display = 'block';
    } else {
      if (loginMessage) loginMessage.style.display = 'block';
      if (formContainer) formContainer.style.display = 'none';
    }

    // Resolve the current user's profiles.id before loading post
    resolveCurrentProfile().then(function () {
      loadPostDetail();
    }).catch(function (err) {
      console.error('[Forum] Error resolving profile:', err);
      loadPostDetail();
    });
  }

  /**
   * ============================================================================
   * Initialize forum based on current page
   * ============================================================================
   */
  function init() {
    // ADD LOCK: If already initialized for the same user, skip duplicate setup
    var user = getUser();
    var userId = user ? user.id : null;
    if (window.isForumInitialized && window.lastForumUser === userId) {
      console.log('[Forum] Already initialized for this user, skipping duplicate setup.');
      return;
    }
    window.isForumInitialized = true;
    window.lastForumUser = userId;

    console.log('[Forum] init called');
    
    // Set up modal listeners (used on all pages)
    attachModalListeners();
    attachConfirmModalListeners();
    attachSuccessModalListeners();
    attachErrorModalListeners();
    
    // Determine which page we're on and initialize accordingly
    var currentPage = getCurrentPage();
    console.log('[Forum] Current page:', currentPage);

    if (currentPage === 'post') {
      initPostPage();
    } else {
      initForumPage();
    }
  }

  /**
   * Initialize forum once auth is ready.
   * Attaches auth-ready listener first, then checks initial state.
   * This ensures init() runs whenever auth state changes (login, logout, etc.)
   */
  function attachAuthInit() {
    console.log('[Forum] attachAuthInit called');
    
    // Always attach the auth-ready listener first.
    document.addEventListener('auth-ready', function onAuthReady() {
      console.log('[Forum] auth-ready event fired; calling init()');
      init();
    });
    
    // If window.__authUser is already defined, auth-ready may have already fired.
    // Call init() now to ensure we don't miss it.
    if (typeof window.__authUser !== 'undefined') {
      console.log('[Forum] window.__authUser already defined; calling init() to sync with current state');
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachAuthInit);
  } else {
    attachAuthInit();
  }
})();
