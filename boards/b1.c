#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

const char* ssid     = "SGphotostudio";
const char* password = "neontokyo";
const char* server_ip = "192.168.31.245";
const uint16_t server_port = 8080;

#define OLED_SDA 14
#define OLED_SCL 12
#define PUMP_PIN 5
#define START_PIN 4
Adafruit_SSD1306 display(128, 64, &Wire, -1);
WebSocketsClient webSocket;

unsigned long lastUpdate = 0;
bool startState = false;
bool emergencyState = false;

// Temperature safety thresholds
#define TARGET_TEMP 240.0
#define PUMP_MIN_TEMP 220.0
#define MAX_SAFE_TEMP 300.0
#define MIN_VALID_TEMP 0.0

void emergencyStop(const char* reason) {
    if(emergencyState) return;
    emergencyState = true;

    startState = false;
    digitalWrite(START_PIN, LOW);
    digitalWrite(PUMP_PIN, LOW);

    String stopMsg = "{\"type\":\"emergency\",\"board\":\"b1\",\"reason\":\"" + String(reason) + "\"}";
    webSocket.sendTXT(stopMsg);
    Serial.println("EMERGENCY STOP: " + String(reason));
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if(type == WStype_CONNECTED) {
        webSocket.sendTXT("{\"type\":\"register\",\"board\":\"b1\"}");
    } else if(type == WStype_TEXT) {
        String msg = (char*)payload;
        Serial.println("<<< Received: " + msg);

        // Parse JSON command
        if(msg.indexOf("cmd") > 0) {
            if(msg.indexOf("\"cmd\":\"pump\"") > 0) {
                if(emergencyState) {
                    Serial.println("CMD: PUMP - REJECTED (emergency state)");
                    return;
                }
                float rawADC = analogRead(A0);
                float resistance = 100000.0 * ((1023.0 / rawADC) - 1.0);
                float steinhart = log(resistance / 100000.0) / 3950.0 + 1.0 / (25.0 + 273.15);
                float tempC = (1.0 / steinhart) - 273.15;

                if(tempC < PUMP_MIN_TEMP) {
                    Serial.printf("CMD: PUMP - REJECTED (temp %.1fC < %.1fC)\n", tempC, PUMP_MIN_TEMP);
                    String rejectMsg = "{\"type\":\"error\",\"board\":\"b1\",\"text\":\"Temperature too low for pump: " + String(tempC,1) + "C\"}";
                    webSocket.sendTXT(rejectMsg);
                    return;
                }

                Serial.printf("CMD: PUMP - OK (temp %.1fC)\n", tempC);
                digitalWrite(PUMP_PIN, HIGH);
                delay(100);
                digitalWrite(PUMP_PIN, LOW);
            }
            if(msg.indexOf("\"cmd\":\"start\"") > 0) {
                if(emergencyState) {
                    Serial.println("CMD: START - REJECTED (emergency state)");
                    return;
                }
                bool newState = false;
                if(msg.indexOf("\"state\":true") > 0) newState = true;
                if(msg.indexOf("\"state\":false") > 0) newState = false;
                Serial.println("CMD: START state=" + String(newState));
                startState = newState;
                digitalWrite(START_PIN, startState ? HIGH : LOW);
            }
            if(msg.indexOf("\"cmd\":\"stop\"") > 0) {
                Serial.println("CMD: STOP");
                startState = false;
                digitalWrite(START_PIN, LOW);
            }
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(2000); // Велика пауза для стабілізації живлення
    Serial.println("\n--- ZAKU II START ---");

    // GPIO initialization
    pinMode(PUMP_PIN, OUTPUT);
    pinMode(START_PIN, OUTPUT);
    digitalWrite(PUMP_PIN, LOW);
    digitalWrite(START_PIN, LOW);

    // 1. Спочатку ініціалізуємо дисплей (до Wi-Fi!)
    // Це важливо, щоб він "захопив" піни першим
    Wire.begin(OLED_SDA, OLED_SCL);
    Wire.setClock(100000);

    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED Init Failed");
    } else {
        display.clearDisplay();
        display.setTextColor(WHITE);
        display.setCursor(0,0);
        display.println("BOOTING...");
        display.display();
    }

    // 2. Тепер запускаємо Wi-Fi
    WiFi.persistent(false); // Не записувати в Flash (зменшує навантаження)
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);

    display.println("Connecting WiFi");
    display.display();

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("\nWiFi OK");
    display.println("WiFi OK!");
    display.display();

    // 3. WebSocket
    webSocket.begin(server_ip, server_port, "/ws");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void loop() {
    webSocket.loop();

    if (millis() - lastUpdate > 2000) { // Збільшимо інтервал до 2 сек
        lastUpdate = millis();

        float rawADC = analogRead(A0);
        float resistance = 100000.0 * ((1023.0 / rawADC) - 1.0);
        float steinhart = log(resistance / 100000.0) / 3950.0 + 1.0 / (25.0 + 273.15);
        float tempC = (1.0 / steinhart) - 273.15;

        // Temperature safety check
        if(tempC > MAX_SAFE_TEMP || tempC < MIN_VALID_TEMP || isnan(tempC)) {
            char reason[50];
            if(tempC > MAX_SAFE_TEMP) {
                snprintf(reason, 50, "Temperature too high: %.1fC", tempC);
            } else if(tempC < MIN_VALID_TEMP) {
                snprintf(reason, 50, "Temperature invalid: %.1fC", tempC);
            } else {
                snprintf(reason, 50, "Temperature reading NaN");
            }
            emergencyStop(reason);
        }

        // Оновлюємо екран обережно
        display.clearDisplay();
        display.setCursor(0,0);
        display.setTextSize(1);
        display.printf("IP: %s", WiFi.localIP().toString().c_str());
        display.setCursor(0,25);
        display.setTextSize(2);
        if(emergencyState) {
            display.setTextColor(SSD1306_WHITE, SSD1306_BLACK);
            display.printf("EMERGENCY!");
            display.setCursor(0,50);
            display.setTextSize(1);
            display.printf("%.1f C", tempC);
        } else {
            display.printf("%.1f C", tempC);
        }
        display.display();

        // Відправка
        String msg = "{\"temp\":" + String(tempC, 1) + "}";
        bool sent = webSocket.sendTXT(msg);
        if(sent) {
          Serial.println(">>> Telemetry sent: " + msg);
        } else {
          Serial.println("!!! Failed to send telemetry");
        }
    }
}