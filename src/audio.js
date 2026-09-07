import { gameConfig } from "./gameConfig.js";

/** Synthesized effects: no downloads, bounded voices, one shared audio context. */
export class GameAudio {
  constructor(config = gameConfig.audio) {
    this.config = config;
    this.voices = new Set();
    this.buffers = new Map();
    try { this.enabled = globalThis.localStorage?.getItem("game_sound") === "on"; } catch { this.enabled = false; }
  }
  async toggle() {
    this.enabled = !this.enabled;
    try { globalThis.localStorage?.setItem("game_sound",this.enabled ? "on" : "off"); } catch {}
    if(this.enabled) await this.unlock();
    else if(this.context) await this.context.suspend();
    return this.enabled;
  }
  async unlock() {
    if(!this.enabled) return;

    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.config.masterVolume;
      this.master.connect(this.context.destination);
      this.noise = this.context.createBuffer(
        1,
        this.context.sampleRate,
        this.context.sampleRate,
      );
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.ambient = this.context.createBufferSource();
      this.ambient.buffer = this.noise;
      this.ambient.loop = true;
      const filter = this.context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const gain = this.context.createGain();
      gain.gain.value = this.config.ambientVolume;
      this.ambient.connect(filter).connect(gain).connect(this.master);
      this.ambient.start();
      await this.context.resume();
      const context = this.context;
      for (const [skill, url] of Object.entries(this.config.files || {})) {
        fetch(url)
          .then((response) => {
            if (!response.ok) throw new Error("Missing sound");
            return response.arrayBuffer();
          })
          .then((data) => context.decodeAudioData(data))
          .then((buffer) => {
            if (this.context === context) this.buffers.set(skill, buffer);
          })
          .catch(() => {});
      }
    } else if (this.context.state !== "running") await this.context.resume();
    return this.context.state === "running";
  }
  play(skill, point, listener) {
    const c = this.config[skill];
    if (
      !this.enabled ||
      !c ||
      this.context?.state !== "running" ||
      this.voices.size >= this.config.maxVoices
    )
      return;
    const attenuation = listener
      ? Math.max(
          0,
          1 -
            Math.hypot(point.x - listener.x, point.z - listener.z) /
              this.config.audibleRadius,
        )
      : 1;
    if (!attenuation) return;
    const ctx = this.context,
      now = ctx.currentTime;
    const custom = this.buffers.get(skill);
    if (custom) {
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = custom;
      gain.gain.value = c.volume * attenuation;
      source.connect(gain).connect(this.master);
      this.voices.add(source);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
        this.voices.delete(source);
      };
      source.start();
      return;
    }
    const source =
      skill === "dash" ? ctx.createBufferSource() : ctx.createOscillator();
    if (skill === "dash") source.buffer = this.noise;
    else {
      source.type = skill === "hurt" ? "sawtooth" : skill.startsWith("combo") || skill === "ultimate" ? "triangle" : "sine";
      source.frequency.setValueAtTime(c.frequency, now);
      source.frequency.exponentialRampToValueAtTime(
        c.endFrequency,
        now + c.duration,
      );
    }
    const filter = ctx.createBiquadFilter();
    filter.type = skill === "hurt" ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(c.formant || c.frequency * 3, now);
    filter.frequency.exponentialRampToValueAtTime(
      c.formant ? c.formant * 0.8 : c.endFrequency,
      now + c.duration,
    );
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(c.volume * attenuation, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + c.duration);
    source.connect(filter).connect(gain).connect(this.master);
    this.voices.add(source);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      this.voices.delete(source);
    };
    source.start(now);
    source.stop(now + c.duration);
  }
  dispose() {
    for (const source of this.voices) source.stop();
    this.voices.clear();
    this.ambient?.stop();
    this.context?.close();
    this.context = null;
    this.buffers.clear();
  }
}
export const gameAudio = new GameAudio();
