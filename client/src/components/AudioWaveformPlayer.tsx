import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward, Volume2 } from "lucide-react";

interface AudioWaveformPlayerProps {
  urls: string[];
  compact?: boolean;
}

/**
 * AudioWaveformPlayer — reliable multi-segment audio player.
 * 
 * Uses plain HTML5 Audio (no Web Audio API, no crossOrigin) to guarantee
 * playback works regardless of CORS headers on the audio source.
 * Shows a simulated waveform animation during playback.
 */
export default function AudioWaveformPlayer({ urls, compact = false }: AudioWaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Animated waveform drawing
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (playing) {
      // Animated waveform during playback
      const time = Date.now() / 150;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#3b82f6";
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const freq1 = Math.sin(x * 0.06 + time) * 5;
        const freq2 = Math.sin(x * 0.12 + time * 1.3) * 3;
        const freq3 = Math.sin(x * 0.03 + time * 0.7) * 4;
        const y = h / 2 + freq1 + freq2 + freq3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Progress overlay
      if (duration > 0) {
        const pct = progress / duration;
        ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
        ctx.fillRect(0, 0, w * pct, h);
      }

      animFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [playing, progress, duration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  // Start/stop animation when playing state changes
  useEffect(() => {
    if (playing) {
      animFrameRef.current = requestAnimationFrame(drawWaveform);
    } else {
      cancelAnimationFrame(animFrameRef.current);
      // Draw idle waveform
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = "#6b7280";
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let x = 0; x < w; x++) {
            const y = h / 2 + Math.sin(x * 0.05) * 3;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }
  }, [playing, drawWaveform]);

  const playUrl = (url: string, idx: number) => {
    setError(null);
    setLoading(true);

    // Clean up previous audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.ontimeupdate = null;
      audioRef.current.onloadedmetadata = null;
      audioRef.current.oncanplay = null;
    }

    // Create a fresh Audio element — NO crossOrigin, NO Web Audio API
    const audio = new Audio();
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setProgress(audio.currentTime);
    };

    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.ondurationchange = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.oncanplay = () => {
      setLoading(false);
    };

    audio.onended = () => {
      const next = idx + 1;
      if (next < urls.length) {
        setCurrentIdx(next);
        setProgress(0);
        setDuration(0);
        playUrl(urls[next], next);
      } else {
        // All segments finished
        setPlaying(false);
        setCurrentIdx(0);
        setProgress(0);
        setDuration(0);
      }
    };

    audio.onerror = (e) => {
      console.error("[AudioPlayer] Playback error for URL:", url, e);
      setLoading(false);
      setPlaying(false);
      setError(`Failed to play segment ${idx + 1}. The audio file may be unavailable.`);
    };

    // Set source and play
    audio.src = url;
    audio.play().then(() => {
      setLoading(false);
    }).catch((err) => {
      console.error("[AudioPlayer] play() rejected:", err.message);
      setLoading(false);
      // Don't immediately give up — some browsers need user gesture
      // The audio might still play after a small delay
      setTimeout(() => {
        if (audio.paused && audioRef.current === audio) {
          setPlaying(false);
          setError("Browser blocked autoplay. Try clicking play again.");
        }
      }, 500);
    });
  };

  const play = () => {
    if (urls.length === 0) return;
    setError(null);
    setCurrentIdx(0);
    setPlaying(true);
    setProgress(0);
    setDuration(0);
    playUrl(urls[0], 0);
  };

  const stop = () => {
    cancelAnimationFrame(animFrameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setPlaying(false);
    setLoading(false);
    setCurrentIdx(0);
    setProgress(0);
    setDuration(0);
  };

  const skipNext = () => {
    if (!playing) return;
    const next = currentIdx + 1;
    if (next < urls.length) {
      setCurrentIdx(next);
      setProgress(0);
      setDuration(0);
      playUrl(urls[next], next);
    } else {
      stop();
    }
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const canvasHeight = compact ? 32 : 48;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {playing ? (
          <>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={stop}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
            {urls.length > 1 && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={skipNext}>
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            )}
          </>
        ) : (
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={play} disabled={urls.length === 0 || loading}>
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        <canvas
          ref={canvasRef}
          width={compact ? 160 : 240}
          height={canvasHeight}
          className="rounded border bg-muted/30 flex-1"
          style={{ maxWidth: compact ? 160 : 240, height: canvasHeight }}
        />
        <span className="text-xs text-muted-foreground tabular-nums min-w-[60px]">
          {loading ? (
            <span className="text-blue-500">Loading...</span>
          ) : playing ? (
            <>
              {formatTime(progress)}/{formatTime(duration)}
              {urls.length > 1 && (
                <span className="ml-1 text-blue-500">{currentIdx + 1}/{urls.length}</span>
              )}
            </>
          ) : (
            urls.length > 0 ? (
              <span className="flex items-center gap-1">
                <Volume2 className="h-3 w-3" />
                {urls.length} seg
              </span>
            ) : "No audio"
          )}
        </span>
      </div>
      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
