import type { JarvisApi } from "../shared/contracts";

declare global {
  interface Window {
    jarvisApi: JarvisApi;
  }
}

export {};
