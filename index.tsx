
/**
 * @fileoverview Control real time music with a MIDI controller
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PlaybackState, Prompt } from './types';
import { GoogleGenAI, LiveMusicFilteredPrompt } from '@google/genai';
import { PromptDjMidi } from './components/PromptDjMidi';
import { ToastMessage } from './components/ToastMessage';
import { LiveMusicHelper } from './utils/LiveMusicHelper';
import { AudioAnalyser } from './utils/AudioAnalyser';

// Using the provided API key from environment
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = 'lyria-realtime-exp';

function main() {
  const initialPrompts = buildInitialPrompts();

  const pdjMidi = new PromptDjMidi(initialPrompts);
  document.body.appendChild(pdjMidi as unknown as Node);

  const toastMessage = new ToastMessage();
  document.body.appendChild(toastMessage as unknown as Node);

  const liveMusicHelper = new LiveMusicHelper(ai, model);
  liveMusicHelper.setWeightedPrompts(initialPrompts);

  const audioContext = liveMusicHelper.audioContext;
  const audioAnalyser = new AudioAnalyser(audioContext);
  liveMusicHelper.extraDestination = audioAnalyser.node;

  (pdjMidi as unknown as HTMLElement).addEventListener('prompts-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<Map<string, Prompt>>;
    const prompts = customEvent.detail;
    liveMusicHelper.setWeightedPrompts(prompts);
  }));

  (pdjMidi as unknown as HTMLElement).addEventListener('play-pause', () => {
    liveMusicHelper.playPause();
  });

  liveMusicHelper.addEventListener('playback-state-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<PlaybackState>;
    const playbackState = customEvent.detail;
    pdjMidi.playbackState = playbackState;
    if (playbackState === 'playing') {
      audioAnalyser.start();
    } else if (playbackState === 'stopped' || playbackState === 'paused') {
      audioAnalyser.stop();
      pdjMidi.audioLevel = 0;
      pdjMidi.frequencyData = new Uint8Array(0);
    }
  }));

  liveMusicHelper.addEventListener('filtered-prompt', ((e: Event) => {
    const customEvent = e as CustomEvent<LiveMusicFilteredPrompt>;
    const filteredPrompt = customEvent.detail;
    toastMessage.show(filteredPrompt.filteredReason!)
    pdjMidi.addFilteredPrompt(filteredPrompt.text!);
  }));

  const errorToast = ((e: Event) => {
    const customEvent = e as CustomEvent<string>;
    const error = customEvent.detail;
    toastMessage.show(error);
  });

  liveMusicHelper.addEventListener('error', errorToast);
  (pdjMidi as unknown as HTMLElement).addEventListener('error', errorToast);

  audioAnalyser.addEventListener('audio-data-changed', ((e: Event) => {
    const customEvent = e as CustomEvent<{level: number, frequencies: Uint8Array}>;
    pdjMidi.audioLevel = customEvent.detail.level;
    pdjMidi.frequencyData = customEvent.detail.frequencies;
  }));
}

function buildInitialPrompts() {
  const prompts = new Map<string, Prompt>();

  // The first 7 prompts match the user's specific request
  const coreGenrePromptCount = 7;

  for (let i = 0; i < DEFAULT_PROMPTS.length; i++) {
    const promptId = `prompt-${i}`;
    const prompt = DEFAULT_PROMPTS[i];
    const { text, color } = prompt;
    prompts.set(promptId, {
      promptId,
      text,
      // Start with the specific genre prompts "On" (weight 1)
      weight: i < coreGenrePromptCount ? 1 : 0,
      cc: i,
      color,
    });
  }

  return prompts;
}

const DEFAULT_PROMPTS = [
  { color: '#ff00ff', text: 'Happy Hardstyle' },
  { color: '#9d00ff', text: 'Techno' },
  { color: '#00f2ff', text: 'Bounce' },
  { color: '#fffb00', text: 'Piano' },
  { color: '#00ff88', text: 'Rhythm' },
  { color: '#ff3c00', text: '167 BPM' },
  { color: '#5200ff', text: 'C Sharp' },
  { color: '#ff0055', text: 'Hardstyle Kick' },
  { color: '#00ffcc', text: 'Reverse Bass' },
  { color: '#fff000', text: 'Euphoric Lead' },
  { color: '#ff00ff', text: 'Rave Piano' },
  { color: '#00ff66', text: 'Offbeat Bass' },
  { color: '#a200ff', text: 'Supersaw' },
  { color: '#ffff00', text: 'Hands Up' },
  { color: '#4d00ff', text: 'Dancecore' },
  { color: '#ff0077', text: 'Makina' },
];

main();
