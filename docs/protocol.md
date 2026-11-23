# Data keys

Everything is a flat key and a number. Metric internally, the dashboard converts for display.

## From the truck (ELM327, mode 01)

| key | what | unit |
|---|---|---|
| rpm | engine speed | rpm |
| speed | vehicle speed | km/h |
| load | calculated load | % |
| tps | throttle | % |
| maf | mass airflow | g/s |
| map | manifold pressure | kPa abs |
| fuelRate | fuel rate, PID 5E | L/h |
| ect | coolant | °C |
| oilT | oil temp, PID 5C | °C |
| iat | intake air | °C |
| timing | timing advance | ° |
| stft, ltft, stft2, ltft2 | fuel trims | % |
| fuel | fuel level | % |
| baro | barometric | kPa |
| ambient | ambient air | °C |
| ecuV | control module voltage | V |
| vbat | adapter pin 16 voltage (ATRV) | V |
| railP | fuel rail pressure | kPa |
| mil | check engine light | 0/1 |
| dtcCount | stored codes | count |

Only PIDs the ECU reports in its 0100/0120/0140 bitmaps get polled. Fast stuff (rpm, speed) every pass, temps every 5th, fuel level every 20th.

## From the camper (ESP32)

| key | what | unit |
|---|---|---|
| house.soc | house bank, coulomb counted | % |
| house.v | bank voltage | V |
| house.a | net current, + is charging | A |
| solar.w | solar in | W |
| fresh, grey, black | tanks | % |
| propane | net propane on the scale | kg |
| gas | MQ-2 reading | % of ADC range |
| fridge.t, inside.t, outside.t | temps | °C |
| inside.rh | humidity | % |
| pressure | station pressure | hPa |
| pitch, roll | camper floor, + is nose up / passenger side up | ° |
| door.camper, door.fridge | 1 = open | 0/1 |
| furnace | fan running | 0/1 |
| pir | motion since last post | 0/1 |

## Homebase

`POST /api/ingest` with a JSON object of keys. Optional `x-token` header if `INGEST_TOKEN` is set.

`ws://host:8787/live`

- server sends `{type:'snapshot', data}` on connect, then `{type:'state', t, data}` and `{type:'event', t, text, sev}`
- dashboard sends `{type:'obd', t, data}` with whatever the adapter read, and `{type:'guard', armed}`

`GET /api/history?key=ect&hours=6` gives back bucketed `[t, value]` pairs out of the daily `.jsonl` logs.
