import test from "node:test";
import assert from "node:assert/strict";
import { GameAudio } from "./audio.js";

test("audio respects mute, distance, voice limits and releases finished voices", async (t) => {
  const original = globalThis.AudioContext;
  const param = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const node = () => ({
    gain: param(),
    frequency: param(),
    connect(next) {
      return next;
    },
    disconnect() {
      this.disconnected = true;
    },
    start() {},
    stop() {},
  });
  globalThis.AudioContext = class {
    state = "suspended";
    sampleRate = 100;
    currentTime = 0;
    destination = {};
    createGain() {
      return node();
    }
    createBiquadFilter() {
      return node();
    }
    createBufferSource() {
      return node();
    }
    createOscillator() {
      return node();
    }
    createBuffer() {
      return { getChannelData: () => new Float32Array(100) };
    }
    async resume() {
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    close() {
      this.state = "closed";
    }
  };
  t.after(() => {
    globalThis.AudioContext = original;
  });
  const audio = new GameAudio();
  const point = { x: 0, z: 0 };
  audio.play("basic", point, point);
  assert.equal(audio.voices.size, 0);
  assert.equal(await audio.toggle(), true);
  for (const skill of ["basic", "dash", "ultimate"])
    audio.play(skill, point, point);
  assert.equal(audio.voices.size, 3);
  audio.play("basic", point, { x: 100, z: 0 });
  assert.equal(audio.voices.size, 3);
  const voice = [...audio.voices][0];
  voice.onended();
  assert.ok(voice.disconnected);
  for (let i = 0; i < 50; i++) audio.play("basic", point, point);
  assert.equal(audio.voices.size, audio.config.maxVoices);
  assert.equal(await audio.toggle(), false);
  audio.dispose();
  assert.equal(audio.voices.size, 0);
  assert.equal(audio.context, null);
});
