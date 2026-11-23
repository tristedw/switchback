// switchback camper node. reads everything in the camper and posts json to the homebase once a second.
// keys match what the dashboard expects, see docs/protocol.md

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Preferences.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_BME280.h>
#include <HX711.h>
#include <ArduinoJson.h>
#include "config.h"

OneWire oneWire(PIN_ONEWIRE);
DallasTemperature ds(&oneWire);
Adafruit_BME280 bme;
HX711 scale;
Preferences prefs;

bool haveBme = false;
bool haveMpu = false;
bool haveIna = false;

// ---------- mpu6050, raw registers, no library needed for just accel ----------

const uint8_t MPU = 0x68;
float pitchF = 0, rollF = 0;

void mpuInit() {
  Wire.beginTransmission(MPU);
  Wire.write(0x6B);  // power management, wake up
  Wire.write(0);
  haveMpu = Wire.endTransmission() == 0;
  if (!haveMpu) return;
  Wire.beginTransmission(MPU);
  Wire.write(0x1A);  // dlpf ~5hz, we want slow and steady
  Wire.write(6);
  Wire.endTransmission();
}

void mpuRead() {
  Wire.beginTransmission(MPU);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return;
  Wire.requestFrom(MPU, (uint8_t)6);
  int16_t ax = Wire.read() << 8 | Wire.read();
  int16_t ay = Wire.read() << 8 | Wire.read();
  int16_t az = Wire.read() << 8 | Wire.read();
  // board mounted flat, x pointing at the cab. flip signs here if yours is turned around
  float pitch = atan2f(-ax, sqrtf((float)ay * ay + (float)az * az)) * 57.2958f;
  float roll = atan2f(ay, az) * 57.2958f;
  // heavy smoothing, people walking around inside shouldn't move the bubble
  pitchF += (pitch - pitchF) * 0.08f;
  rollF += (roll - rollF) * 0.08f;
}

// ---------- ina226 shunt monitor, also raw ----------

const uint8_t INA = 0x40;
float socPct = 50;
double ahIn = 0;
unsigned long lastIna = 0;
unsigned long lastSocSave = 0;

int16_t inaReg(uint8_t reg) {
  Wire.beginTransmission(INA);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return 0;
  Wire.requestFrom(INA, (uint8_t)2);
  return (int16_t)(Wire.read() << 8 | Wire.read());
}

void inaInit() {
  Wire.beginTransmission(INA);
  Wire.write(0x00);
  Wire.write(0x45);  // 16 sample average, 1.1ms conversions, continuous
  Wire.write(0x27);
  haveIna = Wire.endTransmission() == 0;
  prefs.begin("sb", false);
  socPct = prefs.getFloat("soc", 80);
}

void inaRead(float &volts, float &amps) {
  int16_t shunt = inaReg(0x01);  // 2.5uV per bit
  int16_t bus = inaReg(0x02);    // 1.25mV per bit
  volts = bus * 0.00125f;
  amps = (shunt * 2.5e-6f) / SHUNT_OHMS;

  unsigned long now = millis();
  if (lastIna) {
    float hrs = (now - lastIna) / 3600000.0f;
    socPct += (amps * hrs) / BANK_AH * 100.0f;
  }
  lastIna = now;

  // lifepo4 resync: high voltage and tail current means it's full, reset the coulomb count
  if (volts > 14.1f && amps > 0 && amps < BANK_AH * 0.02f) socPct = 100;
  socPct = constrain(socPct, 0, 100);

  if (now - lastSocSave > 300000) {  // every 5 min, flash wear is a thing
    prefs.putFloat("soc", socPct);
    lastSocSave = now;
  }
}

// ---------- tanks ----------

int probeLevel(const int pins[3]) {
  // wet probe pulls to ground through the tank water
  int lvl = 0;
  for (int i = 0; i < 3; i++)
    if (digitalRead(pins[i]) == LOW) lvl = i + 1;
  return lvl * 100 / 3;
}

float freshPct() {
  long sum = 0;
  for (int i = 0; i < 16; i++) sum += analogRead(PIN_FRESH_ADC);
  float raw = sum / 16.0f;
  return constrain((raw - FRESH_ADC_EMPTY) * 100.0f / (FRESH_ADC_FULL - FRESH_ADC_EMPTY), 0, 100);
}

