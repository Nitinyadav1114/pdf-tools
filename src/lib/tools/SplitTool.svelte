<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded } from '../core/engine-loader.js';
  import { createZipArchive } from '../core/zip-builder.js';
  import {
    UploadCloud,
    Split,
    Download,
    Archive,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let totalPages = $state(0);
  let splitMode = $state('range'); // 'range' | 'fixed'
  let rangeInput = $state('1-2, 3-4');
  let fixedCount = $state(1);
  let isProcessing = $state(false);

  async function handleFileSelected(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      appState.showToast('Please select a valid PDF file.', 'error');
      return;
    }

    currentFile = file;
    isProcessing = true;

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      totalPages = doc.getPageCount();

      rangeInput = `1-${Math.ceil(totalPages / 2)}, ${Math.ceil(totalPages / 2) + 1}-${totalPages}`;
      appState.playAudioCue('success');
      appState.showToast(`Loaded ${currentFile.name} with ${totalPages} pages.`);
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to load PDF: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function splitPdf() {
    isProcessing = true;

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await currentFile.arrayBuffer();
      const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

      const parts = [];

      if (splitMode === 'fixed') {
        const chunkSize = Math.max(1, fixedCount);
        let partIndex = 1;
        for (let i = 0; i < totalPages; i += chunkSize) {
          const outDoc = await PDFLib.PDFDocument.create();
          const indices = [];
          for (let j = i; j < Math.min(i + chunkSize, totalPages); j++) {
            indices.push(j);
          }
          const copied = await outDoc.copyPages(srcDoc, indices);
          copied.forEach(p => outDoc.addPage(p));
          const bytes = await outDoc.save();
          parts.push({
            name: `part_${partIndex}_pages_${i + 1}-${Math.min(i + chunkSize, totalPages)}.pdf`,
            data: bytes
          });
          partIndex++;
        }
      } else {
        const groups = rangeInput.split(',').map(s => s.trim()).filter(Boolean);
        let partIdx = 1;
        for (const grp of groups) {
          let indices = [];
          if (grp.includes('-')) {
            const [s, e] = grp.split('-').map(Number);
            if (!isNaN(s) && !isNaN(e)) {
              for (let p = Math.min(s, e); p <= Math.max(s, e); p++) {
                if (p >= 1 && p <= totalPages) indices.push(p - 1);
              }
            }
          } else {
            const p = Number(grp);
            if (!isNaN(p) && p >= 1 && p <= totalPages) indices.push(p - 1);
          }

          if (indices.length > 0) {
            const outDoc = await PDFLib.PDFDocument.create();
            const copied = await outDoc.copyPages(srcDoc, indices);
            copied.forEach(p => outDoc.addPage(p));
            const bytes = await outDoc.save();
            parts.push({
              name: `part_${partIdx}_pages_${grp}.pdf`,
              data: bytes
            });
            partIdx++;
          }
        }
      }

      if (parts.length === 0) {
        appState.showToast('No valid pages found to split.', 'error');
        return;
      }

      if (parts.length === 1) {
        const blob = new Blob([parts[0].data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = parts[0].name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      } else {
        const zipBytes = createZipArchive(parts);
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `split_${currentFile.name.replace(/\.[^/.]+$/, '')}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }

      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(parts.length);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Successfully created ${parts.length} split parts!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Split failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Split PDF
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Extract page ranges or burst document into multiple files.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-amber-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <UploadCloud class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select PDF to split
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Supports single range extraction or multi-part ZIP export
      </span>
    </label>
  {:else}
    <div class="p-6 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6">
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <span class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">{currentFile.name}</span>
          <span class="text-xs text-[#84828e] ml-2">({totalPages} total pages)</span>
        </div>
        <button
          type="button"
          onclick={() => (currentFile = null)}
          class="text-xs text-indigo-500 hover:underline cursor-pointer"
        >
          Change file
        </button>
      </div>

      <!-- Mode Selector -->
      <div class="flex items-center gap-2 mb-5">
        <button
          type="button"
          onclick={() => (splitMode = 'range')}
          class="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all {splitMode === 'range'
            ? 'bg-amber-500 text-white shadow-md'
            : 'bg-black/[0.03] dark:bg-white/[0.05] text-[#52505d] dark:text-[#9e9cb0]'}"
        >
          Custom Ranges
        </button>
        <button
          type="button"
          onclick={() => (splitMode = 'fixed')}
          class="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer transition-all {splitMode === 'fixed'
            ? 'bg-amber-500 text-white shadow-md'
            : 'bg-black/[0.03] dark:bg-white/[0.05] text-[#52505d] dark:text-[#9e9cb0]'}"
        >
          Fixed Page Chunks
        </button>
      </div>

      {#if splitMode === 'range'}
        <div class="space-y-2">
          <label for="splitRangeInput" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
            Comma-separated page ranges (e.g. 1-2, 3-5, 6):
          </label>
          <input
            id="splitRangeInput"
            type="text"
            bind:value={rangeInput}
            class="w-full px-4 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs sm:text-sm text-[#1c1b22] dark:text-[#f2f1f7] outline-none"
          />
        </div>
      {:else}
        <div class="space-y-2">
          <label for="splitChunkInput" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
            Split into documents of every N pages:
          </label>
          <input
            id="splitChunkInput"
            type="number"
            min="1"
            max={totalPages}
            bind:value={fixedCount}
            class="w-28 px-4 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs sm:text-sm text-[#1c1b22] dark:text-[#f2f1f7] outline-none"
          />
        </div>
      {/if}
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={splitPdf}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg shadow-amber-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Splitting document...</span>
        {:else}
          <Archive class="w-4 h-4" />
          <span>Split & Download</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
