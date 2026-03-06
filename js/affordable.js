/**
 * Affordable Prosthetics Finder - Filter by price, type, beginner-friendly, reliability
 */
(function () {
  'use strict';

  function getSupabase() {
    return typeof window.supabase !== 'undefined' ? window.supabase : null;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '—';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
  }

  function renderCards(list) {
    var container = document.getElementById('affordable-results');
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = '<p class="alert alert-info">No prosthetics match your filters. Try adjusting filters or add data in Supabase.</p>';
      return;
    }
    container.innerHTML = list.map(function (p) {
      return (
        '<article class="card">' +
        (p.image_url ? '<img src="' + escapeHtml(p.image_url) + '" alt="" class="card-image">' : '') +
        '<h2 class="card-title">' + escapeHtml(p.name) + '</h2>' +
        '<p><strong>Type:</strong> ' + escapeHtml(p.type) + '</p>' +
        '<p><strong>Price:</strong> $' + (p.price != null ? Number(p.price).toLocaleString() : '—') + '</p>' +
        '<p><strong>Comfort:</strong> ' + (p.comfort_rating != null ? p.comfort_rating + '/5' : '—') + ' &nbsp; <strong>Durability:</strong> ' + (p.durability_rating != null ? p.durability_rating + '/5' : '—') + '</p>' +
        (p.reliability_rating != null ? '<p><strong>Reliability:</strong> ' + p.reliability_rating + '/5</p>' : '') +
        (p.beginner_friendly ? '<p><span class="badge">Beginner-friendly</span></p>' : '') +
        (p.description ? '<p>' + escapeHtml(p.description) + '</p>' : '') +
        '</article>'
      );
    }).join('');
  }

  function applyFilters() {
    var sb = getSupabase();
    var maxPrice = document.getElementById('filter-price') && document.getElementById('filter-price').value;
    var type = document.getElementById('filter-type') && document.getElementById('filter-type').value;
    var beginner = document.getElementById('filter-beginner') && document.getElementById('filter-beginner').checked;
    var minReliability = document.getElementById('filter-reliability') && document.getElementById('filter-reliability').value;

    if (!sb) {
      document.getElementById('affordable-results').innerHTML = '<p class="alert alert-info">Configure Supabase in js/config.js.</p>';
      return;
    }

    var q = sb.from('prosthetics').select('*').order('price', { ascending: true });
    if (maxPrice && maxPrice !== '') q = q.lte('price', Number(maxPrice));
    if (type && type !== '') q = q.eq('type', type);
    if (beginner) q = q.eq('beginner_friendly', true);
    if (minReliability && minReliability !== '') q = q.gte('reliability_rating', Number(minReliability));

    document.getElementById('affordable-results').innerHTML = '<p class="alert alert-info">Loading…</p>';
    q.then(function (res) {
      if (res.error) {
        document.getElementById('affordable-results').innerHTML = '<p class="alert alert-error">Could not load data.</p>';
        return;
      }
      renderCards(res.data || []);
    }).catch(function () {
      renderCards([]);
    });
  }

  function init() {
    var btn = document.getElementById('affordable-apply');
    if (btn) btn.addEventListener('click', function () { applyFilters(); });
    document.getElementById('filter-type') && document.getElementById('filter-type').addEventListener('change', applyFilters);
    document.getElementById('filter-beginner') && document.getElementById('filter-beginner').addEventListener('change', applyFilters);
    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
