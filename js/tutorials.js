/**
 * Video Tutorials - Load from Supabase, accessible player with transcript
 */
(function () {
  'use strict';

  function getSupabase() {
    return typeof window.supabase !== 'undefined' ? window.supabase : null;
  }

  function normalizeLimbToBody(text) {
    if (!text) return '';
    return String(text).replace(/Limb/g, 'Body');
  }

  function renderVideos(list) {
    var container = document.getElementById('tutorials-list');
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = '<p class="alert alert-info">No tutorials found. Add videos in Supabase to see them here.</p>';
      return;
    }
    container.innerHTML = list.map(function (v) {
      var transcriptHtml = v.transcript
        ? '<div class="transcript-box" id="transcript-' + v.id + '" hidden><h3>Transcript</h3><p>' + escapeHtml(normalizeLimbToBody(v.transcript)) + '</p></div>'
        : '';
      return (
        '<article class="card video-card" data-video-id="' + escapeHtml(v.id) + '">' +
        '  <h2 class="card-title">' + escapeHtml(normalizeLimbToBody(v.title)) + '</h2>' +
        '  <p>' + escapeHtml(normalizeLimbToBody(v.description || '')) + '</p>' +
        '  <p><strong>Category:</strong> ' + escapeHtml(normalizeLimbToBody(v.category || '')) + '</p>' +
        '  <div class="video-wrapper">' +
        (v.video_url && v.video_url.indexOf('youtube') !== -1
          ? '<iframe src="' + embedYoutube(v.video_url) + '" title="' + escapeHtml(v.title) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>'
          : '<video id="vid-' + v.id + '" controls preload="metadata" data-transcript-id="transcript-' + v.id + '"><source src="' + escapeHtml(v.video_url) + '" type="video/mp4">Your browser does not support the video tag.</video>') +
        '  </div>' +
        '  <div class="video-controls" role="group" aria-label="Video controls">' +
        (v.video_url && v.video_url.indexOf('youtube') === -1
          ? '<button type="button" class="btn-play-pause" data-video-id="vid-' + v.id + '" aria-label="Play">Play</button>' +
            '<button type="button" class="btn-show-transcript" data-transcript-id="transcript-' + v.id + '" aria-label="Show transcript">Show transcript</button>'
          : '') +
        '  </div>' +
        transcriptHtml +
        '</article>'
      );
    }).join('');

    // Play/pause and transcript toggle for native video
    container.querySelectorAll('.btn-play-pause').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var vid = document.getElementById(btn.getAttribute('data-video-id'));
        if (!vid) return;
        if (vid.paused) { vid.play(); btn.setAttribute('aria-label', 'Pause'); btn.textContent = 'Pause'; }
        else { vid.pause(); btn.setAttribute('aria-label', 'Play'); btn.textContent = 'Play'; }
      });
    });
    container.querySelectorAll('.btn-show-transcript').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = document.getElementById(btn.getAttribute('data-transcript-id'));
        if (!box) return;
        var hidden = box.getAttribute('hidden') !== null;
        box.hidden = !hidden;
        btn.textContent = hidden ? 'Hide transcript' : 'Show transcript';
      });
    });
  }

  function embedYoutube(url) {
    var m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return m ? 'https://www.youtube.com/embed/' + m[1] + '?enablejsapi=1' : url;
  }

  function escapeHtml(s) {
    if (!s) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function init() {
    var sb = getSupabase();
    var params = new URLSearchParams(window.location.search);
    var category = params.get('category');

    if (!sb) {
      renderVideos([]);
      return;
    }

    var q = sb.from('videos').select('*').order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    q.then(function (res) {
      if (res.error) {
        document.getElementById('tutorials-list').innerHTML = '<p class="alert alert-error">Could not load tutorials. Check Supabase connection.</p>';
        return;
      }
      renderVideos(res.data || []);
    }).catch(function () {
      renderVideos([]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
