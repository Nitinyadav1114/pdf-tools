# PDF Tools — Free, Fast & 100% Private In-Browser PDF Suite

[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-4f46e5?style=for-the-badge&logo=github)](https://nitinyadav1114.github.io/pdf-tools/)
[![Privacy Guaranteed](https://img.shields.io/badge/Privacy-100%25%20In--Browser%20(Zero%20Uploads)-10b981?style=for-the-badge&logo=shield)](https://nitinyadav1114.github.io/pdf-tools/)
[![Automated Tests](https://img.shields.io/badge/Test%20Suite-125%20%2F%20125%20Passed-0284c7?style=for-the-badge&logo=checkmarx)](https://nitinyadav1114.github.io/pdf-tools/)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20Ready%20(v14)-f59e0b?style=for-the-badge&logo=pwa)](https://nitinyadav1114.github.io/pdf-tools/)

> **Experience the live web app:** [https://nitinyadav1114.github.io/pdf-tools/](https://nitinyadav1114.github.io/pdf-tools/)

A modern, high-performance, and privacy-first web application engineered for all your daily PDF tasks. **Runs 100% client-side inside any modern web browser — zero server uploads, zero cloud processing, no accounts, and instant RAM purge when you close the tab.**

---

## 🔒 The 100% Client-Side Privacy Guarantee

Unlike traditional online PDF converters that transmit your sensitive documents to remote third-party servers:
- 🛡️ **Zero Cloud Uploads**: Files are read directly into browser memory (RAM) via JavaScript & WebAssembly APIs.
- ⚡ **Instant RAM Purge**: Cached file buffers and canvas contexts are automatically dereferenced and garbage-collected when tasks complete or when you switch tabs.
- 📶 **Works Completely Offline**: With PWA Service Worker caching (`v14`), the entire suite runs with zero active internet connection.
- 🔍 **Strict Security & CSP**: Built-in magic byte inspection blocks disguised binaries or malicious scripts. Content Security Policy restricts connections strictly to trusted endpoints.

---

## ✨ 8 Powerful All-in-One Tools

### 1. 📑 Merge PDFs
- **⏱️ Timestamp & Metadata Sorting**: Automatically sort uploaded PDFs chronologically (oldest or newest first) based on file modification timestamps.
- **✋ Drag & Drop Reordering**: Rearrange documents into any sequence with smooth drag handles and visual page count badges.
- **🖼️ Real-Time Previews**: Instant first-page thumbnail previews rendered via PDF.js.
- **⚡ Batch Processing**: Combine as many documents as your device's memory allows.

### 2. ✂️ Remove Pages & Rotate Deck
- **🎯 Flexible Selection Syntax**: Enter comma-separated page numbers and ranges (e.g., `1, 3, 5-8, 12`).
- **🔄 Visual Page Rotation**: Rotate individual pages 90° clockwise or batch-rotate the entire document with live visual feedback.
- **✋ Drag & Drop Reordering**: Reorder pages directly in the visual thumbnail grid prior to exporting.
- **⚡ One-Click Helpers**: Select Odd pages, Even pages, Invert selection, or Reset with a single click.
- **📄 Lossless Page Stripping**: Strips selected pages without re-encoding or re-compressing unselected content.
- **🔗 Workflow Handoffs**: Pass cleaned output PDF directly to Compress PDF or Split PDF in a single click.

### 3. 📊 Slides to A4 Handout
- **🎯 Multi-Slide Handout Generator**: Neatly scale and pack 2, 3, 4, 6, or 9 presentation slides onto standard A4 portrait pages (`595 × 842 pt`).
- **📐 4 Margin Presets**: Narrow (0.25" • Maximizes slide area), Moderate (0.5"), Normal (0.75"), or Minimal (0.15").
- **📝 Meeting & Lecture Layouts**: Centered slides, or 3 slides per page with lined note-taking spaces for students and professionals.
- **🖨️ Print Enhancements**: Crisp slide framing borders and automatic slide numbering (`Slide X of Y`).
- **📄 Live A4 Sheet Preview**: Real-time rendering of Page 1 showing the exact printable layout before downloading.

### 4. 🌓 PDF Color Inverter (Ink Saver)
- **🖨️ Save Up to 90% Printer Toner**: Invert dark lecture slides, black presentation backgrounds, and dark-mode PDFs into clean, crisp white paper.
- **🎨 3 Smart Inversion Modes**:
  - **📄 Clean White Paper**: Flips dark backgrounds to bright paper while keeping text and diagrams crisp.
  - **🖨️ Pure Black & White**: High-contrast monochrome output optimized for laser printers.
  - **🎨 Keep Theme Colors**: Inverts luminance while preserving original brand and chart hues.
- **🔍 DPI Quality Presets**: High Quality (150 DPI • Recommended), Laser Ultra (220 DPI), or Draft (110 DPI).
- **📑 Selective Page Range**: Invert all pages or specify targeted pages (e.g., `1, 4-7`).
- **👀 Live Before / After Toggle**: Instant comparison view between original screen view and inverted paper output.

### 5. 🗜️ Compress PDF
- **🎯 Smart Compress (Recommended)**: Up to 75%+ file size reduction with visually-lossless quality for scanned PDFs and photo-heavy reports.
- **💎 Pure Lossless (Bit-Exact)**: Compresses internal cross-reference tables and object streams without altering a single pixel or font glyph.
- **📧 Smallest File (Email / Portal Ready)**: Ultra-compact compression to bypass strict email attachment limits (<25 MB) and government portal thresholds.
- **📊 Real-Time Savings Calculator**: Live gauge showing original size, compressed size, and percentage saved.

### 6. 🖼️ Image to PDF Converter
- **📸 Broad Format Compatibility**: JPG, JPEG, PNG, WebP, GIF, and BMP.
- **📐 Page Layout Presets**: Fit to Image Dimensions (exact 1:1 image sizing), Standard A4, and US Letter.
- **🔄 Per-Image & Bulk Orientation**: Rotate individual photos or batch-rotate all images 90° clockwise.
- **✋ Drag & Drop Sequencing**: Reorder image slides with ease before compiling into a single document.

### 7. 📸 PDF to Images Extractor
- **🖼️ High-Resolution Page Extraction**: Convert every PDF page into crisp JPG or PNG images.
- **🔍 DPI Quality Options**: 1.0x (100 DPI standard), 1.5x (150 DPI balanced), or 2.0x (200 DPI high resolution).
- **📦 Clean ZIP Download**: Automatically packages all extracted images into an uncompressed, instantly-downloaded ZIP archive using a native client-side streaming ZIP generator.
- **📑 Custom Page Ranges**: Extract all pages or specific page numbers.

### 8. 🔀 Split PDF / Extract Pages
- **🎯 Extract Specific Ranges**: Extract custom page ranges (`1-3, 5, 8-10`) into a single consolidated PDF or individual PDFs.
- **✂️ Fixed-Size Chunk Splitting**: Split large documents every $N$ pages (e.g. every 2 pages) into separate documents.
- **📦 Custom Range Groups**: Divide documents into distinct groups (`1-2, 3-5, 6-10`) packaged inside an in-browser ZIP archive.
- **🔗 Workflow Handoffs**: Pass split output documents directly to Compress PDF without re-downloading or re-uploading.

---

## 🎨 Modern Linear & Apple-Inspired Design System

- **Clean Aesthetic**: Engineered from the ground up with subtle frosted glass containers, elevated cards, and uncluttered navigation.
- **Active Tool Palette**: Instant visual feedback with tool-specific accent colors (Indigo, Rose, Blue, Purple, Emerald, Teal, Sky, Amber).
- **Above-The-Fold Dropzones**: Uncluttered dropzones with ambient backdrops, drag-and-drop support, and responsive metadata pills.
- **Flawless Mobile Experience**: Mobile-first breakpoints tested on 390px viewports (iPhone 12/13/14/15) with zero horizontal overflow.
- **Dual Themes**: Full Light Mode and Dark Mode support with smooth theme toggle and persistence.

---

## ⚡ Technical Architecture

| Layer | Technology |
|---|---|
| **PDF Manipulation** | [`pdf-lib`](https://pdf-lib.js.org/) (pure in-browser WebAssembly-like binary PDF engine) |
| **PDF Rendering** | [`pdf.js`](https://mozilla.github.io/pdf.js/) (Mozilla PDF rendering engine) |
| **Drag & Drop** | [`SortableJS`](https://sortablejs.github.io/Sortable/) (lightweight touch-friendly reordering) |
| **Multithreading** | Dedicated Web Workers (`assets/js/core/worker-pool.js`) for non-blocking canvas rasterization & color inversion |
| **PWA & Caching** | Service Worker `v14` with Cache-First asset precaching and offline fallback |
| **Archive Generation** | Custom client-side streaming ZIP writer (`assets/js/core/zip-builder.js`) with PK zip headers |
| **Styles** | Bundled static CSS (`bundle.min.css`) with zero external runtime dependencies |
| **Impact Counter** | Privacy-preserving Cloudflare Worker + KV counter (visitor & processed file totals without logging IP or metadata) |

---

## 🧪 Automated Test Suite

The repository includes a comprehensive automated test runner with **125 unit and integration assertions** that execute in headless browser mode via Chrome DevTools Protocol (CDP):

```bash
# Run the automated test suite
python scratch/run_test_suite.py
```

```text
======================================================================
Summary: 125 passed, 0 failed, total assertions: 125
Banner: ALL_TESTS_COMPLETED_SUCCESSFULLY (125 assertions passed)
======================================================================
[SUCCESS] 100% Automated Test Suite Passed (125/125 assertions)!
```

All 224 DOM element selectors defined in [`assets/js/core/dom.js`](file:///assets/js/core/dom.js) are continuously verified for DOM integrity.

---

## 💻 Local Development

Because PDF Tools has zero backend dependencies, you can run it locally with any standard HTTP server:

```bash
# Clone the repository
git clone https://github.com/Nitinyadav1114/pdf-tools.git
cd pdf-tools

# Start a local static server
python -m http.server 8080
```

Open [http://localhost:8080](http://localhost:8080) in your web browser.

---

## 🚀 Free Deployment Guide

### Option 1: GitHub Pages (Current Live Host)
1. Fork or clone this repository.
2. Go to **Settings** > **Pages** in your GitHub repo.
3. Under **Branch**, select `main` and `/ (root)` folder.
4. Click **Save**. Your site is automatically live at `https://<username>.github.io/<repo-name>/`.

### Option 2: Netlify Drop (Instant, Zero Git)
1. Navigate to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop the repository folder directly into your browser window.
3. Your app is immediately deployed to a secure HTTPS URL.

---

## 📄 License & Attribution

Built with open-source technologies under the MIT License. Feel free to use, modify, and distribute for personal or commercial projects.
