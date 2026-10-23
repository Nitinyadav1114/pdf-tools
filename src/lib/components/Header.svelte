<script>
  import { appState } from '../stores/appState.svelte.js';
  import { FileText, Lock, Search, Volume2, VolumeX, Sun, Moon, Download } from '@lucide/svelte';

  const toolSubtitles = {
    home: '100% In-Browser & Private PDF Tools • Zero Server Uploads',
    merge: 'Sort by timestamp or drag & drop to reorder',
    remove: 'Select, rotate, and organize pages with live visual preview',
    split: 'Extract specific page ranges or split into multiple separate documents',
    slides: 'Fit presentation slides per A4 page for printing & handouts',
    invert: 'Invert dark PDF pages to clean white paper for hardcopy printing',
    compress: 'Compress and shrink large PDF files with zero loss or visual control',
    images: 'Convert JPG, PNG, and WebP images into a single clean PDF document',
    pdftoimages: 'Convert PDF pages into high-resolution JPG or PNG images'
  };

  let subtitle = $derived(toolSubtitles[appState.currentTab] || toolSubtitles.home);
</script>

<header class="w-full flex items-center justify-between pb-4 mb-6 border-b border-black/[0.06] dark:border-white/[0.08] transition-colors">
  <!-- Brand Meta -->
  <div class="flex items-center gap-3">
    <div class="w-10 h-10 rounded-2xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-500/20 shrink-0">
      <FileText class="w-5 h-5" />
    </div>
    <div class="flex flex-col">
      <div class="flex items-center gap-2">
        <h1 class="text-xl font-bold tracking-tight text-[#1c1b22] dark:text-[#f2f1f7]">
          PDF Tools
        </h1>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          100% Private
        </span>
      </div>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] line-clamp-1 max-w-[280px] sm:max-w-md">
        {subtitle}
      </p>
    </div>
  </div>

  <!-- Header Actions -->
  <div class="flex items-center gap-2">
    <!-- Privacy Badge (hidden on mobile < 640px to declutter header) -->
    <div class="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/[0.03] dark:bg-white/[0.06] border border-black/[0.08] dark:border-white/[0.1] text-[#52505d] dark:text-[#9e9cb0]">
      <span class="relative flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <Lock class="w-3.5 h-3.5 text-emerald-500" />
      <span>Offline Ready</span>
    </div>

    <!-- Classic View Link -->
    <a
      href="classic.html"
      class="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#52505d] dark:text-[#9e9cb0] transition-all"
      title="Switch to Classic Mode"
    >
      <span>Classic View</span>
    </a>

    <!-- Command Palette Trigger -->
    <button
      type="button"
      onclick={() => (appState.commandPaletteOpen = true)}
      class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.1] text-xs font-medium text-[#52505d] dark:text-[#9e9cb0] transition-all cursor-pointer"
      title="Search tools (Ctrl+K)"
      aria-label="Search tools"
    >
      <Search class="w-4 h-4" />
      <span class="hidden md:inline">Search</span>
      <kbd class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] rounded bg-black/[0.06] dark:bg-white/[0.1] font-mono">⌘K</kbd>
    </button>

    <!-- Sound Toggle -->
    <button
      type="button"
      onclick={appState.toggleSound}
      class="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.1] text-[#52505d] dark:text-[#9e9cb0] transition-all cursor-pointer"
      title={appState.soundEnabled ? 'Mute audio cues' : 'Enable audio cues'}
      aria-label="Toggle sound effects"
    >
      {#if appState.soundEnabled}
        <Volume2 class="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
      {:else}
        <VolumeX class="w-4 h-4 opacity-50" />
      {/if}
    </button>

    <!-- Theme Toggle -->
    <button
      type="button"
      onclick={appState.toggleTheme}
      class="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.06] hover:bg-black/[0.06] dark:hover:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.1] text-[#52505d] dark:text-[#9e9cb0] transition-all cursor-pointer"
      title="Toggle Light / Dark mode"
      aria-label="Toggle theme"
    >
      {#if appState.theme === 'dark'}
        <Sun class="w-4 h-4 text-amber-400" />
      {:else}
        <Moon class="w-4 h-4 text-indigo-600" />
      {/if}
    </button>
  </div>
</header>
