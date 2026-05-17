import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Mic, Square, Play, Pause, Upload, Trash2, Loader2 } from "lucide-react";

interface VoiceRecorderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function VoiceRecorder({ open, onOpenChange }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [name, setName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const utils = trpc.useUtils();
  const uploadMutation = trpc.audio.uploadRecording.useMutation();

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopRecording();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setAudioBlob(null);
      setAudioUrl(null);
      setDuration(0);
      setName("");
      setPlaying(false);
      setRecording(false);
      setPermissionDenied(false);
    } else {
      stopRecording();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
  }, [open]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = recording ? "#ef4444" : "#3b82f6";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    draw();
  }, [recording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up audio analyser for waveform
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      mediaRecorder.start(250); // collect data every 250ms
      setRecording(true);
      setDuration(0);
      setAudioBlob(null);
      setAudioUrl(null);
      setPermissionDenied(false);

      // Start timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 200);

      // Start waveform
      drawWaveform();
    } catch (err: any) {
      console.error("Microphone access denied:", err);
      setPermissionDenied(true);
      toast.error("Microphone access denied. Please allow microphone access in your browser settings.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
  };

  const togglePlayback = () => {
    if (!audioUrl) return;

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setPlaying(false);
    }
    audioRef.current.play();
    setPlaying(true);
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioBlob(null);
    setAudioUrl(null);
    setDuration(0);
    setPlaying(false);
  };

  const handleUpload = async () => {
    if (!audioBlob || !name.trim()) {
      toast.error("Please enter a name for the recording");
      return;
    }

    setUploading(true);
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      await uploadMutation.mutateAsync({
        name: name.trim(),
        audioBase64: base64,
        mimeType: audioBlob.type || "audio/webm",
        duration,
      });

      toast.success("Voice memo saved successfully!");
      utils.audio.list.invalidate();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to upload recording");
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-red-500" />
            Voice Memo
          </DialogTitle>
          <DialogDescription>
            Record audio directly from your microphone to use as a broadcast message.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Waveform Canvas */}
          <div className="relative rounded-lg bg-muted/50 overflow-hidden">
            <canvas
              ref={canvasRef}
              width={400}
              height={100}
              className="w-full h-24"
            />
            {!recording && !audioBlob && (
              <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
                Tap the microphone to start recording
              </div>
            )}
          </div>

          {/* Timer */}
          <div className="text-center">
            <span className={`text-3xl font-mono tabular-nums ${recording ? "text-red-500" : "text-foreground"}`}>
              {formatTime(duration)}
            </span>
            {recording && (
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-500 font-medium">Recording</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {!audioBlob ? (
              // Recording controls
              recording ? (
                <Button
                  variant="destructive"
                  size="lg"
                  className="h-14 w-14 rounded-full p-0"
                  onClick={stopRecording}
                >
                  <Square className="h-6 w-6" />
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="lg"
                  className="h-14 w-14 rounded-full p-0 bg-red-500 hover:bg-red-600"
                  onClick={startRecording}
                >
                  <Mic className="h-6 w-6" />
                </Button>
              )
            ) : (
              // Playback controls
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12 rounded-full"
                  onClick={discardRecording}
                >
                  <Trash2 className="h-5 w-5 text-destructive" />
                </Button>
                <Button
                  variant="default"
                  size="lg"
                  className="h-14 w-14 rounded-full p-0"
                  onClick={togglePlayback}
                >
                  {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
                </Button>
              </>
            )}
          </div>

          {/* Permission denied message */}
          {permissionDenied && (
            <div className="text-center text-sm text-destructive">
              Microphone access was denied. Please check your browser settings and try again.
            </div>
          )}

          {/* Name input (shown after recording) */}
          {audioBlob && (
            <div className="space-y-2">
              <Label htmlFor="memo-name">Recording Name</Label>
              <Input
                id="memo-name"
                placeholder="e.g., Appointment Reminder Message"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {formatTime(duration)} recorded &middot; {(audioBlob.size / 1024).toFixed(0)} KB
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancel
          </Button>
          {audioBlob && (
            <Button onClick={handleUpload} disabled={uploading || !name.trim()}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Save Recording
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
