(() => {
  const dialog = document.querySelector('[data-search-dialog]');
  const input = document.querySelector('[data-search-input]');
  const results = document.querySelector('[data-search-results]');
  const dataNode = document.querySelector('[data-search-data]');
  const articles = dataNode ? JSON.parse(dataNode.textContent) : [];
  const showHint = message => {
    const hint = document.createElement('p');
    hint.className = 'search-hint';
    hint.textContent = message;
    results.replaceChildren(hint);
  };
  const openSearch = () => { if (!dialog) return; dialog.showModal(); input.focus(); };
  document.querySelectorAll('[data-search-open]').forEach(button => button.addEventListener('click', openSearch));
  document.querySelector('[data-search-close]')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  input?.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) { showHint(results.dataset.hint); return; }
    const matches = articles.filter(item => `${item.title} ${item.summary}`.toLowerCase().includes(query)).slice(0, 8);
    if (!matches.length) { showHint(results.dataset.empty); return; }
    results.replaceChildren(...matches.map(item => {
      const link = document.createElement('a');
      link.className = 'search-result';
      link.href = item.url;
      const title = document.createElement('span');
      title.textContent = item.title;
      const date = document.createElement('time');
      date.textContent = item.date;
      link.append(title, date);
      return link;
    }));
  });
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('theme', dark ? 'dark' : 'light'); } catch (_) {}
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); openSearch(); }
    if (event.key === 'Escape' && dialog?.open) dialog.close();
  });
})();
