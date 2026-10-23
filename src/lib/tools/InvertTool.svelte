<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded, ensurePdfJsLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    SunMoon,
    Download,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let totalPages = $state(0);
  let mode = $state('ink_saver'); // 'ink_saver' | 'pure_invert'
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
    statusText = 'Loading PDF...';

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await file.arrayBuffer();
      const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      totalPages = doc.getPageCount();

      appState.playAudioCue('success');
      appState.showToast(`Loaded document with ${totalPages} pages.`);
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to load PDF: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function invertPdf() {
    isProcessing = true;
    progress = 5;
    statusText = 'Initializing PDF engine...';

    try {
      const [PDFLib, pdfjsLib] = await Promise.all([ensurePdfLibLoaded(), ensurePdfJsLoaded()]);
      const arrayBuffer = await currentFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdfJsDoc = await loadingTask.promise;
      const outDoc = await PDFLib.PDFDocument.create();

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        progress = Math.round(10 + (pageNum / totalPages) * 80);
        statusText = `Processing page ${pageNum} of ${totalPages}...`;

        const page = await pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport }).promise;

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Invert pixels
        for (let i = 0; i < data.length; i += 4) {
          if (mode === 'ink_saver') {
            // Dark slide background detection: if pixel is dark (r+g+b < 380), invert to light
            const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            if (luminance < 128) {
              data[i] = 255 - data[i];
              data[i + 1] = 255 - data[i + 1];
              data[i + 2] = 255 - data[i + 2];
            }
          } else {
            // Pure invert
            data[i] = 255 - data[i];
            data[i + 1] = 255 - data[i + 1];
            data[i + 2] = 255 - data[i + 2];
          }
        }
        ctx.putImageData(imgData, 0, 0);

        const jpegBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
        const jpegBytes = await jpegBlob.arrayBuffer();
        const embeddedImg = await outDoc.embedJpg(jpegBytes);

        const outPage = outDoc.addPage([viewport.width / 1.5, viewport.height / 1.5]);
        outPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: viewport.width / 1.5,
          height: viewport.height / 1.5
        });
      }

      statusText = 'Saving final document...';
      progress = 95;
      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `inverted_${currentFile.name}`;
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

      appState.showToast(`Inverted PDF exported with ${totalPages} pages!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Invert failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Invert Colors & Ink Saver
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Convert dark slides into clean white paper to save up to 90% printer toner.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-purple-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <SunMoon class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select presentation PDF to invert
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Ideal for dark conference decks and lecture slides
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

      <div class="space-y-2">
        <span class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
          Inversion Mode:
        </span>
        <div class="grid grid-cols-2 gap-3">
          <button
            type="button"
            onclick={() => (mode = 'ink_saver')}
            class="p-3.5 rounded-2xl text-left border transition-all cursor-pointer {mode === 'ink_saver'
              ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400'
              : 'border-black/[0.08] dark:border-white/[0.08] text-[#52505d] dark:text-[#9e9cb0]'}"
          >
            <div class="text-xs font-bold mb-0.5">Smart Ink Saver (Recommended)</div>
            <div class="text-[11px] opacity-80 leading-tight">
              Inverts dark backgrounds to pure white while preserving colored charts and diagrams.
            </div>
          </button>
          <button
            type="button"
            onclick={() => (mode = 'pure_invert')}
            class="p-3.5 rounded-2xl text-left border transition-all cursor-pointer {mode === 'pure_invert'
              ? 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400'
              : 'border-black/[0.08] dark:border-white/[0.08] text-[#52505d] dark:text-[#9e9cb0]'}"
          >
            <div class="text-xs font-bold mb-0.5">Pure Color Invert</div>
            <div class="text-[11px] opacity-80 leading-tight">
              Flips all RGB values across the entire document (negative image effect).
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={invertPdf}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>{statusText} {progress}%</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Invert & Export PDF</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
