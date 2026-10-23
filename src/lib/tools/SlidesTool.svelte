<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    Layers,
    Download,
    Check,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let currentFile = $state(null);
  let totalSlides = $state(0);
  let slidesPerPage = $state(3); // 2, 3, 4, 6, 9
  let marginPreset = $state('narrow'); // 'narrow' | 'normal' | 'minimal' | 'moderate'
  let showBorders = $state(true);
  let showNotesLines = $state(true);
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
      totalSlides = doc.getPageCount();

      appState.playAudioCue('success');
      appState.showToast(`Loaded presentation with ${totalSlides} slides.`);
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to load PDF: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  async function generateHandouts() {
    isProcessing = true;

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const arrayBuffer = await currentFile.arrayBuffer();
      const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
      const outDoc = await PDFLib.PDFDocument.create();

      // Standard A4 dimensions in points: 595.28 x 841.89
      const A4_WIDTH = 595.28;
      const A4_HEIGHT = 841.89;

      const marginMap = {
        minimal: 18,
        narrow: 28,
        normal: 36,
        moderate: 46
      };
      const margin = marginMap[marginPreset] || 28;

      let cols = 1;
      let rows = 3;
      if (slidesPerPage === 2) { cols = 1; rows = 2; }
      else if (slidesPerPage === 3) { cols = 1; rows = 3; }
      else if (slidesPerPage === 4) { cols = 2; rows = 2; }
      else if (slidesPerPage === 6) { cols = 2; rows = 3; }
      else if (slidesPerPage === 9) { cols = 3; rows = 3; }

      const usableWidth = A4_WIDTH - (margin * 2);
      const usableHeight = A4_HEIGHT - (margin * 2);
      const slotWidth = usableWidth / cols;
      const slotHeight = usableHeight / rows;

      const numA4Pages = Math.ceil(totalSlides / slidesPerPage);

      for (let pageIdx = 0; pageIdx < numA4Pages; pageIdx++) {
        const a4Page = outDoc.addPage([A4_WIDTH, A4_HEIGHT]);

        for (let slot = 0; slot < slidesPerPage; slot++) {
          const slideIndex = (pageIdx * slidesPerPage) + slot;
          if (slideIndex >= totalSlides) break;

          const col = slot % cols;
          const row = Math.floor(slot / cols);

          const [embeddedSlide] = await outDoc.embedPdf(srcDoc, [slideIndex]);
          const slideDims = embeddedSlide.scale(1);

          // Calculate aspect fit within the slot (leaving room for notes if 3 slides per page)
          const targetWidth = (slidesPerPage === 3 && showNotesLines) ? slotWidth * 0.58 : slotWidth * 0.92;
          const targetHeight = slotHeight * 0.88;

          const scaleX = targetWidth / slideDims.width;
          const scaleY = targetHeight / slideDims.height;
          const scale = Math.min(scaleX, scaleY);

          const finalWidth = slideDims.width * scale;
          const finalHeight = slideDims.height * scale;

          const x = margin + (col * slotWidth) + 8;
          const y = A4_HEIGHT - margin - ((row + 1) * slotHeight) + ((slotHeight - finalHeight) / 2);

          a4Page.drawPage(embeddedSlide, {
            x,
            y,
            width: finalWidth,
            height: finalHeight
          });

          if (showBorders) {
            a4Page.drawRectangle({
              x,
              y,
              width: finalWidth,
              height: finalHeight,
              borderColor: PDFLib.rgb(0.7, 0.7, 0.7),
              borderWidth: 0.75
            });
          }

          // Draw note lines if 3 slides/page and enabled
          if (slidesPerPage === 3 && showNotesLines) {
            const lineStartX = x + finalWidth + 18;
            const lineEndX = A4_WIDTH - margin - 10;
            const lineSpacing = finalHeight / 4;

            for (let l = 1; l <= 3; l++) {
              const lineY = y + (l * lineSpacing);
              a4Page.drawLine({
                start: { x: lineStartX, y: lineY },
                end: { x: lineEndX, y: lineY },
                color: PDFLib.rgb(0.8, 0.8, 0.8),
                thickness: 0.75
              });
            }
          }
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `handout_${slidesPerPage}_per_page_${currentFile.name}`;
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

      appState.showToast(`Handout PDF created with ${numA4Pages} A4 pages!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Handout generation failed: ' + err.message, 'error');
    } finally {
      isProcessing = false;
    }
  }

  let calculatedPages = $derived(Math.ceil(totalSlides / slidesPerPage));
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Slides to A4 Handouts
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Format presentation slides into printable A4 handouts with notes.
      </p>
    </div>
  </div>

  {#if !currentFile}
    <label
      class="w-full p-10 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-blue-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
    >
      <input
        type="file"
        accept=".pdf,application/pdf"
        onchange={(e) => handleFileSelected(e.target.files[0])}
        class="hidden"
      />
      <div class="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
        <Layers class="w-6 h-6" />
      </div>
      <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Select presentation PDF
      </span>
      <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Convert 16:9 or 4:3 slide decks into clean study sheets
      </span>
    </label>
  {:else}
    <div class="p-6 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm mb-6 space-y-5">
      <div class="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <div>
          <span class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">{currentFile.name}</span>
          <span class="text-xs text-[#84828e] ml-2">({totalSlides} slides &bull; {calculatedPages} A4 pages)</span>
        </div>
        <button
          type="button"
          onclick={() => (currentFile = null)}
          class="text-xs text-indigo-500 hover:underline cursor-pointer"
        >
          Change file
        </button>
      </div>

      <!-- Slides per page selection -->
      <div class="space-y-2">
        <span class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
          Slides per A4 page:
        </span>
        <div class="grid grid-cols-5 gap-2">
          {#each [2, 3, 4, 6, 9] as num}
            <button
              type="button"
              onclick={() => (slidesPerPage = num)}
              class="py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer {slidesPerPage === num
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-black/[0.03] dark:bg-white/[0.05] text-[#52505d] dark:text-[#9e9cb0] hover:text-[#1c1b22] dark:hover:text-white'}"
            >
              {num} Slides
            </button>
          {/each}
        </div>
      </div>

      <!-- Settings row -->
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
        <div>
          <label for="marginSelect" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] block mb-1.5">
            Page Margins:
          </label>
          <select
            id="marginSelect"
            bind:value={marginPreset}
            class="w-full px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs text-[#1c1b22] dark:text-[#f2f1f7]"
          >
            <option value="minimal">Minimal (Max printable area)</option>
            <option value="narrow">Narrow (Recommended)</option>
            <option value="normal">Normal (Standard)</option>
            <option value="moderate">Moderate (Wide margins)</option>
          </select>
        </div>

        <div class="flex items-center gap-2 pt-6">
          <input
            id="showBordersCheck"
            type="checkbox"
            bind:checked={showBorders}
            class="w-4 h-4 rounded text-blue-600 cursor-pointer"
          />
          <label for="showBordersCheck" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] cursor-pointer">
            Draw slide borders
          </label>
        </div>

        {#if slidesPerPage === 3}
          <div class="flex items-center gap-2 pt-6">
            <input
              id="showNotesCheck"
              type="checkbox"
              bind:checked={showNotesLines}
              class="w-4 h-4 rounded text-blue-600 cursor-pointer"
            />
            <label for="showNotesCheck" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0] cursor-pointer">
              Include audience note lines
            </label>
          </div>
        {/if}
      </div>
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex items-center justify-end">
      <button
        type="button"
        onclick={generateHandouts}
        disabled={isProcessing}
        class="inline-flex items-center gap-2 px-6 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isProcessing}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Generating Handouts...</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Export Handouts ({calculatedPages} pages)</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
