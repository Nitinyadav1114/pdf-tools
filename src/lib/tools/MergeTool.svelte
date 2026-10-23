<script>
  import { appState } from '../stores/appState.svelte.js';
  import { ensurePdfLibLoaded } from '../core/engine-loader.js';
  import {
    UploadCloud,
    FileText,
    ArrowUp,
    ArrowDown,
    Trash2,
    Calendar,
    Download,
    Check,
    AlertCircle,
    Loader2
  } from '@lucide/svelte';
  import confetti from 'canvas-confetti';

  let files = $state([]);
  let outputFilename = $state('merged_document.pdf');
  let isMerging = $state(false);
  let progress = $state(0);
  let statusText = $state('');

  function handleFilesAdded(newFiles) {
    const pdfs = Array.from(newFiles).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (pdfs.length === 0) {
      appState.showToast('Please select valid PDF files.', 'error');
      return;
    }

    const fileObjects = pdfs.map(file => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      name: file.name,
      size: (file.size / 1024 / 1024).toFixed(2),
      lastModified: file.lastModified
    }));

    files = [...files, ...fileObjects];
    appState.playAudioCue('toggle');
  }

  function removeFile(id) {
    files = files.filter(f => f.id !== id);
    appState.playAudioCue('toggle');
  }

  function moveFile(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= files.length) return;
    const item = files[index];
    const newFiles = [...files];
    newFiles.splice(index, 1);
    newFiles.splice(targetIndex, 0, item);
    files = newFiles;
    appState.playAudioCue('toggle');
  }

  function sortByDate(ascending = true) {
    files = [...files].sort((a, b) => {
      return ascending ? a.lastModified - b.lastModified : b.lastModified - a.lastModified;
    });
    appState.playAudioCue('toggle');
    appState.showToast(ascending ? 'Sorted by oldest first.' : 'Sorted by newest first.');
  }

  async function mergePdfs() {
    if (files.length < 2) {
      appState.showToast('Please add at least 2 PDF files to merge.', 'error');
      return;
    }

    isMerging = true;
    progress = 5;
    statusText = 'Loading PDF engine...';

    try {
      const PDFLib = await ensurePdfLibLoaded();
      const mergedPdf = await PDFLib.PDFDocument.create();

      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        statusText = `Processing file ${i + 1} of ${files.length}: ${item.name}...`;
        progress = Math.round(10 + (i / files.length) * 80);

        const arrayBuffer = await item.file.arrayBuffer();
        const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const copiedPages = await mergedPdf.copyPages(srcDoc, srcDoc.getPageIndices());
        copiedPages.forEach(p => mergedPdf.addPage(p));
      }

      statusText = 'Generating final merged PDF...';
      progress = 95;
      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = outputFilename.endsWith('.pdf') ? outputFilename : `${outputFilename}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 10000);

      progress = 100;
      statusText = 'Merge complete!';
      appState.playAudioCue('success');
      appState.triggerHaptic('success');
      appState.incrementProcessed(files.length);

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 }
      });

      appState.showToast(`Merged ${files.length} PDFs successfully!`, 'success');
    } catch (err) {
      console.error(err);
      appState.showToast('Failed to merge PDFs: ' + err.message, 'error');
    } finally {
      isMerging = false;
    }
  }
</script>

<div class="w-full max-w-4xl mx-auto px-2">
  <!-- Tool Header -->
  <div class="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div>
      <h2 class="text-xl sm:text-2xl font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
        Merge PDFs
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">
        Combine multiple documents into one in your custom order.
      </p>
    </div>

    <!-- Quick Sort Actions -->
    {#if files.length > 1}
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => sortByDate(true)}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-[#52505d] dark:text-[#9e9cb0] transition-colors cursor-pointer"
        >
          <Calendar class="w-3.5 h-3.5" />
          <span>Oldest First</span>
        </button>
        <button
          type="button"
          onclick={() => sortByDate(false)}
          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-[#52505d] dark:text-[#9e9cb0] transition-colors cursor-pointer"
        >
          <Calendar class="w-3.5 h-3.5" />
          <span>Newest First</span>
        </button>
      </div>
    {/if}
  </div>

  <!-- Upload Dropzone -->
  <label
    class="w-full mb-6 p-8 rounded-3xl bg-white dark:bg-[#1a1924] border-2 border-dashed border-black/[0.1] dark:border-white/[0.1] hover:border-indigo-500/50 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
  >
    <input
      type="file"
      multiple
      accept=".pdf,application/pdf"
      onchange={(e) => handleFilesAdded(e.target.files)}
      class="hidden"
    />
    <div class="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
      <UploadCloud class="w-6 h-6" />
    </div>
    <span class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7]">
      Click to upload or drag & drop PDF files
    </span>
    <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
      Add multiple documents to combine
    </span>
  </label>

  <!-- Files Queue -->
  {#if files.length > 0}
    <div class="space-y-2 mb-6">
      {#each files as item, index (item.id)}
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-white dark:bg-[#1a1924] border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <FileText class="w-4 h-4" />
            </div>
            <div class="flex flex-col min-w-0">
              <span class="text-xs font-semibold text-[#1c1b22] dark:text-[#f2f1f7] truncate">
                {item.name}
              </span>
              <span class="text-[11px] text-[#84828e]">
                {item.size} MB
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onclick={() => moveFile(index, -1)}
              disabled={index === 0}
              class="p-1.5 rounded-lg text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Move Up"
            >
              <ArrowUp class="w-4 h-4" />
            </button>
            <button
              type="button"
              onclick={() => moveFile(index, 1)}
              disabled={index === files.length - 1}
              class="p-1.5 rounded-lg text-[#84828e] hover:text-[#1c1b22] dark:hover:text-white disabled:opacity-30 cursor-pointer"
              title="Move Down"
            >
              <ArrowDown class="w-4 h-4" />
            </button>
            <button
              type="button"
              onclick={() => removeFile(item.id)}
              class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer ml-1"
              title="Remove File"
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        </div>
      {/each}
    </div>

    <!-- Action Bar -->
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex items-center gap-2">
        <label for="mergeOutputName" class="text-xs font-semibold text-[#52505d] dark:text-[#9e9cb0]">
          Output:
        </label>
        <input
          id="mergeOutputName"
          type="text"
          bind:value={outputFilename}
          class="px-3 py-1.5 text-xs rounded-xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.08] dark:border-white/[0.1] text-[#1c1b22] dark:text-[#f2f1f7] outline-none"
        />
      </div>

      <button
        type="button"
        onclick={mergePdfs}
        disabled={isMerging || files.length < 2}
        class="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all cursor-pointer"
      >
        {#if isMerging}
          <Loader2 class="w-4 h-4 animate-spin" />
          <span>Merging... {progress}%</span>
        {:else}
          <Download class="w-4 h-4" />
          <span>Merge {files.length} PDFs</span>
        {/if}
      </button>
    </div>
  {/if}
</div>
