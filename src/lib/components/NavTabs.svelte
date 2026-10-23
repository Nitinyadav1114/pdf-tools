<script>
  import { appState } from '../stores/appState.svelte.js';
  import {
    LayoutGrid,
    Merge,
    Scissors,
    Split,
    Layers,
    SunMoon,
    Minimize2,
    Images,
    FileImage
  } from '@lucide/svelte';

  const tabs = [
    { id: 'home', label: 'All Tools', icon: LayoutGrid, color: '#7f77dd' },
    { id: 'merge', label: 'Merge PDFs', icon: Merge, color: '#4f46e5' },
    { id: 'remove', label: 'Remove Pages', icon: Scissors, color: '#f43f5e' },
    { id: 'split', label: 'Split PDF', icon: Split, color: '#ea580c' },
    { id: 'slides', label: 'Slides to A4', icon: Layers, color: '#2563eb' },
    { id: 'invert', label: 'Invert Colors', icon: SunMoon, color: '#8b5cf6' },
    { id: 'compress', label: 'Compress PDF', icon: Minimize2, color: '#10b981' },
    { id: 'images', label: 'Image to PDF', icon: Images, color: '#0d9488' },
    { id: 'pdftoimages', label: 'PDF to Images', icon: FileImage, color: '#0284c7' }
  ];
</script>

<nav class="w-full mb-6 overflow-x-auto scrollbar-none" aria-label="Tool Navigation">
  <div class="inline-flex items-center gap-1 p-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.08] backdrop-blur-md w-full max-w-full justify-between sm:justify-start">
    {#each tabs as tab (tab.id)}
      {@const Icon = tab.icon}
      {@const isActive = appState.currentTab === tab.id}
      <button
        type="button"
        onclick={() => appState.switchTab(tab.id)}
        class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer select-none {isActive
          ? 'bg-white dark:bg-[#1a1924] text-[#1c1b22] dark:text-white shadow-sm shadow-black/10'
          : 'text-[#52505d] dark:text-[#9e9cb0] hover:text-[#1c1b22] dark:hover:text-white hover:bg-black/[0.02] dark:hover:bg-white/[0.04]'}"
        style={isActive ? `--tab-accent: ${tab.color}; color: ${tab.color};` : ''}
        aria-selected={isActive}
        role="tab"
      >
        <Icon class="w-3.5 h-3.5 transition-transform duration-200 {isActive ? 'scale-110' : ''}" />
        <span>{tab.label}</span>
      </button>
    {/each}
  </div>
</nav>
