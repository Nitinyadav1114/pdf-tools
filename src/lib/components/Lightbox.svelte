<script>
  import { appState } from '../stores/appState.svelte.js';
  import { X, ZoomIn, ZoomOut, RotateCw, Maximize2 } from '@lucide/svelte';

  function handleKeyDown(e) {
    if (!appState.lightbox.open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      appState.closeLightbox();
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      appState.lightbox.zoom = Math.min(3, appState.lightbox.zoom + 0.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      appState.lightbox.zoom = Math.max(0.5, appState.lightbox.zoom - 0.25);
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      appState.lightbox.rotation = (appState.lightbox.rotation + 90) % 360;
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if appState.lightbox.open}
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-between p-4 bg-black/80 backdrop-blur-xl transition-opacity"
    role="dialog"
    aria-modal="true"
  >
    <!-- Top Bar -->
    <div class="w-full max-w-4xl flex items-center justify-between text-white pb-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold">{appState.lightbox.title}</span>
        <span class="px-2 py-0.5 rounded-full text-[11px] font-mono bg-white/10">
          Page {appState.lightbox.pageNum} of {appState.lightbox.totalPages}
        </span>
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          onclick={() => (appState.lightbox.zoom = Math.max(0.5, appState.lightbox.zoom - 0.25))}
          class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut class="w-4 h-4" />
        </button>
        <span class="text-xs font-mono px-2">{Math.round(appState.lightbox.zoom * 100)}%</span>
        <button
          type="button"
          onclick={() => (appState.lightbox.zoom = Math.min(3, appState.lightbox.zoom + 0.25))}
          class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn class="w-4 h-4" />
        </button>
        <button
          type="button"
          onclick={() => (appState.lightbox.rotation = (appState.lightbox.rotation + 90) % 360)}
          class="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer ml-1"
          title="Rotate 90° Clockwise (R)"
        >
          <RotateCw class="w-4 h-4" />
        </button>
        <button
          type="button"
          onclick={appState.closeLightbox}
          class="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white transition-colors cursor-pointer ml-2"
          title="Close (Esc)"
        >
          <X class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Canvas / Image Container -->
    <div class="flex-1 flex items-center justify-center w-full overflow-hidden">
      {#if appState.lightbox.imageUrl}
        <img
          src={appState.lightbox.imageUrl}
          alt={appState.lightbox.title}
          class="max-w-[85vw] max-h-[75vh] object-contain shadow-2xl rounded-lg transition-transform duration-200 select-none"
          style="transform: scale({appState.lightbox.zoom}) rotate({appState.lightbox.rotation}deg);"
        />
      {:else}
        <div class="w-64 h-80 rounded-lg bg-white/10 flex items-center justify-center text-xs text-white/60">
          No preview available
        </div>
      {/if}
    </div>

    <!-- Bottom Hint -->
    <div class="text-[11px] text-white/50 pt-2 font-mono">
      Shortcuts: + Zoom In • - Zoom Out • R Rotate • Esc Close
    </div>
  </div>
{/if}
