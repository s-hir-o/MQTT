import paho.mqtt.client as mqtt
import time
import json
import uuid

# import RPi.GPIO as GPIO
# GPIO.setmode(GPIO.BCM)

dev_pins = {
    "bulb": 17,
    "fan": 18,
    "ac": 22
}

pins = [i for i in range(1, 29)]

# for i in dev_pins.values():
#     GPIO.setup(i, GPIO.OUT)
#     GPIO.output(i, GPIO.HIGH)

devices = {}
climate_state = {}


def save():
    data = {
        "devices": devices,
        "climate": climate_state
    }
    with open("devices.json", "w") as f:
        json.dump(data, f, indent=2)


def load():
    global devices, climate_state, pins
    try:
        with open("devices.json", "r") as f:
            data = json.load(f)
            
            if "devices" in data:
                devices = data.get("devices", {})
                climate_state = data.get("climate", {})
            else:
                devices = data
                climate_state = {}
            
            for device in devices.values():
                pin = device.get("pin")
                if pin and pin in pins:
                    pins.remove(pin)
            
            print(f"Loaded {len(devices)} devices")
    except:
        devices = {}
        climate_state = {}


def control(data, id, client):
    global pins
    action = data.get("action")
    pin = data.get("pin")
    dev_type = data.get("type", "bulb")
    
    if action == "create":
        if pin in pins:
            devices[id] = {
                "id": id,
                "pin": pin,
                "state": data.get("state", "OFF"),
                "type": dev_type,
                "name": data.get("name", f"Device {id}"),
                "room": data.get("room", "Unknown"),
                "online": True
            }
            
            if dev_type == "ac":
                devices[id]["temperature"] = 22
                climate_state[id] = {"temperature": 22}
            elif dev_type == "fan":
                devices[id]["speed"] = 0
                climate_state[id] = {"speed": 0}
            
            client.subscribe(f"home/{id}/cmd")
            client.subscribe(f"home/{id}/temperature/set")
            client.subscribe(f"home/{id}/speed/set")
            
            pins.remove(pin)
            print(f"device {id} created successfully")
            client.publish("system/device/created", json.dumps(devices[id]))
            client.publish("system/pins/available", json.dumps(pins))
            save()
        else:
            error_msg = f"Pin {pin} already occupied. Available pins: {pins[:10]}..."
            print(error_msg)
            client.publish("system/device/error", error_msg)
    
    elif action in ("ON", "OFF"):
        if id in devices:
            # if action == "ON":
            #     GPIO.output(devices[id]["pin"], GPIO.LOW)
            # else:
            #     GPIO.output(devices[id]["pin"], GPIO.HIGH)
            
            devices[id]["state"] = action
            client.publish(f"home/{id}/state", action)
            save()
        else:
            print(f"No such device: {id}")
    
    elif action == "view":
        if id not in devices:
            print("No such device")
            return
        
        client.publish(
            f"home/{id}/state",
            devices[id]["state"],
            retain=True
        )
    
    else:
        print(f"Unknown action: {action}")


def ac_temp(dev_id, temp, client):
    if dev_id in devices and devices[dev_id]["type"] == "ac":
        temp = int(temp)
        if 16 <= temp <= 30:
            devices[dev_id]["temperature"] = temp
            climate_state[dev_id] = {"temperature": temp}
            client.publish(f"home/{dev_id}/temperature", str(temp))
            save()
            print(f"AC {dev_id} temperature set to {temp}°C")


def fan_speed(dev_id, speed, client):
    if dev_id in devices and devices[dev_id]["type"] == "fan":
        speed = int(speed)
        if 0 <= speed <= 100:
            devices[dev_id]["speed"] = speed
            climate_state[dev_id] = {"speed": speed}
            client.publish(f"home/{dev_id}/speed", str(speed))
            save()
            print(f"Fan {dev_id} speed set to {speed}%")


def on_sys_msg(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    
    print(f"Received: {topic} : {payload}")
    
    try:
        if topic == "system/device":
            data = json.loads(payload)
            action = data.get("action")
            
            if action == "create":
                dev_id = data.get("id")
                if not dev_id:
                    dev_type = data.get("type", "bulb")
                    dev_id = f"{dev_type}_{uuid.uuid4().hex[:8]}"
                
                control(data, dev_id, client)
            
            elif action == "delete":
                dev_id = data.get("id")
                if dev_id in devices:
                    pin = devices[dev_id]["pin"]
                    pins.append(pin)
                    client.unsubscribe(f"home/{dev_id}/cmd")
                    client.unsubscribe(f"home/{dev_id}/temperature/set")
                    client.unsubscribe(f"home/{dev_id}/speed/set")
                    
                    if dev_id in climate_state:
                        del climate_state[dev_id]
                    
                    del devices[dev_id]
                    client.publish("system/device/deleted", dev_id)
                    client.publish("system/pins/available", json.dumps(pins))
                    save()
                    print(f"Device {dev_id} deleted")
            
            elif action == "list":
                device_list = list(devices.values())
                client.publish("system/device/list", json.dumps(device_list))
                client.publish("system/pins/available", json.dumps(pins))
                print(f"Published device list: {len(device_list)} devices")
        
        elif topic.startswith("home/") and topic.endswith("/cmd"):
            dev_id = topic.split("/")[1]
            data = {"action": payload}
            
            if dev_id in devices:
                control(data, dev_id, client)
            else:
                print(f"Device {dev_id} not found")
        
        elif topic.endswith("/temperature/set"):
            dev_id = topic.split("/")[1]
            ac_temp(dev_id, payload, client)
        
        elif topic.endswith("/speed/set"):
            dev_id = topic.split("/")[1]
            fan_speed(dev_id, payload, client)
    
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
    except Exception as e:
        print(f"Error handling message: {e}")


def onc(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")
    
    client.subscribe("system/device")
    client.subscribe("home/+/cmd")
    client.subscribe("home/+/temperature/set")
    client.subscribe("home/+/speed/set")
    
    for dev_id in devices:
        client.subscribe(f"home/{dev_id}/cmd")
        client.subscribe(f"home/{dev_id}/temperature/set")
        client.subscribe(f"home/{dev_id}/speed/set")
        print(f"subbed to home/{dev_id}/cmd")
    
    if devices:
        device_list = list(devices.values())
        client.publish("system/device/list", json.dumps(device_list))
        print(f"Published {len(device_list)} devices on startup")
    
    client.publish("system/pins/available", json.dumps(pins))


load()

manager = mqtt.Client(
    client_id="manager",
    protocol=mqtt.MQTTv311,
    callback_api_version=mqtt.CallbackAPIVersion.VERSION1
)
manager.on_message = on_sys_msg
manager.on_connect = onc
manager.connect("localhost", 1883, 60)
manager.subscribe("system/device")
manager.subscribe("home/+/cmd")
manager.subscribe("home/+/temperature/set")
manager.subscribe("home/+/speed/set")
manager.loop_start()

print("Smart Home Manager Started")
print(f"Loaded {len(devices)} devices")
print(f"Available pins: {pins}")


while True:
    time.sleep(1)