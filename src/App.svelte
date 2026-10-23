<script>
  import { appState } from './lib/stores/appState.svelte.js';
  import Header from './lib/components/Header.svelte';
  import NavTabs from './lib/components/NavTabs.svelte';
  import CommandPalette from './lib/components/CommandPalette.svelte';
  import Lightbox from './lib/components/Lightbox.svelte';
  import MobileNavDock from './lib/components/MobileNavDock.svelte';

  // Tools
  import HomeHub from './lib/tools/HomeHub.svelte';
  import MergeTool from './lib/tools/MergeTool.svelte';
  import RemoveTool from './lib/tools/RemoveTool.svelte';
  import SplitTool from './lib/tools/SplitTool.svelte';
  import SlidesTool from './lib/tools/SlidesTool.svelte';
  import InvertTool from './lib/tools/InvertTool.svelte';
  import CompressTool from './lib/tools/CompressTool.svelte';
  import ImagesToPdfTool from './lib/tools/ImagesToPdfTool.svelte';
  import PdfToImagesTool from './lib/tools/PdfToImagesTool.svelte';

  // Sync hash routing on popstate / initial load
  $effect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '');
      const validTabs = ['home', 'merge', 'remove', 'split', 'slides', 'invert', 'compress', 'images', 'pdftoimages'];
      if (validTabs.includes(hash)) {
        appState.switchTab(hash);
      }

      const handleHashChange = () => {
        const h = window.location.hash.replace('#', '');
        if (validTabs.includes(h)) {
          appState.switchTab(h);
        }
      };

      window.addEventListener('hashchange', handleHashChange);
      return () => window.removeEventListener('hashchange', handleHashChange);
    }
  });
</script>

<div class="min-h-screen flex flex-col justify-between py-6 px-4 sm:px-6 max-w-6xl mx-auto pb-24 sm:pb-8">
  <div class="w-full">
    <!-- Top Header -->
    <Header />

    <!-- Navigation Tabs -->
    <NavTabs />

    <!-- Active Tool Container -->
    <main class="w-full py-2">
      {#if appState.currentTab === 'home'}
        <HomeHub />
      {:else if appState.currentTab === 'merge'}
        <MergeTool />
      {:else if appState.currentTab === 'remove'}
        <RemoveTool />
      {:else if appState.currentTab === 'split'}
        <SplitTool />
      {:else if appState.currentTab === 'slides'}
        <SlidesTool />
      {:else if appState.currentTab === 'invert'}
        <InvertTool />
      {:else if appState.currentTab === 'compress'}
        <CompressTool />
      {:else if appState.currentTab === 'images'}
        <ImagesToPdfTool />
      {:else if appState.currentTab === 'pdftoimages'}
        <PdfToImagesTool />
      {/if}
    </main>
  </div>

  <!-- Global Modals & Controls -->
  <CommandPalette />
  <Lightbox />
  <MobileNavDock />

  <!-- Toast Notification Overlay -->
  {#if appState.toast.visible}
    <div
      class="fixed bottom-20 sm:bottom-6 right-6 z-50 px-4 py-3 rounded-2xl bg-[#0f0e16]/95 dark:bg-[#1a1924]/95 text-white text-xs font-semibold shadow-2xl border border-white/10 backdrop-blur-xl flex items-center gap-2 animate-bounce"
      role="status"
    >
      <span>{appState.toast.message}</span>
    </div>
  {/if}

  <!-- Footer -->
  <footer class="w-full text-center py-6 border-t border-black/[0.04] dark:border-white/[0.06] text-xs text-[#84828e] mt-12">
    <p>100% Client-Side In-Browser PDF Suite &bull; Zero Server Uploads &bull; Private & Offline</p>
  </footer>
</div>
