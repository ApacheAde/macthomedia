
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { throttle } from '../utils/throttle';

import './PromptController';
import './PlayPauseButton';
import type { PlaybackState, Prompt } from '../types';
import { MidiDispatcher } from '../utils/MidiDispatcher';

/** The grid of prompt inputs. */
@customElement('prompt-dj-midi')
export class PromptDjMidi extends LitElement {
  static styles = css`
    :host {
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;
      position: relative;
      overflow: hidden;
    }
    #background {
      will-change: background-image;
      position: absolute;
      height: 100%;
      width: 100%;
      z-index: -1;
      background: #050505;
      transition: opacity 0.5s ease;
    }
    #visualizer-canvas {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -1;
      opacity: 0.6;
      pointer-events: none;
    }
    #grid {
      width: 80vmin;
      height: 80vmin;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 2.5vmin;
      margin-top: 4vmin;
      position: relative;
      z-index: 10;
    }
    prompt-controller {
      width: 100%;
    }
    play-pause-button {
      position: relative;
      width: 15vmin;
      margin-top: 2vmin;
      z-index: 20;
    }
    #buttons {
      position: absolute;
      top: 0;
      left: 0;
      padding: 20px;
      display: flex;
      gap: 10px;
      z-index: 30;
    }
    button {
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(5px);
      -webkit-font-smoothing: antialiased;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      user-select: none;
      padding: 6px 12px;
      transition: all 0.2s ease;
      &:hover {
        background: rgba(255, 255, 255, 0.2);
        border-color: #fff;
      }
      &.active {
        background-color: #fff;
        color: #000;
      }
    }
    select {
      font: inherit;
      padding: 5px 10px;
      background: rgba(255, 255, 255, 0.9);
      color: #000;
      border-radius: 4px;
      border: none;
      outline: none;
      cursor: pointer;
    }
    .vignette {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle, transparent 40%, rgba(0,0,0,0.8) 150%);
      pointer-events: none;
      z-index: 5;
    }
  `;

  private prompts: Map<string, Prompt>;
  private midiDispatcher: MidiDispatcher;

  @property({ type: Boolean }) private showMidi = false;
  @property({ type: String }) public playbackState: PlaybackState = 'stopped';
  @state() public audioLevel = 0;
  @state() public frequencyData: Uint8Array = new Uint8Array(0);
  @state() private midiInputIds: string[] = [];
  @state() private activeMidiInputId: string | null = null;

  @property({ type: Object })
  private filteredPrompts = new Set<string>();

  @query('#visualizer-canvas') private canvas!: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(initialPrompts: Map<string, Prompt>) {
    super();
    this.prompts = initialPrompts;
    this.midiDispatcher = new MidiDispatcher();
  }

  firstUpdated() {
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.drawLoop();
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private drawLoop() {
    this.drawVisualizer();
    requestAnimationFrame(() => this.drawLoop());
  }

  private drawVisualizer() {
    if (!this.ctx || !this.canvas || !this.frequencyData.length) return;

    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    const barCount = this.frequencyData.length;
    const barWidth = (width / barCount) * 1.5;
    let x = 0;

    // Drawing a mirrored frequency visualizer at the bottom
    for (let i = 0; i < barCount; i++) {
      const barHeight = (this.frequencyData[i] / 255) * (height * 0.4);
      
      // Use primary color from active prompts or default neon
      const activeColor = Array.from(this.prompts.values()).find(p => p.weight > 0.5)?.color || '#ff00ff';
      
      this.ctx.fillStyle = activeColor;
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = activeColor;

      // Draw mirrored bars
      this.ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
      this.ctx.fillRect(width - x - barWidth, height - barHeight, barWidth - 2, barHeight);

      // Add a small pulse to the top of the bar
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(x, height - barHeight, barWidth - 2, 2);
      this.ctx.fillRect(width - x - barWidth, height - barHeight, barWidth - 2, 2);

      x += barWidth;
    }
    
    // Reset shadow for performance
    this.ctx.shadowBlur = 0;
  }

  private handlePromptChanged(e: CustomEvent<Prompt>) {
    const { promptId, text, weight, cc } = e.detail;
    const prompt = this.prompts.get(promptId);

    if (!prompt) {
      console.error('prompt not found', promptId);
      return;
    }

    prompt.text = text;
    prompt.weight = weight;
    prompt.cc = cc;

    const newPrompts = new Map(this.prompts);
    newPrompts.set(promptId, prompt);

    this.prompts = newPrompts;
    (this as any).requestUpdate();

    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent('prompts-changed', { detail: this.prompts }),
    );
  }

