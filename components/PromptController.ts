
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import './WeightKnob';
import type { WeightKnob } from './WeightKnob';

import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static styles = css`
    .prompt {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease;
    }
    .prompt.active {
      transform: scale(1.05);
    }
    weight-knob {
      width: 75%;
      flex-shrink: 0;
    }
    #midi {
      font-family: 'Courier New', monospace;
      text-align: center;
      font-size: 1.2vmin;
      border: 1px solid #ffffff44;
      border-radius: 4px;
      padding: 1px 4px;
      color: #ffffffaa;
      background: #000000aa;
      cursor: pointer;
      visibility: hidden;
      user-select: none;
      margin-top: 6px;
      .learn-mode & {
        color: #ffcc00;
        border-color: #ffcc00;
        box-shadow: 0 0 10px #ffcc0044;
      }
      .show-cc & {
        visibility: visible;
      }
    }
    #text {
      font-weight: 700;
      font-size: 1.6vmin;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      max-width: 18vmin;
      min-width: 2vmin;
      padding: 4px 8px;
      margin-top: 8px;
      flex-shrink: 0;
      border-radius: 4px;
      text-align: center;
      white-space: pre;
      overflow: hidden;
      border: 1px solid transparent;
      outline: none;
      -webkit-font-smoothing: antialiased;
      background: #111;
      color: #eee;
      box-shadow: 0 2px 4px rgba(0,0,0,0.5);
      transition: all 0.3s ease;
      &:not(:focus) {
        text-overflow: ellipsis;
      }
      &:focus {
        background: #222;
        border-color: #444;
      }
    }
    :host([filtered]) {
      weight-knob { 
        opacity: 0.3;
        filter: grayscale(1);
      }
      #text {
        background: #500;
        color: #f66;
        text-decoration: line-through;
      }
    }
    @media only screen and (max-width: 600px) {
      #text {
        font-size: 2.5vmin;
      }
      weight-knob {
        width: 65%;
      }
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: Boolean, reflect: true }) filtered = false;

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0;

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('weight-knob') private weightInput!: WeightKnob;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;

  private lastValidText!: string;

  connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        this.weight = (value / 127) * 2;
        this.dispatchPromptChange();
      }
    });
  }

  firstUpdated() {
    this.textInput.setAttribute('contenteditable', 'plaintext-only');
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    if (changedProperties.has('text') && this.textInput) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    (this as unknown as HTMLElement).dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
      }),
    );
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.textInput.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetText();
      this.textInput.blur();
    }
  }

  private resetText() {
    this.text = this.lastValidText;
    this.textInput.textContent = this.lastValidText;
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.resetText();
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    this.textInput.scrollLeft = 0;
  }

  private onFocus() {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private updateWeight() {
    this.weight = this.weightInput.value;
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }

  render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
      'show-cc': this.showCC,
      'active': this.weight > 0.05
    });

    const textStyles = styleMap({
       boxShadow: this.weight > 0.1 ? `0 0 ${this.weight * 10}px ${this.color}aa, inset 0 0 5px ${this.color}66` : 'none',
       borderColor: this.weight > 0.1 ? this.color : 'transparent',
       color: this.weight > 0.1 ? '#fff' : '#aaa'
    });

    return html`<div class=${classes}>
      <weight-knob
        id="weight"
        .value=${this.weight}
        color=${this.filtered ? '#333' : this.color}
        .audioLevel=${this.filtered ? 0 : this.audioLevel}
        @input=${this.updateWeight}></weight-knob>
      <span
        id="text"
        style=${textStyles}
        spellcheck="false"
        @focus=${this.onFocus}
        @keydown=${this.onKeyDown}
        @blur=${this.updateText}></span>
      <div id="midi" @click=${this.toggleLearnMode}>
        ${this.learnMode ? 'LEARN' : `CC:${this.cc}`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
