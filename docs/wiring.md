# Camper node wiring

ESP32 dev board (the 38 pin one) on a buck converter off the house bank. Everything below is 3.3V unless noted.

| part | pins | notes |
|---|---|---|
| BME280 | SDA 21, SCL 22 | inside the camper, away from the furnace vent |
| MPU6050 | SDA 21, SCL 22 | screwed flat to the floor, x axis toward the cab |
| INA226 | SDA 21, SCL 22 | on the 100A/75mV shunt in the negative run |
| DS18B20 x2 | 4 | 4.7k pullup to 3.3V. one in the fridge, one outside under the overhang |
| HX711 + load cell | DT 16, SCK 17 | propane bottle sits on it |
| fresh tank sender | 34 | through a divider, ADC1 only. ADC2 stops working once wifi is up |
| MQ-2 | 35 | heater wants 5V, divide the output down |
| grey probes | 25, 26, 27 | 1/3, 2/3, full. wet probe pulls low through the tank |
| black probes | 13, 14, 19 | same |
| camper door reed | 23 | closed = low |
| fridge door reed | 18 | closed = low |
| PIR | 33 | |
| furnace fan | 32 | PC817 optocoupler off the 12V fan lead |
| buzzer | 15 | local propane alarm, still screams if the pi is dead |

Copy `include/config.example.h` to `include/config.h`, set wifi and calibration, then `pio run -t upload`.

Calibration I still owe it:

- HX711 scale factor, put a known weight on and adjust `HX_SCALE`
- `FRESH_ADC_EMPTY` / `FRESH_ADC_FULL`, read raw ADC with the tank dry and full
- MPU zero, park somewhere actually flat and hit Zero here on the camp screen
