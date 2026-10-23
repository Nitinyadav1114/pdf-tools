<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfJsLoaded } from '../core/engine-loader.js';
  import { createZipArchive } from '../core/zip-builder.js';
  import {
    UploadCloud,
    FileImage,
    Archive,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let totalPages = $state(0);
  let format = $state('image/jpeg'); // 'image/jpeg' | 'image/png'
  let dpi = $state(150); // 150 | 300
  let isProcessing = $state(false);
  let progress = $state(0);
  let statusText = $state('');

  async function handleFileSelected(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      appState.showToast('Please select a valid PDF file.', 'error');
      return;
    }

    currentFile = file;
    isProcessing = true;
    statusText = 'Inspecting document pages...';

    try {
      const pdfjsLib = await ensurePdfJsLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const doc = await loadingTask.promise;
      totalPages = doc.numPages;

      appState.playAudioCue('success');
      appState.showToast(`Loaded ${currentFile.name} with ${totalPages} pages.`);
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to load PDF: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function extractImages() {
    isProcessing = true;
    progress = 5;
    statusText = 'Starting page extraction...';

    try {
      const pdfjsLib = await ensurePdfJsLoaded();
      const arrayBuffer = await currentFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const doc = await loadingTask.promise;

      const scale = dpi === 300 ? 2.08 : 1.04;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const files = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        progress = Math.round(10 + (pageNum / totalPages) * 80);
        statusText = `Rendering page ${pageNum} of ${totalPages}...`;

        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const ext = format === 'image/png' ? 'png' : 'jpg';
        const blob = await new Promise(r => canvas.toBlob(r, format, 0.92));
        const bytes = new Uint8Array(await blob.arrayBuffer());

        files.push({
          name: `page_${String(pageNum).padStart(3, '0')}.${ext}`,
          data: bytes
        });
      }

      statusText = 'Packing into ZIP archive...';
      progress = 95;
      const zipBytes = createZipArchive(files);
      const zipBlob = new Blob([zipBytes], { type: 'application/zip' });
      const url = URL.createObjectURL(zipBlob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `${currentFile.name.replace(/\.[^/.]+$/, '')}_images.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(totalPages);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Extracted ${totalPages} pages into ZIP!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Extraction failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        PDF to Images
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Export PDF pages into high-resolution JPG or PNG images and download as ZIP.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-sky-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <FileImage class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select PDF to extract images
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Renders all pages locally with zero upload queues
      </span>
    </label>
  {:else}
    <div class="p-6 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6 space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <span class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">{currentFile.name}</span>
          <span class="text-xs text-[#84828e] ml-2">({totalPages} pages)</span>
        </div>
        <button
          type="button"
          onclick={() => (currentFile = null)}
          class="text-xs text-indigo-500 hover:underline cursor-pointer"
        >
          Change file
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label for="formatSelect" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] block mb-1.5">
            Image Format:
          </label>
          <select
            id="formatSelect"
            bind:value={format}
            class="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1c1b22] dark:text-[#f2f1f7]"
          >
            <option value="image/jpeg">JPEG (Smaller file size)</option>
            <option value="image/png">PNG (Lossless & transparent)</option>
          </select>
        </div>

        <div>
          <label for="dpiSelect" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] block mb-1.5">
            Resolution (DPI):
          </label>
          <select
            id="dpiSelect"
            bind:value={dpi}
            class="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1c1b22] dark:text-[#f2f1f7]"
          >
            <option value={150}>150 DPI (Standard Screen Quality)</option>
            <option value={300}>300 DPI (High-Res Print Quality)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={extractImages}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-lg shadow-sky-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>{statusText} {progress}%</span>
        {:else}
          <Archive class="w-4 h-4" />
          <span>Extract {totalPages} Pages as ZIP</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
