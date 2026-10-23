<script>
  import { appState } from '../stores/appState.svelte.js';
  import {
    Search,
    X,
    LayoutGrid,
    Merge,
    Scissors,
    Split,
    Layers,
    SunMoon,
    Minimize2,
    Images,
    FileImage,
    Sun,
    Volume2
  } from '@lucide/svelte';

  let query = $state('');
  let selectedIndex = $state(0);

  const commands = [
    { id: 'home', label: 'All Tools Hub', category: 'Navigation', icon: LayoutGrid, action: () => appState.switchTab('home') },
    { id: 'merge', label: 'Merge PDFs', category: 'Tools', icon: Merge, action: () => appState.switchTab('merge') },
    { id: 'remove', label: 'Remove Pages', category: 'Tools', icon: Scissors, action: () => appState.switchTab('remove') },
    { id: 'split', label: 'Split PDF into Parts', category: 'Tools', icon: Split, action: () => appState.switchTab('split') },
    { id: 'slides', label: 'Slides to A4 Handouts', category: 'Tools', icon: Layers, action: () => appState.switchTab('slides') },
    { id: 'invert', label: 'Invert Colors / Ink Saver', category: 'Tools', icon: SunMoon, action: () => appState.switchTab('invert') },
    { id: 'compress', label: 'Compress PDF', category: 'Tools', icon: Minimize2, action: () => appState.switchTab('compress') },
    { id: 'images', label: 'Image to PDF', category: 'Tools', icon: Images, action: () => appState.switchTab('images') },
    { id: 'pdftoimages', label: 'PDF to Images (JPG/PNG)', category: 'Tools', icon: FileImage, action: () => appState.switchTab('pdftoimages') },
    { id: 'theme', label: 'Toggle Light / Dark Theme', category: 'Settings', icon: Sun, action: () => appState.toggleTheme() },
    { id: 'sound', label: 'Toggle Audio Cues & Haptics', category: 'Settings', icon: Volume2, action: () => appState.toggleSound() }
  ];

  let filtered = $derived(
    commands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()) || cmd.category.toLowerCase().includes(query.toLowerCase()))
  );

  function handleKeyDown(e) {
    if (!appState.commandPaletteOpen) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        appState.commandPaletteOpen = true;
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      appState.commandPaletteOpen = false;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % Math.max(1, filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + filtered.length) % Math.max(1, filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[selectedIndex];
      if (target) {
        target.action();
        appState.commandPaletteOpen = false;
        query = '';
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if appState.commandPaletteOpen}
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-md transition-opacity"
    onclick={() => (appState.commandPaletteOpen = false)}
    role="presentation"
  >
    <div
      class="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.1] shadow-2xl overflow-hidden transition-all"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      <!-- Search Input Header -->
      <div class="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08]">
        <Search class="w-5 h-5 text-indigo-500 shrink-0" />
        <input
          type="text"
          bind:value={query}
          placeholder="Search tools, commands, or settings..."
          class="w-full bg-transparent text-sm sm:text-base outline-none text-[#1c1b22] dark:text-[#f2f1f7] placeholder-[#84828e]"
          autofocus
        />
        <kbd class="px-2 py-0.5 text-[11px] rounded bg-black/[0.04] dark:bg-white/[0.06] text-[#52505d] dark:text-[#9e9cb0] font-mono">
          ESC
        </kbd>
      </div>

      <!-- Command List -->
      <div class="max-h-72 overflow-y-auto p-2">
        {#if filtered.length === 0}
          <div class="py-8 text-center text-xs text-[#84828e]">
            No matching tools or commands found.
          </div>
        {:else}
          {#each filtered as cmd, i (cmd.id)}
            {@const Icon = cmd.icon}
            {@const isSelected = i === selectedIndex}
            <button
              type="button"
              onclick={() => {
                cmd.action();
                appState.commandPaletteOpen = false;
                query = '';
              }}
              onmouseenter={() => (selectedIndex = i)}
              class="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-medium transition-colors cursor-pointer {isSelected
                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
                : 'text-[#1c1b22] dark:text-[#f2f1f7] hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'}"
            >
              <div class="flex items-center gap-2.5">
                <Icon class="w-4 h-4 shrink-0" />
                <span>{cmd.label}</span>
              </div>
              <span class="text-[10px] uppercase tracking-wider text-[#84828e] font-semibold">
                {cmd.category}
              </span>
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}
