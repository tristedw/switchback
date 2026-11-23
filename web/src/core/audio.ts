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

export function chime() {
  tone(880, 0, 0.12, 0.12, 'sine')
  tone(1320, 0.14, 0.18, 0.1, 'sine')
}

// two tone like a smoke alarm but less awful
export function klaxon() {
  for (let i = 0; i < 3; i++) {
    tone(960, i * 0.36, 0.16)
    tone(720, i * 0.36 + 0.18, 0.16)
  }
}

export function tick() {
  tone(2400, 0, 0.02, 0.05, 'square')
}

let lastSpoken = ''
let lastSpokenAt = 0

export function say(text: string) {
  if (typeof speechSynthesis === 'undefined') return
  // don't repeat the same thing over and over
  if (text === lastSpoken && Date.now() - lastSpokenAt < 60000) return
  lastSpoken = text
  lastSpokenAt = Date.now()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 1.05
  speechSynthesis.speak(u)
}
