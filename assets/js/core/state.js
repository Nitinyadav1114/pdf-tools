/**
 * Application State Management
 * Holds individual isolated state objects for each of the 7 PDF/Image tools.
 */

// Tab 1: Merge State
export const mergeState = {
  files: [],
  sortMode: 'time-asc',
  autoSort: true,
  mergedBlob: null,
  mergedUrl: null,
  isCancelled: false,
};

// Tab 2: Remove Pages State
export const removeState = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  totalPages: 0,
  selectedPages: new Set(), // 1-based page numbers marked for deletion
  outputBlob: null,
  outputUrl: null,
  isCancelled: false,
  renderedPages: new Set(),
  activeThumbnailWorkers: 0,
  thumbnailQueue: [],
  observer: null,
};

// Tab 3: Slides to A4 State
export const slidesState = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  totalSlides: 0,
  layout: '3-centered', // '3-centered', '3-notes', '2-centered', '4-grid', '6-grid'
  margin: 'narrow', // 'narrow', 'moderate', 'normal', 'minimal'
  slideBorder: true,
  slideNumbers: true,
  previewThumbnails: {}, // pageNum -> dataUrl
  outputBlob: null,
  outputUrl: null,
  isCancelled: false,
};

// Tab 4: Invert Colors State
export const invertState = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  totalPages: 0,
  mode: 'negative', // 'negative', 'grayscale-invert', 'dark-only', 'preserve-hue'
  quality: 'high',   // 'standard' (1.5x), 'high' (2.0x), 'ultra' (3.0x)
  pagesMode: 'all',  // 'all' or 'custom'
  customPages: '',
  previewPageNum: 1,
  originalCanvasCache: null, // cached un-inverted ImageData for instant mode switching
  outputBlob: null,
  outputUrl: null,
  isCancelled: false,
  activeRenderId: 0,
};

// Tab 5: Compress PDF State
export const compressState = {
  file: null,
  arrayBuffer: null,
  pdfDoc: null,
  totalPages: 0,
  preset: 'lossless', // 'lossless', 'recommended', 'balanced', 'extreme'
  previewPageNum: 1,
  originalCanvasCache: null,
  outputBlob: null,
  outputUrl: null,
  isCancelled: false,
  activeRenderId: 0,
};

// Tab 6: Image to PDF State
export const imagesState = {
  images: [], // array of { id, file, name, size, type, dataUrl, width, height, rotation }
  pageSize: 'fit', // 'fit', 'a4', 'letter'
  orientation: 'auto', // 'auto', 'portrait', 'landscape'
  margin: 'none', // 'none', 'small', 'normal'
  fit: 'contain', // 'contain', 'cover'
  outputBlob: null,
  outputUrl: null,
  isCancelled: false,
};

// Tab 7: PDF to Images State
export const pdfToImagesState = {
  file: null,
  arrayBuffer: null,
  pdfjsDoc: null,
  totalPages: 0,
  format: 'jpg',
  scale: 1.5,
  pageMode: 'all',
  customRangeStr: '',
  isCancelled: false,
  isConverting: false,
  images: [],
  zipBlob: null,
};

if (typeof window !== 'undefined') {
  window.pdfToImagesState = pdfToImagesState;
}
