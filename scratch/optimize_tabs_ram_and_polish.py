import os
import re

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read_file(rel_path):
    p = os.path.join(REPO_ROOT, rel_path)
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(rel_path, content):
    p = os.path.join(REPO_ROOT, rel_path)
    with open(p, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print(f"Updated {rel_path} ({len(content)} chars)")

# ==========================================
# 1. TAB-MERGE.JS
# ==========================================
def optimize_merge():
    content = read_file('assets/js/tabs/tab-merge.js')
    
    # Imports
    content = content.replace(
        "import {\n  formatBytes,\n  formatTimestamp,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  formatTimestamp,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    # Alerts
    content = content.replace(
        "alert(`Security Warning: The selected file(s) [${invalidFiles.join(', ')}] are not genuine or valid PDF documents. Upload rejected.`);",
        "showToast(`Security Warning: Excluded invalid or non-PDF files: [${invalidFiles.join(', ')}]`, 'error');"
    )
    content = content.replace(
        "alert(`Security Notice: Excluded invalid or non-PDF file(s): ${invalidFiles.join(', ')}`);",
        "showToast(`Security Notice: Excluded invalid file(s): ${invalidFiles.join(', ')}`, 'info');"
    )
    content = content.replace(
        "alert('Please select valid PDF files.');",
        "showToast('Please select valid PDF files.', 'warning');"
    )
    content = content.replace(
        "alert('Please add at least 2 PDF files to merge.');",
        "showToast('Please add at least 2 PDF files to merge.', 'warning');"
    )
    content = content.replace(
        "alert('PDF-Lib is not loaded. Please check your local files.');",
        "showToast('PDF-Lib engine could not be loaded.', 'error');"
    )
    content = content.replace(
        "alert('Failed to merge PDFs: ' + (err.message || 'Unknown error occurred'));",
        "showToast('Failed to merge PDFs: ' + (err.message || 'Unknown error occurred'), 'error');"
    )
    
    # Thumbnail RAM optimization (zero canvas and destroy doc)
    old_thumb = """        if (window.pdfjsLib) {
          try {
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
            const pdfDoc = await loadingTask.promise;
            if (item.pageCount === null) item.pageCount = pdfDoc.numPages;

            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            item.thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
          } catch (pe) {
            console.warn('PDF.js thumbnail warning:', pe);
          }
        }"""
    
    new_thumb = """        if (window.pdfjsLib) {
          let pdfDoc = null;
          try {
            const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
            pdfDoc = await loadingTask.promise;
            if (item.pageCount === null) item.pageCount = pdfDoc.numPages;

            const page = await pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 0.3 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            await page.render({ canvasContext: ctx, viewport }).promise;
            item.thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            canvas.width = 0;
            canvas.height = 0;
          } catch (pe) {
            console.warn('PDF.js thumbnail warning:', pe);
          } finally {
            if (pdfDoc) pdfDoc.destroy().catch(() => {});
          }
        }"""
    content = content.replace(old_thumb, new_thumb)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
        dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
      });
    });"""

    new_drag = """    let mergeDragCounter = 0;
    dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      mergeDragCounter++;
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mergeDragCounter = Math.max(0, mergeDragCounter - 1);
      if (mergeDragCounter === 0) {
        dropzone.classList.remove('drag-active');
      }
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      mergeDragCounter = 0;
      dropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-merge.js', content)

