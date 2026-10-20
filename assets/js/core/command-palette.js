/**
 * PDF Tools - Fast Command Palette (Ctrl+K / Cmd+K)
 * Spotlight-style quick switcher and action launcher.
 * 100% Client-Side, Accessible, and Keyboard First.
 */

export function initCommandPalette(actions = {}) {
  const modal = document.getElementById('commandPaletteModal');
  const input = document.getElementById('cmdPaletteInput');
  const list = document.getElementById('cmdPaletteList');
  const countEl = document.getElementById('cmdPaletteCount');
  const triggerBtn = document.getElementById('cmdPaletteBtn');
  const closeBtn = document.getElementById('closeCmdPaletteBtn');

  if (!modal || !input || !list) return;

  const isMac = typeof navigator !== 'undefined' && 
    ((navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0) ||
     (navigator.userAgentData?.platform === 'macOS'));

  // Update kbd labels to ⌘K on macOS
  if (isMac) {
    document.querySelectorAll('.cmd-trigger-kbd').forEach(el => {
      el.textContent = '⌘K';
    });
  }

  const commands = [
    // --- Tools ---
    {
      id: 'tool-merge',
      title: 'Merge PDFs',
      desc: 'Combine multiple PDFs into one document with reordering',
      category: 'Tools',
      icon: 'lucide-merge',
      badge: '1',
      keywords: ['combine', 'join', 'reorder', 'stamp', 'multiple', 'merge'],
      action: () => actions.switchTab && actions.switchTab('merge')
    },
    {
      id: 'tool-split',
      title: 'Split PDF',
      desc: 'Extract specific page ranges or split into separate chunks',
      category: 'Tools',
      icon: 'lucide-split',
      badge: '2',
      keywords: ['extract', 'divide', 'ranges', 'separate', 'split', 'cut'],
      action: () => actions.switchTab && actions.switchTab('split')
    },
    {
      id: 'tool-remove',
      title: 'Remove Pages & Rotate',
      desc: 'Visual grid to delete pages and rotate orientations 90°/180°',
      category: 'Tools',
      icon: 'lucide-trash-2',
      badge: '3',
      keywords: ['delete', 'rotate', 'reorder', 'pages', 'cut', 'remove'],
      action: () => actions.switchTab && actions.switchTab('remove')
    },
    {
      id: 'tool-slides',
      title: 'Slides to Handouts',
      desc: 'Convert slide presentations to printable A4 handouts (2/3/4/6/9 slides)',
      category: 'Tools',
      icon: 'lucide-file-text',
      badge: '4',
      keywords: ['presentation', 'print', 'a4', 'notes', 'handouts', 'slides', 'lecture'],
      action: () => actions.switchTab && actions.switchTab('slides')
    },
    {
      id: 'tool-invert',
      title: 'Invert Colors (Ink Saver)',
      desc: 'Convert dark presentations to clean white paper backgrounds',
      category: 'Tools',
      icon: 'lucide-contrast',
      badge: '5',
      keywords: ['dark', 'white', 'black', 'ink', 'toner', 'invert', 'save', 'printer'],
      action: () => actions.switchTab && actions.switchTab('invert')
    },
    {
      id: 'tool-compress',
      title: 'Compress PDF',
      desc: 'Reduce PDF file size losslessly with DPI scaling and stream reduction',
      category: 'Tools',
      icon: 'lucide-minimize-2',
      badge: '6',
      keywords: ['reduce', 'size', 'shrink', 'mb', 'kb', 'compress', 'optimize', 'lighten'],
      action: () => actions.switchTab && actions.switchTab('compress')
    },
    {
      id: 'tool-images',
      title: 'Images to PDF',
      desc: 'Convert JPG, PNG, and WebP photos into a clean PDF document',
      category: 'Tools',
      icon: 'lucide-image',
      badge: '7',
      keywords: ['jpg', 'png', 'photos', 'pictures', 'convert', 'images', 'webp'],
      action: () => actions.switchTab && actions.switchTab('images')
    },
    {
      id: 'tool-pdftoimages',
      title: 'PDF to Images',
      desc: 'Extract PDF pages as high-resolution JPG or PNG bundled in a ZIP',
      category: 'Tools',
      icon: 'lucide-images',
      badge: '8',
      keywords: ['extract', 'jpg', 'png', 'zip', 'rasterize', 'pdftoimages', 'export'],
      action: () => actions.switchTab && actions.switchTab('pdftoimages')
    },
    {
      id: 'tool-home',
      title: 'All Tools Hub',
      desc: 'Return to the main tool overview dashboard',
      category: 'Navigation',
      icon: 'lucide-grid',
      badge: 'H',
      keywords: ['home', 'dashboard', 'all', 'menu', 'overview', 'hub'],
      action: () => actions.switchTab && actions.switchTab('home')
    },

    // --- Actions ---
    {
      id: 'action-theme',
      title: 'Toggle Dark / Light Theme',
      desc: 'Switch between light paper and dark ambient view',
      category: 'Actions',
      icon: 'lucide-sun-moon',
      badge: 'T',
      keywords: ['theme', 'mode', 'dark', 'light', 'appearance', 'night', 'sun', 'moon'],
      action: () => {
        const themeBtn = document.getElementById('themeToggleBtn');
        if (themeBtn) themeBtn.click();
      }
    },
    {
      id: 'action-share',
      title: 'Share PDF Tools',
      desc: 'Copy app link or share with colleagues and friends',
      category: 'Actions',
      icon: 'lucide-share-2',
      badge: 'S',
      keywords: ['share', 'link', 'url', 'copy', 'friends', 'colleagues', 'team'],
      action: () => {
        if (typeof actions.openShareModal === 'function') {
          actions.openShareModal();
        } else {
          const shareBtn = document.getElementById('appShareModalTrigger');
          if (shareBtn) shareBtn.click();
        }
      }
    },
    {
      id: 'action-install',
      title: 'Install App (PWA)',
      desc: 'Install PDF Tools to your home screen or desktop dock',
      category: 'Actions',
      icon: 'lucide-download',
      badge: 'I',
      keywords: ['pwa', 'install', 'desktop', 'app', 'download', 'offline', 'dock'],
      action: () => {
        const installBtn = document.getElementById('headerInstallBtn');
        if (installBtn) installBtn.click();
      }
    },
    {
      id: 'action-stats',
      title: 'View Global Impact Stats',
      desc: 'Jump to the live visitor & processed files odometer',
      category: 'Actions',
      icon: 'lucide-bar-chart-2',
      badge: 'V',
      keywords: ['stats', 'visitors', 'counter', 'analytics', 'processed', 'impact', 'odometer'],
      action: () => {
        const statsEl = document.getElementById('footerStatsCard');
        if (statsEl) {
          statsEl.scrollIntoView({ behavior: 'smooth' });
          statsEl.classList.add('stat-pulse-highlight');
          setTimeout(() => statsEl.classList.remove('stat-pulse-highlight'), 1800);
        }
      }
    },
    {
      id: 'action-clear',
      title: 'Clear Active Workspace',
      desc: 'Reset the current tool and discard selected files',
      category: 'Actions',
      icon: 'lucide-rotate-ccw',
      badge: 'R',
      keywords: ['clear', 'reset', 'clean', 'empty', 'new', 'discard', 'cancel'],
      action: () => {
        const activeReset = document.querySelector('.tab-panel:not(.hidden) [id$="ResetBtn"], .tab-panel:not(.hidden) [id$="ClearBtn"], .tab-panel:not(.hidden) [id*="reset"]');
        if (activeReset) {
          activeReset.click();
          if (window.showToast) window.showToast('Workspace reset', 'info');
        } else {
          if (window.showToast) window.showToast('No active files in this tool', 'info');
        }
      }
    }
  ];

  let filteredCommands = [...commands];
  let selectedIndex = 0;
  let previousFocusedElement = null;

  function openPalette() {
    previousFocusedElement = document.activeElement;
    modal.classList.remove('hidden');
    input.value = '';
    renderCommands('');
    setTimeout(() => input.focus(), 40);
    document.body.style.overflow = 'hidden';
  }

  function closePalette() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
    if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
      try { previousFocusedElement.focus(); } catch (_) {}
    }
  }

  function highlightMatches(text, query) {
    if (!query) return escapeHtml(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return escapeHtml(text).replace(regex, '<mark class="cmd-match-highlight">$1</mark>');
  }

  function renderCommands(query = '') {
    const q = query.trim().toLowerCase();
    if (!q) {
      filteredCommands = [...commands];
    } else {
      filteredCommands = commands.filter((cmd) => {
        const inTitle = cmd.title.toLowerCase().includes(q);
        const inDesc = cmd.desc.toLowerCase().includes(q);
        const inKeywords = cmd.keywords.some((k) => k.toLowerCase().includes(q));
        const inCategory = cmd.category.toLowerCase().includes(q);
        return inTitle || inDesc || inKeywords || inCategory;
      });
    }

    selectedIndex = 0;
    if (countEl) {
      countEl.textContent = `${filteredCommands.length} command${filteredCommands.length === 1 ? '' : 's'} available`;
    }

    if (filteredCommands.length === 0) {
      list.innerHTML = `
        <div class="cmd-empty-state py-8 text-center text-slate-400 dark:text-slate-500">
          <svg class="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden="true"><use href="#lucide-search"></use></svg>
          <p class="text-sm font-medium">No commands found for "${escapeHtml(q)}"</p>
          <p class="text-xs mt-1 text-slate-400/80">Try searching "merge", "split", "theme", or "compress"</p>
        </div>
      `;
      return;
    }

    const categories = ['Tools', 'Navigation', 'Actions'];
    let html = '';
    let globalIndex = 0;

    categories.forEach((cat) => {
      const catItems = filteredCommands.filter((c) => c.category === cat);
      if (catItems.length === 0) return;

      html += `<div class="cmd-category-header text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 pt-2.5 pb-1">${cat}</div>`;

      catItems.forEach((cmd) => {
        const isSelected = globalIndex === selectedIndex;
        const itemIndex = globalIndex;
        html += `
          <div 
            class="cmd-palette-item ${isSelected ? 'cmd-item-active' : ''}" 
            role="option" 
            aria-selected="${isSelected}" 
            data-index="${itemIndex}"
          >
            <div class="cmd-item-icon-box">
              <svg class="w-4 h-4 shrink-0" aria-hidden="true"><use href="#${cmd.icon}"></use></svg>
            </div>
            <div class="cmd-item-text flex-1 min-w-0">
              <div class="cmd-item-title text-sm font-semibold text-slate-900 dark:text-white truncate">
                ${highlightMatches(cmd.title, q)}
              </div>
              <div class="cmd-item-desc text-xs text-slate-500 dark:text-slate-400 truncate">
                ${highlightMatches(cmd.desc, q)}
              </div>
            </div>
            ${cmd.badge ? `<kbd class="cmd-kbd-sm shrink-0">${cmd.badge}</kbd>` : ''}
          </div>
        `;
        globalIndex++;
      });
    });

    list.innerHTML = html;

    list.querySelectorAll('.cmd-palette-item').forEach((itemEl) => {
      itemEl.addEventListener('click', () => {
        const idx = parseInt(itemEl.dataset.index, 10);
        executeCommand(idx);
      });
      itemEl.addEventListener('mouseenter', () => {
        const idx = parseInt(itemEl.dataset.index, 10);
        setSelectedIndex(idx, false);
      });
    });
  }

  function setSelectedIndex(idx, scrollIntoView = true) {
    if (filteredCommands.length === 0) return;
    selectedIndex = Math.max(0, Math.min(idx, filteredCommands.length - 1));

    const items = list.querySelectorAll('.cmd-palette-item');
    items.forEach((el) => {
      const itemIdx = parseInt(el.dataset.index, 10);
      const active = itemIdx === selectedIndex;
      el.classList.toggle('cmd-item-active', active);
      el.setAttribute('aria-selected', active);
      if (active && scrollIntoView) {
        el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function executeCommand(idx) {
    const cmd = filteredCommands[idx];
    if (!cmd) return;
    closePalette();
    try {
      cmd.action();
    } catch (err) {
      console.error('Error executing command:', err);
    }
  }

  input.addEventListener('input', (e) => {
    renderCommands(e.target.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((selectedIndex + 1) % filteredCommands.length, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((selectedIndex - 1 + filteredCommands.length) % filteredCommands.length, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand(selectedIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePalette();
    }
  });

  window.addEventListener('keydown', (e) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if (isCtrlOrMeta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (modal.classList.contains('hidden')) {
        openPalette();
      } else {
        closePalette();
      }
      return;
    }

    if (e.key === '/' && modal.classList.contains('hidden')) {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      const isInput = ['input', 'textarea', 'select'].includes(activeTag) || 
                      (document.activeElement && document.activeElement.isContentEditable);
      if (!isInput) {
        e.preventDefault();
        openPalette();
      }
      return;
    }

    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      e.preventDefault();
      closePalette();
    }
  });

  if (triggerBtn) {
    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openPalette();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closePalette();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePalette();
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.openCommandPalette = openPalette;
  window.closeCommandPalette = closePalette;
}
