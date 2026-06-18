/**
 * Uploaded media assets (images, including SVG vector VFX) used by overlay
 * image layers. Files live under the server data directory and are served as
 * static media; overlays reference them by `url`.
 */
export interface Asset {
  id: string;
  /** Original/display file name. */
  name: string;
  /** Public URL the file is served from (under /assets). */
  url: string;
  /** MIME type, e.g. image/png, image/svg+xml. */
  mime: string;
  sizeBytes: number;
  createdAt: number;
}