# ==========================================
# 2. TAB-REMOVE.JS
# ==========================================
def optimize_remove():
    content = read_file('assets/js/tabs/tab-remove.js')
    
    # Imports
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    # Alerts
    content = content.replace(
        "alert('Please select a valid PDF file.');",
        "showToast('Please select a valid PDF file.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This PDF document is password-protected or encrypted.\\nPlease remove password protection before uploading it.');",
        "showToast('🔒 This PDF document is encrypted. Please remove password protection before uploading.', 'error');"
    )
    content = content.replace(
        "alert('Could not open this PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Could not open this PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please upload a PDF first.');",
        "showToast('Please upload a PDF first.', 'warning');"
    )
    content = content.replace(
        "alert('Please select at least 1 page to delete, or rotate/reorder pages.');",
        "showToast('Please select at least 1 page to delete, or rotate/reorder pages.', 'warning');"
    )
    content = content.replace(
        "alert('Cannot delete all pages! You must keep at least 1 page.');",
        "showToast('Cannot delete all pages! You must keep at least 1 page.', 'warning');"
    )
    content = content.replace(
        "alert('PDF-Lib is not loaded.');",
        "showToast('PDF-Lib engine could not be loaded.', 'error');"
    )
    content = content.replace(
        "alert('Failed to delete pages: ' + (err.message || 'Unknown error occurred'));",
        "showToast('Failed to delete pages: ' + (err.message || 'Unknown error occurred'), 'error');"
    )
    
    # RAM destroy in resetRemoveWorkspace
    old_reset = """  removeState.file = null;
  removeState.arrayBuffer = null;
  removeState.pdfDoc = null;"""
    new_reset = """  if (removeState.pdfDoc) {
    removeState.pdfDoc.destroy().catch(() => {});
  }
  removeState.file = null;
  removeState.arrayBuffer = null;
  removeState.pdfDoc = null;"""
    content = content.replace(old_reset, new_reset)
    
    # Destroy old doc before loading new file in handleRemoveFileSelected
    old_handle = """  removeState.file = file;
  removeState.selectedPages.clear();"""
    new_handle = """  if (removeState.pdfDoc) {
    removeState.pdfDoc.destroy().catch(() => {});
    removeState.pdfDoc = null;
  }
  removeState.file = file;
  removeState.selectedPages.clear();"""
    content = content.replace(old_handle, new_handle)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      removeDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
        removeDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      removeDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let removeDragCounter = 0;
    removeDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      removeDragCounter++;
      removeDropzone.classList.add('drag-active');
    });

    removeDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    removeDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeDragCounter = Math.max(0, removeDragCounter - 1);
      if (removeDragCounter === 0) {
        removeDropzone.classList.remove('drag-active');
      }
    });

    removeDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeDragCounter = 0;
      removeDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-remove.js', content)

# ==========================================
# 3. TAB-SLIDES.JS
# ==========================================
def optimize_slides():
    content = read_file('assets/js/tabs/tab-slides.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert('Please select a valid PDF file.');",
        "showToast('Please select a valid PDF file.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This presentation PDF is password-protected or encrypted.\\nPlease remove password protection before uploading it.');",
        "showToast('🔒 Presentation is encrypted. Please remove password protection before uploading.', 'error');"
    )
    content = content.replace(
        "alert('Could not open presentation: ' + (err.message || 'Unknown error'));",
        "showToast('Could not open presentation: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please upload a presentation PDF first.');",
        "showToast('Please upload a presentation PDF first.', 'warning');"
    )
    content = content.replace(
        "alert('PDF-Lib is not loaded.');",
        "showToast('PDF-Lib engine is not loaded.', 'error');"
    )
    content = content.replace(
        "alert('Failed to generate A4 handout: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to generate handout: ' + (err.message || 'Unknown error'), 'error');"
    )
    
    # RAM destroy in resetSlidesWorkspace
    old_reset = """  slidesState.file = null;
  slidesState.arrayBuffer = null;
  slidesState.pdfDoc = null;"""
    new_reset = """  if (slidesState.pdfDoc) {
    slidesState.pdfDoc.destroy().catch(() => {});
  }
  slidesState.file = null;
  slidesState.arrayBuffer = null;
  slidesState.pdfDoc = null;"""
    content = content.replace(old_reset, new_reset)
    
    # In handleSlidesFileSelected: zero canvas and destroy old doc
    old_handle = """  slidesState.file = file;
  slidesState.previewThumbnails = {};"""
    new_handle = """  if (slidesState.pdfDoc) {
    slidesState.pdfDoc.destroy().catch(() => {});
    slidesState.pdfDoc = null;
  }
  slidesState.file = file;
  slidesState.previewThumbnails = {};"""
    content = content.replace(old_handle, new_handle)
    
    # Zero canvas in thumbnail loop
    old_thumb = """              await page.render({ canvasContext: ctx, viewport }).promise;
              slidesState.previewThumbnails[s] = canvas.toDataURL('image/jpeg', 0.8);"""
    new_thumb = """              await page.render({ canvasContext: ctx, viewport }).promise;
              slidesState.previewThumbnails[s] = canvas.toDataURL('image/jpeg', 0.8);
              canvas.width = 0;
              canvas.height = 0;"""
    content = content.replace(old_thumb, new_thumb)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      slidesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
        slidesDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      slidesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        slidesDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let slidesDragCounter = 0;
    slidesDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      slidesDragCounter++;
      slidesDropzone.classList.add('drag-active');
    });

    slidesDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    slidesDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      slidesDragCounter = Math.max(0, slidesDragCounter - 1);
      if (slidesDragCounter === 0) {
        slidesDropzone.classList.remove('drag-active');
      }
    });

    slidesDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      slidesDragCounter = 0;
      slidesDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-slides.js', content)