float gasPct() {
  long sum = 0;
  for (int i = 0; i < 8; i++) sum += analogRead(PIN_GAS_ADC);
  return (sum / 8.0f) * 100.0f / 4095.0f;
}

// ---------- wifi ----------

void wifiUp() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < 8000) delay(200);
}

void setup() {
  Serial.begin(115200);
  Wire.begin(PIN_SDA, PIN_SCL);

  pinMode(PIN_DOOR, INPUT_PULLUP);
  pinMode(PIN_FRIDGE_DOOR, INPUT_PULLUP);
  pinMode(PIN_PIR, INPUT);
  pinMode(PIN_FURNACE, INPUT_PULLUP);
  pinMode(PIN_BUZZER, OUTPUT);
  for (int i = 0; i < 3; i++) {
    pinMode(GREY_PROBES[i], INPUT_PULLUP);
    pinMode(BLACK_PROBES[i], INPUT_PULLUP);
  }
  analogSetAttenuation(ADC_11db);

  ds.begin();
  ds.setWaitForConversion(false);
  ds.requestTemperatures();
  haveBme = bme.begin(0x76) || bme.begin(0x77);
  mpuInit();
  inaInit();
  scale.begin(PIN_HX_DT, PIN_HX_SCK);
  scale.set_scale(HX_SCALE);

  Serial.printf("bme %d  mpu %d  ina %d  ds18b20 x%d\n", haveBme, haveMpu, haveIna, ds.getDeviceCount());
  wifiUp();
}

unsigned long lastPost = 0;
bool pirLatched = false;

void loop() {
  if (haveMpu) mpuRead();

  // pir pulses are short, latch it until the next post so we don't miss one
  if (digitalRead(PIN_PIR) == HIGH) pirLatched = true;

  float gas = gasPct();
  // local alarm, doesn't care if the network is up
  digitalWrite(PIN_BUZZER, gas >= GAS_ALARM_PCT && (millis() / 300) % 2);

  if (millis() - lastPost < 1000) {
    delay(20);
    return;
  }
  lastPost = millis();

  JsonDocument doc;
  if (haveIna) {
    float v, a;
    inaRead(v, a);
    doc["house.v"] = v;
    doc["house.a"] = a;
    doc["house.soc"] = socPct;
  }
  if (haveBme) {
    doc["inside.t"] = bme.readTemperature();
    doc["inside.rh"] = bme.readHumidity();
    doc["pressure"] = bme.readPressure() / 100.0f;
  }
  // ds18b20 index 0 is the fridge probe, 1 is outside under the overhang. check the order on first boot
  float t0 = ds.getTempCByIndex(0);
  float t1 = ds.getTempCByIndex(1);
  if (t0 > -100) doc["fridge.t"] = t0;
  if (t1 > -100) doc["outside.t"] = t1;
  ds.requestTemperatures();

  if (haveMpu) {
    doc["pitch"] = pitchF;
    doc["roll"] = rollF;
  }
  if (scale.is_ready()) doc["propane"] = max(0.0f, scale.get_units(4) - BOTTLE_TARE_KG);

  doc["fresh"] = freshPct();
  doc["grey"] = probeLevel(GREY_PROBES);
  doc["black"] = probeLevel(BLACK_PROBES);
  doc["gas"] = gas;
  doc["door.camper"] = digitalRead(PIN_DOOR) == HIGH ? 1 : 0;
  doc["door.fridge"] = digitalRead(PIN_FRIDGE_DOOR) == HIGH ? 1 : 0;
  doc["furnace"] = digitalRead(PIN_FURNACE) == LOW ? 1 : 0;
  doc["pir"] = pirLatched ? 1 : 0;
  doc["node.rssi"] = WiFi.RSSI();
  pirLatched = false;

  wifiUp();
  if (WiFi.status() != WL_CONNECTED) return;

  String body;
  serializeJson(doc, body);
  HTTPClient http;
  http.setTimeout(800);
  http.begin(HOMEBASE_URL);
  http.addHeader("content-type", "application/json");
  if (strlen(INGEST_TOKEN)) http.addHeader("x-token", INGEST_TOKEN);
  int code = http.POST(body);
  if (code != 200) Serial.printf("post failed %d\n", code);
  http.end();
}
