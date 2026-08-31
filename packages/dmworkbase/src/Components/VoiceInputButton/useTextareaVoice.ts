import { useRef, useCallback } from "react";
import { useVoiceInput } from "../../features/chat-composer/voice";
import type {
  ChatComposerVoiceContext,
  ChatComposerVoiceHost,
} from "../../features/chat-composer/ports";
import type { VoiceMode } from "../../Service/VoiceService";

export type ReplaceMode = "all" | "selection" | "insert";

export interface SelectionRange {
  from: number;
  to: number;
}

export interface UseTextareaVoiceOptions {
  voiceHost: ChatComposerVoiceHost;
  /**
   * Native text target. Rich-text hosts may omit it and insert transcriptions
   * themselves through `onTranscribed`.
   */
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onTranscribed: (text: string, replaceMode: ReplaceMode, savedSelectionRange?: SelectionRange) => void;
  getCurrentText?: () => string;
  enableEditMode?: boolean;
  getChatContext?: () => ChatComposerVoiceContext | Promise<ChatComposerVoiceContext>;
}

export interface UseTextareaVoiceReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  startRecording: (mode?: VoiceMode) => void;
  stopRecordingAndTranscribe: () => void;
  cancelRecording: () => void;
  isVoiceEnabled: boolean;
  localAvailable: boolean;
}

export default function useTextareaVoice({
  voiceHost,
  inputRef,
  onTranscribed,
  getCurrentText,
  enableEditMode = false,
  getChatContext,
}: UseTextareaVoiceOptions): UseTextareaVoiceReturn {
  const hadSelectionRef = useRef(false);
  const savedSelectionRangeRef = useRef<SelectionRange>({ from: 0, to: 0 });
  const savedSelectedTextRef = useRef<string | undefined>(undefined);
  const recordingModeRef = useRef<VoiceMode>("append_only");

  const onTranscribedRef = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;
  const getCurrentTextRef = useRef(getCurrentText);
  getCurrentTextRef.current = getCurrentText;

  const {
    isRecording,
    isTranscribing,
    startRecording: rawStartRecording,
    stopRecordingAndTranscribe: rawStop,
    cancelRecording,
    isVoiceEnabled,
    localAvailable,
  } = useVoiceInput({
    voiceHost,
    onTranscribed: (text: string) => {
      const mode = recordingModeRef.current;
      const range = savedSelectionRangeRef.current;
      if (mode === "edit_only") {
        if (hadSelectionRef.current) {
          onTranscribedRef.current(text, "selection", range);
        } else {
          onTranscribedRef.current(text, "all", range);
        }
      } else {
        onTranscribedRef.current(text, "insert", range);
      }
    },
    getChatContext,
    mode: "append_only",
    onError: () => {},
  });

  const startRecording = useCallback(
    (mode?: VoiceMode) => {
      const el = inputRef?.current ?? null;
      // A native host whose ref has not attached yet keeps the old no-op
      // behaviour. Omitting inputRef explicitly opts a rich-text host into
      // ref-less append mode.
      if (inputRef !== undefined && !el) return;

      if (el) {
        const selStart = el.selectionStart ?? 0;
        const selEnd = el.selectionEnd ?? 0;
        hadSelectionRef.current = selStart !== selEnd;
        savedSelectionRangeRef.current = { from: selStart, to: selEnd };
        savedSelectedTextRef.current =
          selStart !== selEnd ? el.value.slice(selStart, selEnd) : undefined;
      } else {
        hadSelectionRef.current = false;
        savedSelectionRangeRef.current = { from: 0, to: 0 };
        savedSelectedTextRef.current = undefined;
      }

      // Edit mode depends on a native selection. A ref-less host always owns
      // insertion and therefore cannot request replace-all semantics.
      const effectiveMode = el ? (mode ?? "append_only") : "append_only";
      recordingModeRef.current = effectiveMode;
      rawStartRecording(effectiveMode);
    },
    [inputRef, rawStartRecording],
  );

  const stopRecordingAndTranscribe = useCallback(() => {
    const contextText =
      recordingModeRef.current === "edit_only"
        ? (savedSelectedTextRef.current || getCurrentTextRef.current?.())
        : undefined;
    rawStop(contextText);
  }, [rawStop]);

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecordingAndTranscribe,
    cancelRecording,
    isVoiceEnabled,
    localAvailable,
  };
}
