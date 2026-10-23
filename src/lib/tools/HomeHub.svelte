<script>
  import { appState } from '../stores/appState.svelte.js';
  import {
    ShieldCheck,
    UploadCloud,
    FileText,
    Merge,
    Scissors,
    Split,
    Layers,
    SunMoon,
    Minimize2,
    Images,
    FileImage,
    Lock,
    Zap,
    Users,
    CheckCircle2,
    ArrowRight
  } from '@lucide/svelte';

  const toolCards = [
    {
      id: 'merge',
      title: 'Merge PDFs',
      desc: 'Combine multiple PDF documents into a single unified file in custom order.',
      icon: Merge,
      badge: 'Popular',
      color: '#4f46e5'
    },
    {
      id: 'remove',
      title: 'Remove Pages',
      desc: 'Delete unwanted pages visually with interactive thumbnail selection.',
      icon: Scissors,
      badge: 'Interactive',
      color: '#f43f5e'
    },
    {
      id: 'split',
      title: 'Split PDF',
      desc: 'Extract specific page ranges or burst into multiple standalone files.',
      icon: Split,
      badge: 'Fast',
      color: '#ea580c'
    },
    {
      id: 'slides',
      title: 'Slides to A4',
      desc: 'Fit presentation slides per A4 page for printing, study sheets, and notes.',
      icon: Layers,
      badge: 'Print Prep',
      color: '#2563eb'
    },
    {
      id: 'invert',
      title: 'Invert Colors',
      desc: 'Invert dark presentations to clean white paper. Save up to 90% printer ink.',
      icon: SunMoon,
      badge: 'Ink Saver',
      color: '#8b5cf6'
    },
    {
      id: 'compress',
      title: 'Compress PDF',
      desc: 'Smart lossless object stream optimization and visual raster compression.',
      icon: Minimize2,
      badge: 'Lossless',
      color: '#10b981'
    },
    {
      id: 'images',
      title: 'Image to PDF',
      desc: 'Convert JPG, PNG, and WebP photos into a clean PDF document.',
      icon: Images,
      badge: 'Batch',
      color: '#0d9488'
    },
    {
      id: 'pdftoimages',
      title: 'PDF to Images',
      desc: 'Rasterize PDF pages into high-res JPG or PNG images and download as ZIP.',
      icon: FileImage,
      badge: 'High-Res',
      color: '#0284c7'
    }
  ];

  let isDragging = $state(false);

  function handleDrop(e) {
    e.preventDefault();
    isDragging = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    routeFiles(files);
  }

  function handleFileInput(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    routeFiles(files);
  }

  function routeFiles(files) {
    const hasPdf = files.some(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    const allImages = files.every(f => f.type.startsWith('image/'));

    if (allImages) {
      appState.switchTab('images');
    } else if (hasPdf && files.length > 1) {
      appState.switchTab('merge');
    } else if (hasPdf) {
      appState.switchTab('merge');
    }
  }
</script>

<div class="w-full flex flex-col items-center">
  <!-- Hero Section -->
  <section class="text-center py-6 sm:py-10 max-w-2xl mx-auto px-4">
    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 mb-4 shadow-sm">
      <ShieldCheck class="w-4 h-4 shrink-0 text-emerald-500" />
      <span>100% In-Browser • Zero Cloud Uploads • Instant RAM Purge</span>
    </div>

    <!-- Kinetic Two-Tone Headline -->
    <h1 class="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#1c1b22] dark:text-[#f2f1f7] leading-tight sm:leading-none mb-3">
      Private. Fast.<br />
      <span class="bg-gradient-to-r from-[#7f77dd] via-[#9f97ff] to-[#1d9e75] bg-clip-text text-transparent">
        100% In-Browser.
      </span>
    </h1>

    <p class="text-sm sm:text-base text-[#52505d] dark:text-[#9e9cb0] max-w-xl mx-auto leading-relaxed">
      No server uploads, waiting queues, or file size limits. Every document is processed locally on your device for enterprise-grade privacy and speed.
    </p>
  </section>

  <!-- Filee.sh OS Window Stage Universal Dropzone -->
  <section class="w-full max-w-3xl mb-12 px-2">
    <div
      class="rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-xl overflow-hidden transition-all duration-300 {isDragging
        ? 'ring-4 ring-indigo-500/30 scale-[1.01]'
        : 'hover:border-indigo-500/30'}"
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={handleDrop}
      role="region"
      aria-label="File upload dropzone"
    >
      <!-- OS Window Bar Header -->
      <div class="flex items-center justify-between px-4 py-2.5 bg-black/[0.025] dark:bg-white/[0.03] border-b border-black/[0.06] dark:border-white/[0.07]">
        <!-- Traffic Light Dots -->
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm"></span>
        </div>

        <!-- Title -->
        <div class="flex items-center gap-1.5 text-xs font-semibold text-[#84828e] font-mono">
          <FileText class="w-3.5 h-3.5 text-indigo-500" />
          <span>PDF Tools • Smart Workspace</span>
        </div>

        <!-- Sandbox Status -->
        <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Local Sandbox</span>
        </div>
      </div>

      <!-- Drop Area Content -->
      <label class="flex flex-col items-center justify-center p-8 sm:p-12 cursor-pointer text-center group">
        <input
          type="file"
          multiple
          accept=".pdf,image/*,application/pdf"
          onchange={handleFileInput}
          class="hidden"
        />
        <div class="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 transition-transform group-hover:scale-110 shadow-inner">
          <UploadCloud class="w-7 h-7" />
        </div>
        <h2 class="text-base sm:text-lg font-bold text-[#1c1b22] dark:text-[#f2f1f7] mb-1">
          Drop any PDF or images here to start
        </h2>
        <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mb-5">
          or <span class="text-indigo-600 dark:text-indigo-400 font-semibold underline underline-offset-2">browse files</span> directly from your device
        </p>

        <!-- Format Badge Chips -->
        <div class="flex items-center justify-center flex-wrap gap-2 text-[11px] font-medium text-[#52505d] dark:text-[#9e9cb0]">
          <span class="px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>Single PDF: Quick Tools
          </span>
          <span class="px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>2+ PDFs: Merge Pipeline
          </span>
          <span class="px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-teal-500"></span>Images: Convert to PDF
          </span>
          <span class="px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.06] dark:border-white/[0.08] flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>100% Client-Side
          </span>
        </div>
      </label>
    </div>
  </section>

  <!-- 8-Tool Bento Showcase Grid -->
  <section class="w-full max-w-5xl mb-12">
    <div class="text-center mb-6">
      <h2 class="text-xl sm:text-2xl font-bold tracking-tight text-[#1c1b22] dark:text-[#f2f1f7]">
        All PDF Tools
      </h2>
      <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-1">
        Choose a dedicated workspace or drag files into any tool
      </p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-2">
      {#each toolCards as tool (tool.id)}
        {@const Icon = tool.icon}
        <button
          type="button"
          onclick={() => appState.switchTab(tool.id)}
          class="flex flex-col text-left p-5 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] hover:border-indigo-500/40 hover:-translate-y-1 shadow-sm hover:shadow-lg transition-all duration-200 cursor-pointer group"
        >
          <div class="flex items-center justify-between w-full mb-3">
            <div
              class="w-11 h-11 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 shadow-sm"
              style="background-color: {tool.color}15; color: {tool.color};"
            >
              <Icon class="w-5 h-5" />
            </div>
            <span
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide"
              style="background-color: {tool.color}15; color: {tool.color};"
            >
              {tool.badge}
            </span>
          </div>
          <h3 class="text-sm font-bold text-[#1c1b22] dark:text-[#f2f1f7] mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
            {tool.title}
          </h3>
          <p class="text-xs text-[#52505d] dark:text-[#9e9cb0] line-clamp-2 leading-relaxed">
            {tool.desc}
          </p>
        </button>
      {/each}
    </div>
  </section>

  <!-- 4-Card Marketing Feature Mosaic -->
  <section class="w-full max-w-4xl grid grid-cols-2 sm:grid-cols-4 gap-3 px-2 mb-10">
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm">
      <Layers class="w-5 h-5 text-indigo-500 mb-2" />
      <h4 class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">Unlimited Batching</h4>
      <p class="text-[11px] text-[#52505d] dark:text-[#9e9cb0] mt-1 leading-tight">
        Combine as many documents as your RAM supports.
      </p>
    </div>
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm">
      <Lock class="w-5 h-5 text-emerald-500 mb-2" />
      <h4 class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">Immediate RAM Purge</h4>
      <p class="text-[11px] text-[#52505d] dark:text-[#9e9cb0] mt-1 leading-tight">
        Buffers clear instantly when your tab is closed.
      </p>
    </div>
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm">
      <Zap class="w-5 h-5 text-amber-500 mb-2" />
      <h4 class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">Instant Export</h4>
      <p class="text-[11px] text-[#52505d] dark:text-[#9e9cb0] mt-1 leading-tight">
        No remote queues or server render wait times.
      </p>
    </div>
    <div class="p-4 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm">
      <CheckCircle2 class="w-5 h-5 text-teal-500 mb-2" />
      <h4 class="text-xs font-bold text-[#1c1b22] dark:text-[#f2f1f7]">PWA Offline</h4>
      <p class="text-[11px] text-[#52505d] dark:text-[#9e9cb0] mt-1 leading-tight">
        Works seamlessly without an active internet connection.
      </p>
    </div>
  </section>

  <!-- Live Global Impact Section -->
  <section class="w-full max-w-xl p-5 rounded-3xl bg-white dark:bg-[#1a1924] border border-black/[0.08] dark:border-white/[0.08] shadow-sm text-center mb-8">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
        <span class="text-[10px] font-bold uppercase tracking-wider text-[#84828e]">LIVE GLOBAL IMPACT</span>
      </div>
      <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500">
        100% Private
      </span>
    </div>

    <div class="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06] mb-3">
      <div class="flex flex-col items-center justify-center py-2">
        <span class="text-2xl font-bold tracking-tight text-[#1c1b22] dark:text-[#f2f1f7]">
          {appState.stats.visitors.toLocaleString()}+
        </span>
        <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">Visitors Worldwide</span>
      </div>
      <div class="flex flex-col items-center justify-center py-2 border-l border-black/[0.06] dark:border-white/[0.08]">
        <span class="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
          {appState.stats.processed.toLocaleString()}+
        </span>
        <span class="text-xs text-[#52505d] dark:text-[#9e9cb0] mt-0.5">PDFs Processed Privately</span>
      </div>
    </div>

    <div class="flex items-center justify-center gap-1.5 text-[11px] text-[#84828e]">
      <Zap class="w-3.5 h-3.5 text-amber-500" />
      <span>Counters update anonymously • Zero file bytes are ever uploaded to any server</span>
    </div>
  </section>
</div>
