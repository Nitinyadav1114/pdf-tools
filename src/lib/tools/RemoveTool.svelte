<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded, ensurePdfJsLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    FileText,
    Scissors,
    RotateCw,
    Download,
    Eye,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let totalPages = $state(0);
  let pageList = $state([]); // array of { pageNum: number, selectedForRemoval: boolean, rotation: number, thumbUrl: '' }
  let customRange = $state('');
  let isProcessing = $state(false);
  let statusText = $state('');

  async function handleFileSelected(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      appState.showToast('Please select a valid PDF file.', 'error');
      return;
    }

    currentFile = file;
    isProcessing = true;
    statusText = 'Loading document pages...';

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      totalPages = doc.getPageCount();

      pageList = Array.from({ length: totalPages }, (_, i) => ({
        pageNum: i + 1,
        selectedForRemoval: false,
        rotation: 0,
        thumbUrl: ''
      }));

      appState.playAudioCue('success');
      appState.showToast(`Loaded ${totalPages} pages. Click pages to select for removal.`);
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to load PDF: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  function togglePage(pageNum) {
    pageList = pageList.map(p => {
      if (p.pageNum === pageNum) {
        return { ...p, selectedForRemoval: !p.selectedForRemoval };
      }
      return p;
    });
    appState.playAudioCue('toggle');
  }

  function rotatePage(pageNum) {
    pageList = pageList.map(p => {
      if (p.pageNum === pageNum) {
        return { ...p, rotation: (p.rotation + 90) % 360 };
      }
      return p;
    });
    appState.playAudioCue('toggle');
  }

  function applyCustomRange() {
    if (!customRange.trim()) return;
    const toRemove = new Set();
    const parts = customRange.split(',').map(s => s.trim());
    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
            if (p >= 1 && p <= totalPages) toRemove.add(p);
          }
        }
      } else {
        const p = Number(part);
        if (!isNaN(p) && p >= 1 && p <= totalPages) {
          toRemove.add(p);
        }
      }
    }

    pageList = pageList.map(p => ({
      ...p,
      selectedForRemoval: toRemove.has(p.pageNum)
    }));
    appState.playAudioCue('toggle');
    appState.showToast(`Selected ${toRemove.size} pages from range.`);
  }

  async function exportCleanedPdf() {
    const keepIndices = pageList
      .filter(p => !p.selectedForRemoval)
      .map(p => p.pageNum - 1);

    if (keepIndices.length === 0) {
      appState.showToast('You cannot remove all pages. At least 1 page must remain.', 'error');
      return;
    }

    isProcessing = true;
    statusText = 'Exporting cleaned PDF...';

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await currentFile.arrayBuffer();
      const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const outDoc = await PDFLib.PDFDocument.create();

      const copiedPages = await outDoc.copyPages(srcDoc, keepIndices);
      copiedPages.forEach((page, idx) => {
        const originalPageNum = keepIndices[idx] + 1;
        const pageItem = pageList.find(p => p.pageNum === originalPageNum);
        if (pageItem && pageItem.rotation !== 0) {
          const currentRotation = page.getRotation().angle;
          page.setRotation(PDFLib.degrees((currentRotation + pageItem.rotation) % 360));
        }
        outDoc.addPage(page);
      });

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `cleaned_${currentFile.name}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(1);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Cleaned PDF exported with ${keepIndices.length} pages!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Export failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  let remainingCount = $derived(pageList.filter(p => !p.selectedForRemoval).length);
  let removedCount = $derived(pageList.filter(p => p.selectedForRemoval).length);
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Remove Pages
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Select and delete unwanted pages or rotate orientations.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <!-- Upload Dropzone -->
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-rose-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <UploadCloud class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select PDF to remove pages
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Works 100% in-browser on your device
      </span>
    </label>
  {:else}
    <!-- Controls Toolbar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <input
          type="text"
          bind:value={customRange}
          placeholder="e.g. 1-3, 5, 8"
          class="px-3 py-1.5 text-xs rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-[#1c1b22] dark:text-[#f2f1f7] outline-none"
        />
        <button
          type="button"
          onclick={applyCustomRange}
          class="px-3 py-1.5 rounded-xl text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-[#52505d] dark:text-[#9e9cb0] transition-colors cursor-pointer"
        >
          Select Range
        </button>
      </div>

      <div class="flex items-center gap-2 text-xs font-semibold">
        <span class="text-emerald-500">{remainingCount} pages kept</span>
        <span class="text-[#84828e]">•</span>
        <span class="text-rose-500">{removedCount} pages removed</span>
      </div>
    </div>

    <!-- Page Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
      {#each pageList as page (page.pageNum)}
        <div
          class="relative rounded-2xl border p-3 flex flex-col items-center justify-between transition-all select-none {page.selectedForRemoval
            ? 'bg-rose-500/10 border-rose-500/40 opacity-60'
            : 'bg-white dark:bg-[#1a1924] border-black/[0.08] dark:border-white/[0.08] hover:border-indigo-500/40'}"
        >
          <!-- Page Header Badge -->
          <div class="w-full flex items-center justify-between mb-2">
            <span class="text-[11px] font-bold text-[#52505d] dark:text-[#9e9cb0]">
              Page {page.pageNum}
            </span>
            <button
              type="button"
              onclick={() => rotatePage(page.pageNum)}
              class="p-1 rounded text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white cursor-pointer"
              title="Rotate 90° CW"
            >
              <RotateCw class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Page Mock Preview Area -->
          <button
            type="button"
            onclick={() => togglePage(page.pageNum)}
            class="w-full h-28 rounded-lg bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-center cursor-pointer transition-transform hover:scale-102"
            style="transform: rotate({page.rotation}deg);"
          >
            {#if page.selectedForRemoval}
              <div class="px-2 py-1 rounded bg-rose-500 text-white text-[10px] font-bold">
                REMOVED
              </div>
            {:else}
              <FileText class="w-8 h-8 text-[#84828e] opacity-40" />
            {/if}
          </button>
        </div>
      {/each}
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-between">
      <button
        type="button"
        onclick={() => { currentFile = null; pageList = []; }}
        class="text-xs text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white cursor-pointer"
      >
        Choose different file
      </button>

      <button
        type="button"
        onclick={exportCleanedPdf}
        disabled={isProcessing || remainingCount === 0}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Processing...</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Export Cleaned PDF ({remainingCount} pages)</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
