// mqttClient.js
import mqtt from "mqtt";

export const mqttClient = mqtt.connect("ws://localhost:9001");

mqttClient.on("connect", () => {
  console.log("Connected to MQTT broker");
  mqttClient.subscribe("home/+/state");
  mqttClient.subscribe("system/device/list");
  mqttClient.subscribe("system/device/created");
  mqttClient.subscribe("system/device/deleted");
});