  private readonly makeBackground = throttle(
    () => {
      const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
      const MAX_WEIGHT = 0.5;
      const MAX_ALPHA = 0.5;

      const bg: string[] = [];

      [...this.prompts.values()].forEach((p, i) => {
        // Boost background glow based on audio level
        const audioBoost = this.audioLevel * 0.3;
        const alphaPct = clamp01((p.weight / MAX_WEIGHT) + audioBoost) * MAX_ALPHA;
        const alpha = Math.round(alphaPct * 0xff).toString(16).padStart(2, '0');

        const stop = (p.weight / 2) + audioBoost;
        const x = (i % 4) / 3;
        const y = Math.floor(i / 4) / 3;
        const s = `radial-gradient(circle at ${x * 100}% ${y * 100}%, ${p.color}${alpha} 0px, ${p.color}00 ${stop * 100}%)`;

        bg.push(s);
      });

      return bg.join(', ');
    },
    30,
  );

  private toggleShowMidi() {
    return this.setShowMidi(!this.showMidi);
  }

  public async setShowMidi(show: boolean) {
    this.showMidi = show;
    if (!this.showMidi) return;
    try {
      const inputIds = await this.midiDispatcher.getMidiAccess();
      this.midiInputIds = inputIds;
      this.activeMidiInputId = this.midiDispatcher.activeMidiInputId;
    } catch (e) {
      this.showMidi = false;
      (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('error', {detail: (e as any).message}));
    }
  }

  private handleMidiInputChange(event: Event) {
    const selectElement = event.target as HTMLSelectElement;
    const newMidiId = selectElement.value;
    this.activeMidiInputId = newMidiId;
    this.midiDispatcher.activeMidiInputId = newMidiId;
  }

  private playPause() {
    (this as unknown as HTMLElement).dispatchEvent(new CustomEvent('play-pause'));
  }

  public addFilteredPrompt(prompt: string) {
    this.filteredPrompts = new Set([...this.filteredPrompts, prompt]);
  }

  render() {
    const bg = styleMap({
      backgroundImage: this.makeBackground(),
    });

    const gridStyles = styleMap({
      transform: `scale(${1 + this.audioLevel * 0.05})`, // Subtle pulse
      filter: `brightness(${1 + this.audioLevel * 0.5})`,
    });

    return html`
      <div id="background" style=${bg}></div>
      <canvas id="visualizer-canvas"></canvas>
      <div class="vignette"></div>
      
      <div id="buttons">
        <button
          @click=${this.toggleShowMidi}
          class=${this.showMidi ? 'active' : ''}
          >MIDI</button
        >
        <select
          @change=${this.handleMidiInputChange}
          .value=${this.activeMidiInputId || ''}
          style=${this.showMidi ? '' : 'visibility: hidden'}>
          ${this.midiInputIds.length > 0
        ? this.midiInputIds.map(
          (id) =>
            html`<option value=${id}>
                    ${this.midiDispatcher.getDeviceName(id)}
                  </option>`,
        )
        : html`<option value="">No devices found</option>`}
        </select>
      </div>
      
      <div id="grid" style=${gridStyles}>${this.renderPrompts()}</div>
      
      <play-pause-button 
        .playbackState=${this.playbackState} 
        @click=${this.playPause}
        style=${styleMap({ transform: `scale(${1 + this.audioLevel * 0.1})` })}
      ></play-pause-button>
    `;
  }

  private renderPrompts() {
    return [...this.prompts.values()].map((prompt) => {
      return html`<prompt-controller
        promptId=${prompt.promptId}
        ?filtered=${this.filteredPrompts.has(prompt.text)}
        cc=${prompt.cc}
        text=${prompt.text}
        weight=${prompt.weight}
        color=${prompt.color}
        .midiDispatcher=${this.midiDispatcher}
        .showCC=${this.showMidi}
        .audioLevel=${this.audioLevel}
        @prompt-changed=${this.handlePromptChanged}>
      </prompt-controller>`;
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-dj-midi': PromptDjMidi;
  }
}
