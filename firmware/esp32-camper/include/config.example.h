#pragma once
// copy to config.h and fill in. config.h is gitignored

#define WIFI_SSID "camper"
#define WIFI_PASS "changeme"

// the pi. mdns works on most routers, ip is safer
#define HOMEBASE_URL "http://camper.local:8787/api/ingest"
#define INGEST_TOKEN ""

// ---- pins ----
#define PIN_SDA 21
#define PIN_SCL 22
#define PIN_ONEWIRE 4 // ds18b20s: fridge + outside
#define PIN_HX_DT 16  // propane scale
#define PIN_HX_SCK 17
#define PIN_FRESH_ADC 34 // fresh tank sender through a divider, adc1 only, adc2 dies with wifi on
#define PIN_GAS_ADC 35   // mq-2
#define PIN_DOOR 23      // reed, closed = low
#define PIN_FRIDGE_DOOR 18
#define PIN_PIR 33
#define PIN_FURNACE 32 // optocoupler off the furnace fan wire
#define PIN_BUZZER 15  // local gas alarm, works even if the pi is dead
const int GREY_PROBES[3] = {25, 26, 27};  // 1/3, 2/3, full
const int BLACK_PROBES[3] = {13, 14, 19};

// ---- calibration ----
#define SHUNT_OHMS 0.00075  // 100A / 75mV shunt
#define BANK_AH 200.0
#define HX_SCALE -21580.0   // raw counts per kg, run the scale sketch to get yours
#define BOTTLE_TARE_KG 7.9  // empty 20lb bottle, stamped TW on the collar
#define FRESH_ADC_EMPTY 3650
#define FRESH_ADC_FULL 480
#define GAS_ALARM_PCT 35
