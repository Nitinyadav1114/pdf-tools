<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    Images,
    Download,
    ArrowUp,
    ArrowDown,
    Trash2,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let imageFiles = $state([]);
  let pageFit = $state('a4'); // 'a4' | 'fit'
  let orientation = $state('auto'); // 'auto' | 'portrait' | 'landscape'
  let isProcessing = $state(false);

  function handleFilesAdded(files) {
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (valid.length === 0) {
      appState.showToast('Please select valid image files (JPG, PNG, WebP).', 'error');
      return;
    }

    const items = valid.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB',
      previewUrl: URL.createObjectURL(file)
    }));

    imageFiles = [...imageFiles, ...items];
    appState.playAudioCue('toggle');
  }

  function removeImage(id) {
    const item = imageFiles.find(img => img.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    imageFiles = imageFiles.filter(img => img.id !== id);
    appState.playAudioCue('toggle');
  }

  function moveImage(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= imageFiles.length) return;
    const item = imageFiles[index];
    const updated = [...imageFiles];
    updated.splice(index, 1);
    updated.splice(target, 0, item);
    imageFiles = updated;
    appState.playAudioCue('toggle');
  }

  async function convertToPdf() {
    if (imageFiles.length === 0) return;
    isProcessing = true;

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const outDoc = await PDFLib.PDFDocument.create();

      const A4_W = 595.28;
      const A4_H = 841.89;

      for (const item of imageFiles) {
        const bytes = await item.file.arrayBuffer();
        let embedded = null;

        if (item.file.type === 'image/jpeg' || item.name.toLowerCase().endsWith('.jpg') || item.name.toLowerCase().endsWith('.jpeg')) {
          embedded = await outDoc.embedJpg(bytes);
        } else {
          // PNG or convert canvas to PNG
          try {
            embedded = await outDoc.embedPng(bytes);
          } catch (e) {
            // Fallback for WebP / unsupported PNGs
            const bmp = await createImageBitmap(item.file);
            const canvas = document.createElement('canvas');
            canvas.width = bmp.width;
            canvas.height = bmp.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bmp, 0, 0);
            const pngBlob = await new Promise(r => canvas.toBlob(r, 'image/png'));
            const pngBytes = await pngBlob.arrayBuffer();
            embedded = await outDoc.embedPng(pngBytes);
          }
        }

        const dims = embedded.scale(1);
        let pageWidth = A4_W;
        let pageHeight = A4_H;

        if (pageFit === 'fit') {
          pageWidth = dims.width;
          pageHeight = dims.height;
          const page = outDoc.addPage([pageWidth, pageHeight]);
          page.drawImage(embedded, { x: 0, y: 0, width: pageWidth, height: pageHeight });
        } else {
          // A4 layout
          let isLandscape = dims.width > dims.height;
          if (orientation === 'landscape') isLandscape = true;
          if (orientation === 'portrait') isLandscape = false;

          pageWidth = isLandscape ? A4_H : A4_W;
          pageHeight = isLandscape ? A4_W : A4_H;

          const margin = 20;
          const scale = Math.min((pageWidth - margin * 2) / dims.width, (pageHeight - margin * 2) / dims.height);
          const scaledW = dims.width * scale;
          const scaledH = dims.height * scale;
          const x = (pageWidth - scaledW) / 2;
          const y = (pageHeight - scaledH) / 2;

          const page = outDoc.addPage([pageWidth, pageHeight]);
          page.drawImage(embedded, { x, y, width: scaledW, height: scaledH });
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `converted_images_${imageFiles.length}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(imageFiles.length);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Converted ${imageFiles.length} photos into PDF!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Conversion failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Images to PDF
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Convert JPG, PNG, and WebP photos into a clean PDF document.
      </p>
    </div>
  </div>

  <!-- Upload Dropzone -->
  <label
    class="w-full p-8 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-teal-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group mb-6"
  >
    <input
      type="file"
      multiple
      accept="image/*"
      onchange={(e) => handleFilesAdded(e.target.files)}
      class="hidden"
    />
    <div class="w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
      <Images class="w-6 h-6" />
    </div>
    <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
      Add photos or drag & drop here
    </span>
    <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
      Supports JPG, PNG, and WebP formats
    </span>
  </label>

  {#if imageFiles.length > 0}
    <!-- Settings Card -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-4">
        <div>
          <label for="fitSelect" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] block mb-1">
            Page Sizing:
          </label>
          <select
            id="fitSelect"
            bind:value={pageFit}
            class="px-3 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1c1b22] dark:text-[#f2f1f7]"
          >
            <option value="a4">Standard A4 Sheet</option>
            <option value="fit">Fit Exact Photo Dimensions</option>
          </select>
        </div>

        {#if pageFit === 'a4'}
          <div>
            <label for="orientSelect" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] block mb-1">
              Orientation:
            </label>
            <select
              id="orientSelect"
              bind:value={orientation}
              class="px-3 py-1.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1c1b22] dark:text-[#f2f1f7]"
            >
              <option value="auto">Auto (Match Image Ratio)</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </div>
        {/if}
      </div>

      <span class="text-xs font-bold text-teal-600 dark:text-teal-400">
        {imageFiles.length} images queued
      </span>
    </div>

    <!-- Images Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
      {#each imageFiles as img, idx (img.id)}
        <div class="p-2.5 rounded-2xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm flex flex-col items-center">
          <img
            src={img.previewUrl}
            alt={img.name}
            class="w-full h-32 object-cover rounded-xl mb-2"
          />
          <div class="w-full flex items-center justify-between text-xs">
            <span class="truncate max-w-[100px] text-[#52505d] dark:text-[#9e9cb0] text-[11px]">
              {img.name}
            </span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                onclick={() => moveImage(idx, -1)}
                disabled={idx === 0}
                class="p-1 text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white disabled:opacity-20 cursor-pointer"
              >
                <ArrowUp class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onclick={() => moveImage(idx, 1)}
                disabled={idx === imageFiles.length - 1}
                class="p-1 text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white disabled:opacity-20 cursor-pointer"
              >
                <ArrowDown class="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onclick={() => removeImage(img.id)}
                class="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer"
              >
                <Trash2 class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={convertToPdf}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-lg shadow-teal-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Converting photos...</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Convert {imageFiles.length} Photos to PDF</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
