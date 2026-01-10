"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TTS_VOICE_OPTIONS } from "~/lib/tts-voices";

interface VoiceSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
}

/**
 * Shared voice selector dropdown component
 * Used in preferences page and audio player
 */
export function VoiceSelector({
  value,
  onValueChange,
  disabled = false,
  triggerClassName = "w-[200px] border-gray-600 bg-gray-700/50",
}: VoiceSelectorProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder="Select a voice" />
      </SelectTrigger>
      <SelectContent className="max-h-80 overflow-y-auto">
        {/* Standard voices - 1x price */}
        <div className="px-2 py-1.5">
          <div className="text-xs font-semibold text-gray-300">Standard</div>
          <div className="text-[10px] text-gray-500">
            Basic quality • 1x usage • Best value
          </div>
        </div>
        {TTS_VOICE_OPTIONS.filter((v) => v.tier === "standard").map((voice) => (
          <SelectItem key={voice.name} value={voice.name}>
            <div className="flex w-full items-center justify-between gap-3">
              <span>{voice.label}</span>
              <span className="text-xs text-gray-400">{voice.description}</span>
            </div>
          </SelectItem>
        ))}

        {/* WaveNet voices - 4x price */}
        <div className="mt-2 border-t border-gray-600 px-2 py-1.5">
          <div className="text-xs font-semibold text-gray-300">WaveNet</div>
          <div className="text-[10px] text-gray-500">
            Neural network • 4x usage • Natural sounding
          </div>
        </div>
        {TTS_VOICE_OPTIONS.filter((v) => v.tier === "wavenet").map((voice) => (
          <SelectItem key={voice.name} value={voice.name}>
            <div className="flex w-full items-center justify-between gap-3">
              <span>{voice.label}</span>
              <span className="text-xs text-gray-400">{voice.description}</span>
            </div>
          </SelectItem>
        ))}

        {/* Neural2 voices - 4x price */}
        <div className="mt-2 border-t border-gray-600 px-2 py-1.5">
          <div className="text-xs font-semibold text-gray-300">Neural2</div>
          <div className="text-[10px] text-gray-500">
            Latest AI • 4x usage • Most natural & expressive
          </div>
        </div>
        {TTS_VOICE_OPTIONS.filter((v) => v.tier === "neural2").map((voice) => (
          <SelectItem key={voice.name} value={voice.name}>
            <div className="flex w-full items-center justify-between gap-3">
              <span>{voice.label}</span>
              <span className="text-xs text-gray-400">{voice.description}</span>
            </div>
          </SelectItem>
        ))}

        {/* Studio voices - 16x price */}
        <div className="mt-2 border-t border-gray-600 px-2 py-1.5">
          <div className="text-xs font-semibold text-gray-300">Studio</div>
          <div className="text-[10px] text-gray-500">
            Professional • 16x usage • Highest quality
          </div>
        </div>
        {TTS_VOICE_OPTIONS.filter((v) => v.tier === "studio").map((voice) => (
          <SelectItem key={voice.name} value={voice.name}>
            <div className="flex w-full items-center justify-between gap-3">
              <span>{voice.label}</span>
              <span className="text-xs text-gray-400">{voice.description}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
