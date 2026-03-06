(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', initPage);

  async function initPage() {
    // wait for supabase client to be ready
    if (!window.sb) {
      // simple polling like other pages
      let attempts = 0;
      const max = 50;
      while (!window.sb && attempts < max) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
    }

    if (!window.sb) {
      console.error('Supabase client not available');
      return;
    }

    try {
      const { data, error } = await window.sb
        .from('prosthetics_sources')
        .select('provider_name,category,scope,provider_type,specialty_notes,website');

      if (error) {
        console.error('Error fetching manufacturers:', error);
        return;
      }

      populateTable(data || []);
    } catch (err) {
      console.error('Failed to load manufacturers:', err);
    }
  }

  function populateTable(rows) {
    const tbody = document.getElementById('manufacturers-table-body');
    if (!tbody) return;

    // split into categories
    const globalList = [];
    const localList = [];

    rows.forEach(r => {
      const cat = (r.category || '').toLowerCase();
      if (cat === 'global') {
        globalList.push(r);
      } else {
        localList.push(r);
      }
    });

    const sortByName = (a, b) => (a.provider_name || '').localeCompare(b.provider_name || '');
    globalList.sort(sortByName);
    localList.sort(sortByName);

    // helper to render a section
    const renderSection = (label, list) => {
      if (list.length === 0) return;
      const htr = document.createElement('tr');
      htr.className = 'table-section-header';
      htr.innerHTML = `<td colspan="5">${label}</td>`;
      tbody.appendChild(htr);

      list.forEach(r => {
        const tr = document.createElement('tr');
        const websiteCell = r.website
          ? `<a href="${r.website}" target="_blank" rel="noopener noreferrer">${r.website}</a>`
          : 'Search locally';
        tr.innerHTML = `
          <td>${r.provider_name || ''}</td>
          <td>${r.scope || ''}</td>
          <td>${r.provider_type || ''}</td>
          <td>${r.specialty_notes || ''}</td>
          <td>${websiteCell}</td>
        `;
        tbody.appendChild(tr);
      });
    };

    renderSection('Global', globalList);
    renderSection('Philippines', localList);
  }
})();