/* Audio-thread PCM queue. Keep processing allocation-free between reports. */
class ListeningPCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.epoch = 0;
    this.items = [];
    this.playing = false;
    this.rate = 1;
    this.reportFrames = 0;
    this.port.onmessage = ({ data }) => this.command(data);
  }
  command(data) {
    if (data.type === "reset") {
      this.epoch = data.epoch;
      this.items = [];
      this.playing = false;
      this.rate = data.rate;
      this.first = data.segment;
      this.offset = data.offset;
      return;
    }
    if (data.epoch !== this.epoch) return;
    if (data.type === "play") this.playing = true;
    else if (data.type === "pause") this.playing = false;
    else if (data.type === "rate") this.rate = data.rate;
    else if (data.type === "begin") {
      if (!this.items.some((item) => item.index === data.segment))
        this.items.push({
          index: data.segment,
          buffers: [],
          frames: 0,
          cursor: data.segment === this.first ? this.offset * 24000 : 0,
          complete: false,
          trailing: null,
          buffering: true,
        });
    } else {
      const item = this.items.find((value) => value.index === data.segment);
      if (!item) return;
      if (data.type === "complete") item.complete = true;
      else if (data.type === "audio") {
        const input = data.bytes;
        let bytes = input;
        if (item.trailing !== null) {
          bytes = new Uint8Array(input.length + 1);
          bytes[0] = item.trailing;
          bytes.set(input, 1);
        }
        const count = Math.floor(bytes.length / 2);
        const samples = new Float32Array(count);
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        for (let i = 0; i < count; i++)
          samples[i] = view.getInt16(i * 2, true) / 32768;
        item.trailing = bytes.length % 2 ? bytes[bytes.length - 1] : null;
        if (count) {
          item.buffers.push({ start: item.frames, data: samples });
          item.frames += count;
        }
      }
    }
  }
  process(_inputs, outputs) {
    const output = outputs[0][0];
    let waiting = true;
    for (let i = 0; i < output.length; i++) {
      let item = this.items[0];
      if (!this.playing || !item) break;
      if (
        item.complete &&
        item.cursor >= item.frames &&
        this.items.length > 1
      ) {
        this.items.shift();
        item = this.items[0];
      }
      if (item.buffering && !item.complete && item.frames - item.cursor < 3600)
        break;
      item.buffering = false;
      if (item.cursor >= item.frames) {
        item.buffering = true;
        break;
      }
      while (item.buffers.length > 1 && item.cursor >= item.buffers[1].start)
        item.buffers.shift();
      const buffer = item.buffers[0];
      if (!buffer) break;
      const local = item.cursor - buffer.start;
      const frame = Math.floor(local);
      const a = buffer.data[frame] ?? 0;
      const b = buffer.data[frame + 1] ?? item.buffers[1]?.data[0] ?? a;
      output[i] = a + (b - a) * (local - frame);
      item.cursor += (24000 / sampleRate) * this.rate;
      waiting = false;
    }
    this.reportFrames += output.length;
    if (this.reportFrames >= sampleRate / 20) {
      this.reportFrames = 0;
      const item = this.items[0];
      if (item)
        this.port.postMessage({
          epoch: this.epoch,
          segment: item.index,
          time: Math.min(item.cursor, item.frames) / 24000,
          waiting,
          ended:
            item.complete &&
            item.cursor >= item.frames &&
            this.items.length === 1,
        });
    }
    return true;
  }
}
registerProcessor("ril-listening-pcm", ListeningPCM);
