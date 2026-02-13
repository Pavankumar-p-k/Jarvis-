import { useEffect } from "react";

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

export const useVoiceCapture = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (typeof window.jarvisApi?.pushVoiceAudio !== "function") {
      return;
    }

    if (typeof window.MediaRecorder === "undefined") {
      return;
    }

    let mounted = true;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;

    const handleChunk = async (blob: Blob): Promise<void> => {
      if (!mounted || blob.size === 0) {
        return;
      }

      try {
        const buffer = await blob.arrayBuffer();
        const base64Audio = toBase64(new Uint8Array(buffer));
        await window.jarvisApi.pushVoiceAudio(base64Audio, blob.type || "audio/webm");
      } catch {
        // Ignore intermittent recorder chunk errors.
      }
    };

    const start = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event) => {
          void handleChunk(event.data);
        };
        recorder.start(2500);
      } catch {
        // If mic permission is denied, leave voice capture disabled silently.
      }
    };

    void start();

    return () => {
      mounted = false;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);
};
