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

  const tools = [
    { id: 'home', label: 'All', icon: LayoutGrid },
    { id: 'merge', label: 'Merge', icon: Merge },
    { id: 'remove', label: 'Remove', icon: Scissors },
    { id: 'split', label: 'Split', icon: Split },
    { id: 'slides', label: 'Slides', icon: Layers },
    { id: 'compress', label: 'Compress', icon: Minimize2 },
    { id: 'images', label: 'Photos', icon: Images }
  ];
</script>

<!-- Mobile Floating Bottom Dock (visible on < 640px) -->
<div class="sm:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] px-2 py-1.5 rounded-full bg-[#0f0e16]/90 dark:bg-[#1a1924]/90 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-1">
  {#each tools as tool (tool.id)}
    {@const Icon = tool.icon}
    {@const isActive = appState.currentTab === tool.id}
    <button
      type="button"
      onclick={() => appState.switchTab(tool.id)}
      class="flex flex-col items-center justify-center px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all {isActive
        ? 'bg-indigo-600 text-white shadow-md'
        : 'text-[#9e9cb0] hover:text-white'}"
      aria-label={tool.label}
    >
      <Icon class="w-4 h-4 mb-0.5" />
      <span>{tool.label}</span>
    </button>
  {/each}
</div>
