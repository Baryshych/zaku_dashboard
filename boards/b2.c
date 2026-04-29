#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WebSocketsClient.h>
#include <Wire.h>
#include <Adafruit_INA226.h>

const char* ssid     = "SGphotostudio";
const char* password = "neontokyo";
const char* server_ip = "192.168.31.245";
const uint16_t server_port = 8080;

Adafruit_INA226 ina226;
WebSocketsClient webSocket;

unsigned long lastUpdate = 0;
bool emergencyState = false;

void emergencyStop(const char* reason) {
    if(emergencyState) return;
    emergencyState = true;
    String stopMsg = "{\"type\":\"emergency\",\"board\":\"b2\",\"reason\":\"" + String(reason) + "\"}";
    webSocket.sendTXT(stopMsg);
    Serial.println("EMERGENCY STOP: " + String(reason));
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
    if(type == WStype_CONNECTED) {
        webSocket.sendTXT("{\"type\":\"register\",\"board\":\"b2\"}");
    } else if(type == WStype_TEXT) {
        String msg = (char*)payload;
        Serial.println("<<< Received: " + msg);

        // Parse JSON command
        if(msg.indexOf("cmd") > 0) {
            if(msg.indexOf("\"cmd\":\"stop\"") > 0) {
                Serial.println("CMD: STOP");
                emergencyState = true;
            }
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(2000);
    Serial.println("\n--- ZAKU B2 START ---");

    // 1. Initialize I2C for INA226
    Wire.begin(14, 12); // D5, D6 on WEMOS D1 mini
    Wire.setClock(100000);

    // 2. Initialize INA226
    if(!ina226.begin()) {
        Serial.println("INA226 Init Failed");
    } else {
        Serial.println("INA226 OK");
        // Configure INA226
        ina226.configure(INA226_AVERAGE_128);
        ina226.calibrate(0.1, 5.0); // 0.1 ohm shunt, 5V max expected
    }

    // 3. Connect to WiFi
    WiFi.persistent(false);
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);

    Serial.println("Connecting WiFi");

    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }

    Serial.println("\nWiFi OK");

    // 4. WebSocket
    webSocket.begin(server_ip, server_port, "/ws");
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(5000);
}

void loop() {
    webSocket.loop();

    if (millis() - lastUpdate > 2000) {
        lastUpdate = millis();

        float busVoltage = ina226.readBusVoltage();
        float shuntVoltage = ina226.readShuntVoltage();
        float current_mA = ina226.readShuntCurrent() * 1000;
        float power_mW = ina226.readBusPower() * 1000;

        // Safety check for abnormal readings
        if(isnan(busVoltage) || isnan(current_mA) || isnan(power_mW)) {
            emergencyStop("Invalid sensor readings");
        }

        // Send telemetry
        String msg = "{\"voltage\":" + String(busVoltage, 2) +
                     ",\"current\":" + String(current_mA / 1000.0, 3) +
                     ",\"power\":" + String(power_mW / 1000.0, 3) + "}";
        bool sent = webSocket.sendTXT(msg);
        if(sent) {
            Serial.println(">>> Telemetry sent: " + msg);
        } else {
            Serial.println("!!! Failed to send telemetry");
        }
    }
}
