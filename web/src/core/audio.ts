// alarm sounds are synthesized, no audio files to ship. browsers need a user gesture first,
// so unlock() gets called on the first tap anywhere.

let ctx: AudioContext | undefined

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
}

function tone(freq: number, start: number, dur: number, gain = 0.18, type: OscillatorType = 'square') {
  if (!ctx) return
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ctx.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.01)
  g.gain.setValueAtTime(gain, ctx.currentTime + start + dur - 0.03)
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + start + dur)
  osc.connect(g).connect(ctx.destination)
  osc.start(ctx.currentTime + start)
  osc.stop(ctx.currentTime + start + dur + 0.02)
}

// one soft blip for warnings, two for critical. that's it
export function beep() {
  tone(1320, 0, 0.07, 0.06, 'sine')
}

export function doubleBeep() {
  tone(1320, 0, 0.07, 0.07, 'sine')
  tone(1320, 0.14, 0.07, 0.07, 'sine')
}
