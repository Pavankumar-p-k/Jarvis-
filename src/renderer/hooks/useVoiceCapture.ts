import { useEffect } from "react";

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
};

const mergeSamples = (chunks: Float32Array[], totalLength: number): Float32Array => {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
};

const encodePcm16Wav = (samples: Float32Array, sampleRate: number): Uint8Array => {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLength = samples.length * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataLength);
  const view = new DataView(wav);

  const writeText = (offset: number, text: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, dataLength, true);

  let writeOffset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    view.setInt16(writeOffset, Math.round(value), true);
    writeOffset += 2;
  }

  return new Uint8Array(wav);
};

/**
 * Captures microphone audio as local PCM/WAV chunks for offline wake+STT processing.
 */
export const useVoiceCapture = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (typeof window.jarvisApi?.pushVoiceAudio !== "function") {
      return;
    }

    let mounted = true;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let processor: ScriptProcessorNode | null = null;
    let muteNode: GainNode | null = null;

    const sampleChunks: Float32Array[] = [];
    let totalSamples = 0;

    const flush = async (): Promise<void> => {
      if (!mounted || totalSamples <= 0 || !context) {
        return;
      }

      const merged = mergeSamples(sampleChunks, totalSamples);
      sampleChunks.length = 0;
      totalSamples = 0;

      const wavBytes = encodePcm16Wav(merged, context.sampleRate);
      const base64Audio = toBase64(wavBytes);
      try {
        await window.jarvisApi.pushVoiceAudio(base64Audio, "audio/wav");
      } catch {
        // Ignore transient IPC errors while streaming voice chunks.
      }
    };

    const start = async (): Promise<void> => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });

        if (!mounted) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        context = new window.AudioContext({ sampleRate: 16_000 });
        source = context.createMediaStreamSource(stream);
        processor = context.createScriptProcessor(4096, 1, 1);
        muteNode = context.createGain();
        muteNode.gain.value = 0;

        processor.onaudioprocess = (event) => {
          if (!mounted) {
            return;
          }

          const input = event.inputBuffer.getChannelData(0);
          const snapshot = new Float32Array(input.length);
          snapshot.set(input);
          sampleChunks.push(snapshot);
          totalSamples += snapshot.length;

          const targetSamples = Math.floor(context!.sampleRate * 0.85);
          if (totalSamples >= targetSamples) {
            void flush();
          }
        };

        source.connect(processor);
        processor.connect(muteNode);
        muteNode.connect(context.destination);
      } catch {
        // If mic permission fails, leave voice disabled gracefully.
      }
    };

    void start();

    return () => {
      mounted = false;
      void flush();
      processor?.disconnect();
      source?.disconnect();
      muteNode?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [enabled]);
};
