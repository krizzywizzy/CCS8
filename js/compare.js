/**
 * Compare Prosthetics - Load from Supabase, display in table
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

  function renderTable(list) {
    var container = document.getElementById('compare-table-wrap');
    if (!container) return;
    if (!list || list.length === 0) {
      container.innerHTML = '<p class="alert alert-info">No prosthetics to compare. Add products in Supabase.</p>';
      return;
    }
    var headers = ['Image', 'Name', 'Type', 'Price', 'Weight', 'Comfort', 'Durability', 'Manufacturer'];
    var html = '<div class="table-responsive"><table class="data-table" role="table"><thead><tr role="row">';
    headers.forEach(function (h) {
      html += '<th scope="col" role="columnheader">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    list.forEach(function (row) {
      html += '<tr role="row">';
      html += '<td role="cell">' + (row.image_url ? '<img src="' + escapeHtml(row.image_url) + '" alt="">' : '—') + '</td>';
      html += '<td role="cell">' + escapeHtml(row.name) + '</td>';
      html += '<td role="cell">' + escapeHtml(row.type) + '</td>';
      html += '<td role="cell">$' + escapeHtml(row.price != null ? Number(row.price).toLocaleString() : '') + '</td>';
      html += '<td role="cell">' + (row.weight_kg != null ? escapeHtml(row.weight_kg) + ' kg' : '—') + '</td>';
      html += '<td role="cell">' + (row.comfort_rating != null ? row.comfort_rating + '/5' : '—') + '</td>';
      html += '<td role="cell">' + (row.durability_rating != null ? row.durability_rating + '/5' : '—') + '</td>';
      html += '<td role="cell">' + escapeHtml(row.manufacturer || '') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  function init() {
    var sb = getSupabase();
    if (!sb) {
      document.getElementById('compare-table-wrap').innerHTML = '<p class="alert alert-info">Configure Supabase in js/config.js to load data.</p>';
      return;
    }
    sb.from('prosthetics').select('*').order('name').then(function (res) {
      if (res.error) {
        document.getElementById('compare-table-wrap').innerHTML = '<p class="alert alert-error">Could not load data. Check Supabase and RLS.</p>';
        return;
      }
      renderTable(res.data || []);
    }).catch(function () {
      renderTable([]);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
