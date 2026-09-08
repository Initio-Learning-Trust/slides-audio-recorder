/**
 * AudioWorklet processor that ships raw mono samples to the page.
 *
 * The graph runs at 128 frames per render quantum, which would mean hundreds
 * of postMessage calls a second, so samples are batched into larger blocks
 * before crossing the thread boundary.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const blockSize = (options && options.processorOptions && options.processorOptions.blockSize) || 2048;
    this.blockSize = blockSize;
    this.buffer = new Float32Array(blockSize);
    this.filled = 0;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.flush();
      } else if (event.data === 'stop') {
        this.flush();
        this.stopped = true;
      }
    };
  }

  /** Sends whatever is buffered, however short. */
  flush() {
    if (this.filled > 0) {
      this.port.postMessage(this.buffer.slice(0, this.filled));
      this.filled = 0;
    }
  }

  /**
   * @param {!Array<!Array<!Float32Array>>} inputs Input channel data.
   * @return {boolean} False once the node may be torn down.
   */
  process(inputs) {
    if (this.stopped) {
      return false;
    }
    const channel = inputs[0] && inputs[0][0];
    if (!channel) {
      return true;
    }
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.blockSize) {
        this.port.postMessage(this.buffer.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('sar-capture', CaptureProcessor);