# ==========================================
# 4. TAB-INVERT.JS
# ==========================================
def optimize_invert():
    content = read_file('assets/js/tabs/tab-invert.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert('Please upload a valid PDF document.');",
        "showToast('Please upload a valid PDF document.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This PDF document is password-protected or encrypted.\\nPlease remove password protection before uploading it.');",
        "showToast('🔒 Document is encrypted. Please remove password protection before inverting.', 'error');"
    )
    content = content.replace(
        "alert('Could not open PDF document: ' + (err.message || 'Unknown error'));",
        "showToast('Could not open PDF document: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please upload a PDF document first.');",
        "showToast('Please upload a PDF document first.', 'warning');"
    )
    content = content.replace(
        "alert('PDF libraries are not loaded.');",
        "showToast('PDF libraries are not loaded.', 'error');"
    )
    content = content.replace(
        "alert('Failed to invert PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to invert PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    
    # RAM destroy in resetInvertWorkspace
    old_reset = """  invertState.file = null;
  invertState.arrayBuffer = null;
  invertState.pdfDoc = null;"""
    new_reset = """  if (invertState.pdfDoc) {
    invertState.pdfDoc.destroy().catch(() => {});
  }
  invertState.file = null;
  invertState.arrayBuffer = null;
  invertState.pdfDoc = null;"""
    content = content.replace(old_reset, new_reset)
    
    # In handleInvertFileSelected: destroy old doc
    old_handle = """    const arrayBuffer = await file.arrayBuffer();
    invertState.file = file;"""
    new_handle = """    if (invertState.pdfDoc) {
      invertState.pdfDoc.destroy().catch(() => {});
      invertState.pdfDoc = null;
    }
    const arrayBuffer = await file.arrayBuffer();
    invertState.file = file;"""
    content = content.replace(old_handle, new_handle)
    
    # In executeInvertPdf: wrap in finally with pdfjsDoc.destroy() and offCanvas.width = 0
    old_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setInvertProgress(0, 'Inversion cancelled.');
      return;
    }
    console.error('Invert execution error:', err);
    alert('Failed to invert PDF: ' + (err.message || 'Unknown error'));
  } finally {
    invertState.isCancelled = false;
    if (elements.invertExecuteBtn) elements.invertExecuteBtn.disabled = false;
    setTimeout(() => {
      if (elements.invertProgressContainer) elements.invertProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    new_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setInvertProgress(0, 'Inversion cancelled.');
      return;
    }
    console.error('Invert execution error:', err);
    showToast('Failed to invert PDF: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    invertState.isCancelled = false;
    if (pdfjsDoc) pdfjsDoc.destroy().catch(() => {});
    if (offCanvas) {
      offCanvas.width = 0;
      offCanvas.height = 0;
    }
    if (elements.invertExecuteBtn) elements.invertExecuteBtn.disabled = false;
    setTimeout(() => {
      if (elements.invertProgressContainer) elements.invertProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    content = content.replace(old_finally, new_finally)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      invertDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
        invertDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      invertDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        invertDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let invertDragCounter = 0;
    invertDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      invertDragCounter++;
      invertDropzone.classList.add('drag-active');
    });

    invertDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    invertDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      invertDragCounter = Math.max(0, invertDragCounter - 1);
      if (invertDragCounter === 0) {
        invertDropzone.classList.remove('drag-active');
      }
    });

    invertDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      invertDragCounter = 0;
      invertDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-invert.js', content)

# ==========================================
# 5. TAB-COMPRESS.JS
# ==========================================
def optimize_compress():
    content = read_file('assets/js/tabs/tab-compress.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert('Please upload a valid PDF file.');",
        "showToast('Please upload a valid PDF file.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This PDF document is password-protected or encrypted. Please remove password protection before compressing.');",
        "showToast('🔒 Document is encrypted. Please remove password protection before compressing.', 'error');"
    )
    content = content.replace(
        "alert('Failed to load PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to load PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('No PDF file loaded or PDF engines are not ready.');",
        "showToast('No PDF file loaded or PDF engines are not ready.', 'warning');"
    )
    content = content.replace(
        "alert('Failed to compress PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to compress PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    
    # In executeCompress: destroy pdfjsDoc and offCanvas
    old_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setCompressProgress(0, 'Compression cancelled.');
      return;
    }
    console.error('Compress execution error:', err);
    alert('Failed to compress PDF: ' + (err.message || 'Unknown error'));
  } finally {
    compressState.isCancelled = false;
    if (elements.compressBtn) elements.compressBtn.disabled = false;
    setTimeout(() => {
      if (elements.compressProgressContainer) elements.compressProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    new_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setCompressProgress(0, 'Compression cancelled.');
      return;
    }
    console.error('Compress execution error:', err);
    showToast('Failed to compress PDF: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    compressState.isCancelled = false;
    if (pdfjsDoc) pdfjsDoc.destroy().catch(() => {});
    if (offCanvas) {
      offCanvas.width = 0;
      offCanvas.height = 0;
    }
    if (elements.compressBtn) elements.compressBtn.disabled = false;
    setTimeout(() => {
      if (elements.compressProgressContainer) elements.compressProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    content = content.replace(old_finally, new_finally)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      compressDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensureAllPdfEngines().catch(() => {});
        compressDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      compressDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        compressDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let compressDragCounter = 0;
    compressDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensureAllPdfEngines().catch(() => {});
      compressDragCounter++;
      compressDropzone.classList.add('drag-active');
    });

    compressDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    compressDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      compressDragCounter = Math.max(0, compressDragCounter - 1);
      if (compressDragCounter === 0) {
        compressDropzone.classList.remove('drag-active');
      }
    });

    compressDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      compressDragCounter = 0;
      compressDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-compress.js', content)

# ==========================================
# 6. TAB-IMAGES.JS
# ==========================================
def optimize_images():
    content = read_file('assets/js/tabs/tab-images.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert(`Security Warning: The selected file(s) [${invalidImages.join(', ')}] are not genuine image files (corrupted or unrecognized format). Upload rejected.`);",
        "showToast(`Security Warning: Excluded invalid or non-image files: [${invalidImages.join(', ')}]`, 'error');"
    )
    content = content.replace(
        "alert(`Security Notice: Excluded invalid or corrupted image file(s): ${invalidImages.join(', ')}`);",
        "showToast(`Security Notice: Excluded invalid image file(s): ${invalidImages.join(', ')}`, 'info');"
    )
    content = content.replace(
        "alert('Please select valid image files (JPG, PNG, WebP, GIF, BMP).');",
        "showToast('Please select valid image files (JPG, PNG, WebP, GIF, BMP).', 'warning');"
    )
    content = content.replace(
        "alert('Please add at least one image to convert.');",
        "showToast('Please add at least one image to convert.', 'warning');"
    )
    content = content.replace(
        "alert('Failed to convert images: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to convert images: ' + (err.message || 'Unknown error'), 'error');"
    )
    
    # In executeConvertImagesToPdf: offCanvas zeroing in finally
    old_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setImagesProgress(0, 'Conversion cancelled.');
      return;
    }
    console.error('Images to PDF conversion error:', err);
    alert('Failed to convert images: ' + (err.message || 'Unknown error'));
  } finally {
    imagesState.isCancelled = false;
    if (elements.executeImagesBtn) elements.executeImagesBtn.disabled = false;
    setTimeout(() => {
      if (elements.imagesProgressContainer) elements.imagesProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    new_finally = """  } catch (err) {
    if (err.message === 'OPERATION_CANCELLED') {
      setImagesProgress(0, 'Conversion cancelled.');
      return;
    }
    console.error('Images to PDF conversion error:', err);
    showToast('Failed to convert images: ' + (err.message || 'Unknown error'), 'error');
  } finally {
    imagesState.isCancelled = false;
    if (offCanvas) {
      offCanvas.width = 0;
      offCanvas.height = 0;
    }
    if (elements.executeImagesBtn) elements.executeImagesBtn.disabled = false;
    setTimeout(() => {
      if (elements.imagesProgressContainer) elements.imagesProgressContainer.classList.add('hidden');
    }, 800);
  }"""
    content = content.replace(old_finally, new_finally)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      imagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensurePdfLibLoaded().catch(() => {});
        imagesDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      imagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        imagesDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let imagesDragCounter = 0;
    imagesDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensurePdfLibLoaded().catch(() => {});
      imagesDragCounter++;
      imagesDropzone.classList.add('drag-active');
    });

    imagesDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    imagesDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      imagesDragCounter = Math.max(0, imagesDragCounter - 1);
      if (imagesDragCounter === 0) {
        imagesDropzone.classList.remove('drag-active');
      }
    });

    imagesDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      imagesDragCounter = 0;
      imagesDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-images.js', content)

