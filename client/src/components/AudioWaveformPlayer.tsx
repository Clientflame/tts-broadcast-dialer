import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipForward } from "lucide-react";

interface AudioWaveformPlayerProps {
  urls: string[];
  compact?: boolean;
}

export default function AudioWaveformPlayer({ urls, compact = false }: AudioWaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillRect(0, 0, w, h);

    // Waveform
    ctx.lineWidth = 2;
    ctx.strokeStyle = playing ? "#3b82f6" : "#6b7280";
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Progress bar
    if (duration > 0) {
      const pct = progress / duration;
      ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
      ctx.fillRect(0, 0, w * pct, h);
    }

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, [playing, progress, duration]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close();
      }
    };
  }, []);

  const setupAudio = (url: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = url;
    audioRef.current = audio;

    // Create audio context if needed
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    const audioCtx = audioCtxRef.current;

    // Create analyser
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Connect source -> analyser -> destination
    try {
      sourceRef.current = audioCtx.createMediaElementSource(audio);
      sourceRef.current.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch {
      // Source may already be connected
      analyser.connect(audioCtx.destination);
    }

    audio.ontimeupdate = () => {
      setProgress(audio.currentTime);
    };
    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };

    return audio;
  };

  const playUrl = (url: string, idx: number) => {
    const audio = setupAudio(url);

    audio.onended = () => {
      const next = idx + 1;
      if (next < urls.length) {
        setCurrentIdx(next);
        playUrl(urls[next], next);
      } else {
        setPlaying(false);
        setCurrentIdx(0);
        setProgress(0);
        cancelAnimationFrame(animFrameRef.current);
      }
    };

    audio.onerror = () => {
      setPlaying(false);
      cancelAnimationFrame(animFrameRef.current);
    };

    audio.play().catch(() => setPlaying(false));
    animFrameRef.current = requestAnimationFrame(drawWaveform);
  };

  const play = () => {
    if (urls.length === 0) return;
    setCurrentIdx(0);
    setPlaying(true);
    setProgress(0);
    playUrl(urls[0], 0);
  };

  const stop = () => {
    cancelAnimationFrame(animFrameRef.current);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    sourceRef.current = null;
    setPlaying(false);
    setCurrentIdx(0);
    setProgress(0);
  };

  const skipNext = () => {
    if (!playing) return;
    const next = currentIdx + 1;
    if (next < urls.length) {
      setCurrentIdx(next);
      playUrl(urls[next], next);
    } else {
      stop();
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const canvasHeight = compact ? 32 : 48;

  // Draw idle waveform
  useEffect(() => {
    if (!playing && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 1;
      ctx.beginPath();
      // Draw a flat line with small random bumps
      for (let x = 0; x < w; x++) {
        const y = h / 2 + Math.sin(x * 0.05) * 3;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [playing, urls]);

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
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={play} disabled={urls.length === 0}>
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
          {playing ? (
            <>
              {formatTime(progress)}/{formatTime(duration)}
              {urls.length > 1 && (
                <span className="ml-1 text-blue-500">{currentIdx + 1}/{urls.length}</span>
              )}
            </>
          ) : (
            urls.length > 0 ? `${urls.length} seg` : "No audio"
          )}
        </span>
      </div>
    </div>
  );
}
