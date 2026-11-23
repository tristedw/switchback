// pretends to be the esp32 so the homebase can be tested on a laptop
// usage: node tools/fake-esp.js [http://localhost:8787]

const target = (process.argv[2] || 'http://localhost:8787') + '/api/ingest'
let soc = 82
let fridge = 3.5
let fresh = 70

setInterval(async () => {
  soc = Math.max(0, soc - 0.01)
  fridge += (Math.random() - 0.5) * 0.2
  fresh = Math.max(0, fresh - (Math.random() < 0.02 ? 1.5 : 0))
  const data = {
    'house.soc': soc,
    'house.v': 13.0 + soc * 0.004,
    'house.a': -3.1 + Math.random() * 0.4,
    'solar.w': 0,
    fresh,
    grey: 40,
    black: 55,
    propane: 6.1,
    gas: 3 + Math.random() * 2,
    'fridge.t': fridge,
    'inside.t': 18 + Math.random() * 0.2,
    'inside.rh': 47,
    'outside.t': 1.5,
    pressure: 972 + Math.random() * 0.3,
    pitch: 1.1 + Math.random() * 0.05,
    roll: -0.9 + Math.random() * 0.05,
    'door.camper': 0,
    'door.fridge': 0,
    pir: Math.random() < 0.01 ? 1 : 0,
  }
  try {
    const r = await fetch(target, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) })
    if (!r.ok) console.log('homebase said', r.status)
  } catch (e) {
    console.log('cant reach homebase', e.message)
  }
}, 1000)
