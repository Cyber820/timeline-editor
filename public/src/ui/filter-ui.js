export function renderFilterList(container, activeFilters, attributeLabels, onRemove) {
  if (!container) return;
  container.innerHTML = '';
  for (const [key, values] of Object.entries(activeFilters)) {
    const d = document.createElement('div');
    d.textContent = `${(attributeLabels && attributeLabels[key]) || key}: ${values.join(', ')}`;
    const btn = document.createElement('button');
    btn.textContent = '❌';
    btn.onclick = () => onRemove && onRemove(key);
    d.appendChild(btn);
    container.appendChild(d);
  }
}

export function renderAttributeSelect(selectEl, attributeLabels) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  Object.keys(attributeLabels || {}).forEach(key => {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = attributeLabels[key];
    selectEl.appendChild(o);
  });
}

export function renderFilterOptions(selectEl, options, useChoices = false, oldChoicesInstance = null) {
  if (!selectEl) return { choices: null };
  selectEl.innerHTML = '';
  (options || []).forEach(opt => {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  });
  if (!useChoices || typeof Choices !== 'function') return { choices: null };
  if (oldChoicesInstance) { try { oldChoicesInstance.destroy(); } catch {} }
  const choices = new Choices(selectEl, { removeItemButton: true, shouldSort: false });
  return { choices };
}