# ==========================================
# 7. TAB-PDFTOIMAGES.JS
# ==========================================
def optimize_pdftoimages():
    content = read_file('assets/js/tabs/tab-pdftoimages.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert('Please upload a valid PDF file.');",
        "showToast('Please upload a valid PDF file.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This PDF document is password-protected or encrypted. Please remove password protection before converting.');",
        "showToast('🔒 Document is encrypted. Please remove password protection before converting.', 'error');"
    )
    content = content.replace(
        "alert('Failed to load PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to load PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please upload a PDF document first.');",
        "showToast('Please upload a PDF document first.', 'warning');"
    )
    content = content.replace(
        "alert('Please specify valid page numbers to convert (e.g. 1, 3, 5-8).');",
        "showToast('Please specify valid page numbers to convert (e.g. 1, 3, 5-8).', 'warning');"
    )
    content = content.replace(
        "alert('Failed to convert PDF to images: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to convert PDF to images: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('No converted images available.');",
        "showToast('No converted images available.', 'warning');"
    )
    content = content.replace(
        "alert('Failed to generate ZIP archive: ' + (err.message || 'Unknown error'));",
        "showToast('Failed to generate ZIP archive: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('No converted images to share.');",
        "showToast('No converted images to share.', 'warning');"
    )
    
    # RAM destroy in resetPdfToImages
    old_reset = """export function resetPdfToImages() {
  pdfToImagesState.file = null;
  pdfToImagesState.arrayBuffer = null;
  pdfToImagesState.pdfjsDoc = null;"""
    new_reset = """export function resetPdfToImages() {
  if (pdfToImagesState.pdfjsDoc) {
    pdfToImagesState.pdfjsDoc.destroy().catch(() => {});
  }
  pdfToImagesState.file = null;
  pdfToImagesState.arrayBuffer = null;
  pdfToImagesState.pdfjsDoc = null;"""
    content = content.replace(old_reset, new_reset)
    
    # Revoke previous images before new execution
    old_exec = """  const total = targetPages.length;
  const generatedImages = [];"""
    new_exec = """  // Clean up previous image blob URLs from memory
  pdfToImagesState.images.forEach((img) => {
    if (img.dataUrl) URL.revokeObjectURL(img.dataUrl);
  });
  pdfToImagesState.images = [];

  const total = targetPages.length;
  const generatedImages = [];"""
    content = content.replace(old_exec, new_exec)
    
    # Drag-and-drop counter
    old_drag = """    ['dragenter', 'dragover'].forEach((eventName) => {
      pdfToImagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        ensurePdfJsLoaded().catch(() => {});
        pdfToImagesDropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      pdfToImagesDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        pdfToImagesDropzone.classList.remove('drag-active');
      });
    });"""
    new_drag = """    let pdftoimagesDragCounter = 0;
    pdfToImagesDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensurePdfJsLoaded().catch(() => {});
      pdftoimagesDragCounter++;
      pdfToImagesDropzone.classList.add('drag-active');
    });

    pdfToImagesDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    pdfToImagesDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pdftoimagesDragCounter = Math.max(0, pdftoimagesDragCounter - 1);
      if (pdftoimagesDragCounter === 0) {
        pdfToImagesDropzone.classList.remove('drag-active');
      }
    });

    pdfToImagesDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pdftoimagesDragCounter = 0;
      pdfToImagesDropzone.classList.remove('drag-active');
    });"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-pdftoimages.js', content)

# ==========================================
# 8. TAB-SPLIT.JS
# ==========================================
def optimize_split():
    content = read_file('assets/js/tabs/tab-split.js')
    
    content = content.replace(
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage\n} from '../core/utils.js';",
        "import {\n  formatBytes,\n  escapeHtml,\n  isPasswordProtectedError,\n  handleSharePdf,\n  trackToolUsage,\n  showToast\n} from '../core/utils.js';"
    )
    
    content = content.replace(
        "alert('Please select a valid PDF file.');",
        "showToast('Please select a valid PDF file.', 'warning');"
    )
    content = content.replace(
        "alert(`Security Warning: \"${file.name}\" is not a genuine or valid PDF document (missing %PDF- header). Upload rejected.`);",
        "showToast(`Security Warning: \"${file.name}\" is not a genuine PDF document. Upload rejected.`, 'error');"
    )
    content = content.replace(
        "alert('🔒 This PDF document is password-protected or encrypted.\\nPlease unlock or remove the password before splitting.');",
        "showToast('🔒 Document is encrypted. Please remove password protection before splitting.', 'error');"
    )
    content = content.replace(
        "alert('Could not open this PDF: ' + (err.message || 'Unknown error'));",
        "showToast('Could not open this PDF: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please select a valid PDF file first.');",
        "showToast('Please select a valid PDF file first.', 'warning');"
    )
    content = content.replace(
        "alert('Split failed: ' + (err.message || 'Unknown error'));",
        "showToast('Split failed: ' + (err.message || 'Unknown error'), 'error');"
    )
    content = content.replace(
        "alert('Please drop a valid PDF file.');",
        "showToast('Please drop a valid PDF file.', 'warning');"
    )
    
    # Revoke outputUrl in resetSplitWorkspace
    old_reset = """export function resetSplitWorkspace() {
  splitState.file = null;
  splitState.arrayBuffer = null;
  splitState.srcDoc = null;
  splitState.totalPages = 0;
  splitState.outputBlob = null;
  splitState.outputUrl = null;"""
    new_reset = """export function resetSplitWorkspace() {
  if (splitState.outputUrl) {
    URL.revokeObjectURL(splitState.outputUrl);
  }
  splitState.file = null;
  splitState.arrayBuffer = null;
  splitState.srcDoc = null;
  splitState.totalPages = 0;
  splitState.outputBlob = null;
  splitState.outputUrl = null;"""
    content = content.replace(old_reset, new_reset)
    
    # Revoke old outputUrl in handleSplitFileSelected
    old_handle = """  splitState.file = file;
  splitState.outputBlob = null;
  splitState.outputUrl = null;"""
    new_handle = """  if (splitState.outputUrl) {
    URL.revokeObjectURL(splitState.outputUrl);
  }
  splitState.file = file;
  splitState.outputBlob = null;
  splitState.outputUrl = null;"""
    content = content.replace(old_handle, new_handle)
    
    # Drag-and-drop counter
    old_drag = """    splitDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitDropzone.classList.add('drag-active');
    });

    splitDropzone.addEventListener('dragleave', () => {
      splitDropzone.classList.remove('drag-active');
    });

    splitDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitDropzone.classList.remove('drag-active');"""
    new_drag = """    let splitDragCounter = 0;
    splitDropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ensurePdfLibLoaded().catch(() => {});
      splitDragCounter++;
      splitDropzone.classList.add('drag-active');
    });

    splitDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    splitDropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitDragCounter = Math.max(0, splitDragCounter - 1);
      if (splitDragCounter === 0) {
        splitDropzone.classList.remove('drag-active');
      }
    });

    splitDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      splitDragCounter = 0;
      splitDropzone.classList.remove('drag-active');"""
    content = content.replace(old_drag, new_drag)
    
    write_file('assets/js/tabs/tab-split.js', content)

if __name__ == '__main__':
    optimize_merge()
    optimize_remove()
    optimize_slides()
    optimize_invert()
    optimize_compress()
    optimize_images()
    optimize_pdftoimages()
    optimize_split()
    print("All tabs successfully optimized!")
