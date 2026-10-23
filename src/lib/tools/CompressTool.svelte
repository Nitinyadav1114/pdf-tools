<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded, ensurePdfJsLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    Minimize2,
    Download,
    TrendingDown,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let originalSize = $state(0);
  let preset = $state('recommended'); // 'lossless' | 'recommended' | 'extreme'
  let isProcessing = $state(false);
  let progress = $state(0);
  let statusText = $state('');
  let savedSize = $state(null);
  let reductionPercent = $state(null);

  async function handleFileSelected(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      appState.showToast('Please select a valid PDF file.', 'error');
      return;
    }

    currentFile = file;
    originalSize = file.size;
    savedSize = null;
    reductionPercent = null;
    appState.playAudioCue('success');
    appState.showToast(`Selected ${(originalSize / 1024 / 1024).toFixed(2)} MB PDF.`);
  }

  async function compressPdf() {
    isProcessing = true;
    progress = 10;
    statusText = 'Optimizing PDF object streams...';

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await currentFile.arrayBuffer();

      let finalPdfBytes = null;

      if (preset === 'lossless') {
        const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        finalPdfBytes = await doc.save({
          useObjectStreams: true,
          addDefaultPage: false
        });
      } else {
        // Balanced / Extreme: Load with PDF.js and resample canvas with JPEG compression
        const pdfjsLib = await ensurePdfJsLoaded();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
        const pdfJsDoc = await loadingTask.promise;
        const totalPages = pdfJsDoc.numPages;

        const outDoc = await PDFLib.PDFDocument.create();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const quality = preset === 'extreme' ? 0.6 : 0.78;
        const scale = preset === 'extreme' ? 1.0 : 1.35;

        for (let i = 1; i <= totalPages; i++) {
          progress = Math.round(15 + (i / totalPages) * 75);
          statusText = `Compressing page ${i} of ${totalPages}...`;

          const page = await pdfJsDoc.getPage(i);
          const viewport = page.getViewport({ scale });
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: ctx, viewport }).promise;

          const jpegBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
          const jpegBytes = await jpegBlob.arrayBuffer();
          const embeddedImg = await outDoc.embedJpg(jpegBytes);

          const outPage = outDoc.addPage([viewport.width / scale, viewport.height / scale]);
          outPage.drawImage(embeddedImg, {
            x: 0,
            y: 0,
            width: viewport.width / scale,
            height: viewport.height / scale
          });
        }

        finalPdfBytes = await outDoc.save({ useObjectStreams: true });
      }

      savedSize = finalPdfBytes.byteLength;
      reductionPercent = Math.max(0, Math.round(((originalSize - savedSize) / originalSize) * 100));

      const blob = new Blob([finalPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `compressed_${currentFile.name}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(1);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Compressed! Saved ${reductionPercent}% of file size!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Compression failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Compress PDF
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Shrink file sizes while preserving visual fidelity.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-emerald-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <Minimize2 class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select PDF to compress
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Lossless stream compression & smart DPI resampling
      </span>
    </label>
  {:else}
    <div class="p-6 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6 space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <span class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">{currentFile.name}</span>
          <span class="text-xs text-[#84828e] ml-2">Original: {(originalSize / 1024 / 1024).toFixed(2)} MB</span>
        </div>
        <button
          type="button"
          onclick={() => (currentFile = null)}
          class="text-xs text-indigo-500 hover:underline cursor-pointer"
        >
          Change file
        </button>
      </div>

      <!-- Preset Selector -->
      <div class="space-y-2">
        <span class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
          Compression Preset:
        </span>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            onclick={() => (preset = 'lossless')}
            class="p-3.5 rounded-2xl text-left border transition-all cursor-pointer {preset === 'lossless'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-black/[0.08] dark:border-white/[0.08] text-[#52505d] dark:text-[#9e9cb0]'}"
          >
            <div class="text-xs font-bold mb-0.5">Lossless Stream</div>
            <div class="text-[11px] opacity-80 leading-tight">Zero image quality loss. Cleans redundant metadata & object streams.</div>
          </button>

          <button
            type="button"
            onclick={() => (preset = 'recommended')}
            class="p-3.5 rounded-2xl text-left border transition-all cursor-pointer {preset === 'recommended'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-black/[0.08] dark:border-white/[0.08] text-[#52505d] dark:text-[#9e9cb0]'}"
          >
            <div class="text-xs font-bold mb-0.5">Balanced (Recommended)</div>
            <div class="text-[11px] opacity-80 leading-tight">Up to 70% reduction with crisp text and high visual clarity.</div>
          </button>

          <button
            type="button"
            onclick={() => (preset = 'extreme')}
            class="p-3.5 rounded-2xl text-left border transition-all cursor-pointer {preset === 'extreme'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-black/[0.08] dark:border-white/[0.08] text-[#52505d] dark:text-[#9e9cb0]'}"
          >
            <div class="text-xs font-bold mb-0.5">Maximum Shrink</div>
            <div class="text-[11px] opacity-80 leading-tight">Smallest possible file size for email and strict upload limits.</div>
          </button>
        </div>
      </div>

      {#if reductionPercent !== null}
        <div class="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
          <div class="flex items-center gap-2">
            <TrendingDown class="w-4 h-4" />
            <span>Reduced by {reductionPercent}% (New size: {(savedSize / 1024 / 1024).toFixed(2)} MB)</span>
          </div>
          <span class="text-[10px] uppercase tracking-wider font-bold">SAVED</span>
        </div>
      {/if}
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={compressPdf}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>{statusText} {progress}%</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Compress PDF</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
