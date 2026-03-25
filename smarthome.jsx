import React, { useState, useEffect, useRef } from 'react';
import mqtt from 'mqtt';
import { Plus, Power, Thermometer, Lightbulb, Wifi, WifiOff, Settings, Trash2, Wind } from 'lucide-react';

export default function SmartHomeApp() {
  const [devices, setDevices] = useState([]);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDevice, setNewDevice] = useState({
    name: '',
    type: 'bulb',
    room: '',
    pin: ''
  });
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [availablePins, setAvailablePins] = useState([]);
  const [pinError, setPinError] = useState('');
  
  const clientRef = useRef(null);

  useEffect(() => {
    const client = mqtt.connect('ws://localhost:9001', {
      clientId: `web_client_${Math.random().toString(16).substr(2, 8)}`,
      clean: true,
      reconnectPeriod: 1000,
    });

    client.on('connect', () => {
      console.log('Connected to MQTT broker');
      setMqttConnected(true);
      
      client.subscribe('system/device/list', (err) => {
        if (!err) {
          console.log('Subscribed to device list');
          client.publish('system/device', JSON.stringify({ action: 'list' }));
        }
      });
      
      client.subscribe('system/device/created');
      client.subscribe('system/device/deleted');
      client.subscribe('system/device/error');
      client.subscribe('system/pins/available');
      client.subscribe('home/+/state');
      client.subscribe('home/+/temperature');
      client.subscribe('home/+/speed');
    });

    client.on('message', (topic, message) => {
      console.log(`Received: ${topic} -> ${message.toString()}`);
      
      try {
        if (topic === 'system/device/list') {
          const deviceList = JSON.parse(message.toString());
          setDevices(deviceList.map(device => ({
            ...device,
            status: device.state?.toLowerCase() || 'off',
            online: device.online !== false,
            temperature: device.temperature || 22,
            speed: device.speed || 0
          })));
        } else if (topic === 'system/device/created') {
          const newDev = JSON.parse(message.toString());
          setDevices(prev => [...prev, {
            ...newDev,
            status: newDev.state?.toLowerCase() || 'off',
            online: true,
            temperature: newDev.temperature || 22,
            speed: newDev.speed || 0
          }]);
          
          client.subscribe(`home/${newDev.id}/state`);
          client.subscribe(`home/${newDev.id}/temperature`);
          client.subscribe(`home/${newDev.id}/speed`);
          setPinError('');
        } else if (topic === 'system/device/deleted') {
          const deletedId = message.toString();
          setDevices(prev => prev.filter(d => d.id !== deletedId));
        } else if (topic === 'system/device/error') {
          const error = message.toString();
          setPinError(error);
          alert(error);
        } else if (topic === 'system/pins/available') {
          const pins = JSON.parse(message.toString());
          setAvailablePins(pins);
        } else if (topic.startsWith('home/') && topic.endsWith('/state')) {
          const deviceId = topic.split('/')[1];
          const state = message.toString();
          
          setDevices(prev => prev.map(device => 
            device.id === deviceId 
              ? { ...device, status: state.toLowerCase() }
              : device
          ));
        } else if (topic.endsWith('/temperature')) {
          const deviceId = topic.split('/')[1];
          const temp = parseInt(message.toString());
          
          setDevices(prev => prev.map(device => 
            device.id === deviceId 
              ? { ...device, temperature: temp }
              : device
          ));
        } else if (topic.endsWith('/speed')) {
          const deviceId = topic.split('/')[1];
          const speed = parseInt(message.toString());
          
          setDevices(prev => prev.map(device => 
            device.id === deviceId 
              ? { ...device, speed: speed }
              : device
          ));
        }
      } catch (error) {
        console.error('Error parsing MQTT message:', error);
      }
    });

    client.on('error', (err) => {
      console.error('MQTT Error:', err);
      setMqttConnected(false);
    });

    client.on('offline', () => {
      console.log('MQTT offline');
      setMqttConnected(false);
    });

    client.on('reconnect', () => {
      console.log('MQTT reconnecting...');
    });

    clientRef.current = client;

    return () => {
      if (client) {
        client.end();
      }
    };
  }, []);

  const deviceIcons = {
    bulb: Lightbulb,
    fan: Wind,
    ac: Thermometer
  };

  const toggleDevice = (device) => {
    if (!clientRef.current || !mqttConnected) {
      console.error('MQTT not connected');
      return;
    }

    const newState = device.status === 'on' ? 'OFF' : 'ON';
    
    clientRef.current.publish(
      `home/${device.id}/cmd`,
      newState,
      { qos: 1 }
    );
    
    console.log(`Published: home/${device.id}/cmd -> ${newState}`);
  };

  const handleDeviceTemperature = (deviceId, newTemp) => {
    if (!clientRef.current || !mqttConnected) {
      console.error('MQTT not connected');
      return;
    }

    clientRef.current.publish(
      `home/${deviceId}/temperature/set`,
      newTemp.toString(),
      { qos: 1 }
    );
    
    console.log(`Published: home/${deviceId}/temperature/set -> ${newTemp}`);
  };

  const handleDeviceSpeed = (deviceId, newSpeed) => {
    if (!clientRef.current || !mqttConnected) {
      console.error('MQTT not connected');
      return;
    }

    clientRef.current.publish(
      `home/${deviceId}/speed/set`,
      newSpeed.toString(),
      { qos: 1 }
    );
    
    console.log(`Published: home/${deviceId}/speed/set -> ${newSpeed}`);
  };

  const addDevice = () => {
    if (!clientRef.current || !mqttConnected) {
      alert('MQTT not connected');
      return;
    }

    if (!newDevice.name || !newDevice.room || !newDevice.pin) {
      alert('Please fill in all fields');
      return;
    }

    const pin = parseInt(newDevice.pin);
    
    if (pin < 1 || pin > 28) {
      alert('Pin must be between 1 and 28');
      return;
    }

    const deviceId = `${newDevice.type}_${Math.random().toString(36).substr(2, 9)}`;
    
    const deviceData = {
      action: 'create',
      id: deviceId,
      type: newDevice.type,
      name: newDevice.name,
      room: newDevice.room,
      pin: pin
    };

    clientRef.current.publish(
      'system/device',
      JSON.stringify(deviceData),
      { qos: 1 }
    );

    console.log('Creating device:', deviceData);

    setNewDevice({ name: '', type: 'bulb', room: '', pin: '' });
    setShowAddDevice(false);
  };

  const deleteDevice = (deviceId) => {
    if (!clientRef.current || !mqttConnected) {
      alert('MQTT not connected');
      return;
    }

    const deleteData = {
      action: 'delete',
      id: deviceId
    };

    clientRef.current.publish(
      'system/device',
      JSON.stringify(deleteData),
      { qos: 1 }
    );

    setSelectedDevice(null);
  };

  const onlineDevices = devices.filter(d => d.online).length;
  const activeDevices = devices.filter(d => d.status === 'on').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 p-8 font-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Unbounded:wght@600;800&display=swap');
        
        body {
          margin: 0;
          font-family: 'DM Sans', sans-serif;
        }
        
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        
        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        
        .fade-in-up {
          animation: fadeInUp 0.6s ease-out forwards;
        }
        
        .delay-1 { animation-delay: 0.1s; }
        .delay-2 { animation-delay: 0.2s; }
        .delay-3 { animation-delay: 0.3s; }
        .delay-4 { animation-delay: 0.4s; }
        
        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .card-hover:hover {
          transform: translateY(-4px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          transition: all 0.3s ease;
        }
        
        .btn-primary:hover {
          background: linear-gradient(135deg, #7c3aed 0%, #a855f7 100%);
          transform: scale(1.05);
          box-shadow: 0 10px 30px rgba(139, 92, 246, 0.4);
        }
        
        .glass {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(148, 163, 184, 0.1);
        }
        
        .pulse-dot {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        
        .slide-in {
          animation: slideIn 0.3s ease-out forwards;
        }
        
        .device-icon-glow {
          filter: drop-shadow(0 0 8px currentColor);
        }
      `}</style>

      <div className="fixed top-4 right-4 z-50">
        <div className={`glass rounded-full px-4 py-2 flex items-center gap-2 ${
          mqttConnected ? 'border-green-500/30' : 'border-red-500/30'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            mqttConnected ? 'bg-green-400 pulse-dot' : 'bg-red-400'
          }`}></div>
          <span className="text-sm font-medium">
            {mqttConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mb-12 fade-in-up">
        <h1 className="text-6xl font-bold mb-3 bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent" style={{ fontFamily: "'Unbounded', cursive" }}>
          SmartNest
        </h1>
        <p className="text-slate-400 text-lg">Your connected home ecosystem</p>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        <div className="glass rounded-2xl p-6 card-hover fade-in-up delay-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Total Devices</p>
              <p className="text-4xl font-bold">{devices.length}</p>
            </div>
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center">
              <Settings className="w-8 h-8 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 card-hover fade-in-up delay-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Online</p>
              <p className="text-4xl font-bold">{onlineDevices}</p>
            </div>
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center">
              <Wifi className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>

        <div className="glass rounded-2xl p-6 card-hover fade-in-up delay-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-400 text-sm mb-1">Active Now</p>
              <p className="text-4xl font-bold">{activeDevices}</p>
            </div>
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 flex items-center justify-center">
              <Power className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 fade-in-up delay-4">
          <h2 className="text-3xl font-bold">Your Devices</h2>
          <button
            onClick={() => setShowAddDevice(true)}
            disabled={!mqttConnected}
            className="btn-primary px-6 py-3 rounded-xl font-semibold flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-5 h-5" />
            Add Device
          </button>
        </div>

        {devices.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <p className="text-slate-400 text-lg">No devices found. Add your first device to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {devices.map((device, index) => {
              const Icon = deviceIcons[device.type] || Power;
              const isActive = device.status === 'on';
              
              return (
                <div
                  key={device.id}
                  className={`glass rounded-2xl p-6 card-hover cursor-pointer fade-in-up delay-${Math.min(index + 1, 4)}`}
                  onClick={() => setSelectedDevice(device)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                        isActive
                          ? 'bg-gradient-to-br from-indigo-500/30 to-purple-500/30'
                          : 'bg-slate-800/50'
                      }`}>
                        <Icon className={`w-6 h-6 ${isActive ? 'text-indigo-400 device-icon-glow' : 'text-slate-500'}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{device.name}</h3>
                        <p className="text-slate-400 text-sm">{device.room}</p>
                      </div>
                    </div>
                    
                    {device.online ? (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-400 pulse-dot"></div>
                        <Wifi className="w-4 h-4 text-green-400" />
                      </div>
                    ) : (
                      <WifiOff className="w-4 h-4 text-red-400" />
                    )}
                  </div>

                  <div className="space-y-3">
                    {device.type === 'ac' && isActive && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-slate-400">Temperature</span>
                          <span className="text-sm font-semibold text-orange-400">{device.temperature}°C</span>
                        </div>
                        <input
                          type="range"
                          min="16"
                          max="30"
                          value={device.temperature || 22}
                          onChange={(e) => handleDeviceTemperature(device.id, parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                      </div>
                    )}

                    {device.type === 'fan' && isActive && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-slate-400">Speed</span>
                          <span className="text-sm font-semibold text-cyan-400">{device.speed}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={device.speed || 0}
                          onChange={(e) => handleDeviceSpeed(device.id, parseInt(e.target.value))}
                          className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2">
                      <p className={`text-xs ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
                        {device.status.toUpperCase()}
                      </p>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleDevice(device);
                        }}
                        disabled={!device.online || !mqttConnected}
                        className={`w-14 h-8 rounded-full relative transition-all duration-300 ${
                          isActive
                            ? 'bg-gradient-to-r from-indigo-500 to-purple-500'
                            : 'bg-slate-700'
                        } ${(!device.online || !mqttConnected) && 'opacity-50 cursor-not-allowed'}`}
                      >
                        <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all duration-300 ${
                          isActive ? 'right-1' : 'left-1'
                        }`}></div>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddDevice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass rounded-3xl p-8 max-w-md w-full slide-in shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">Add New Device</h3>
              <button
                onClick={() => {
                  setShowAddDevice(false);
                  setPinError('');
                }}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Device Name</label>
                <input
                  type="text"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                  placeholder="e.g., Bedroom Light"
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Device Type</label>
                <select
                  value={newDevice.type}
                  onChange={(e) => setNewDevice({ ...newDevice, type: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="bulb">Bulb</option>
                  <option value="fan">Fan</option>
                  <option value="ac">AC</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">Room</label>
                <input
                  type="text"
                  value={newDevice.room}
                  onChange={(e) => setNewDevice({ ...newDevice, room: e.target.value })}
                  placeholder="e.g., Living Room"
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-slate-300">GPIO Pin Number</label>
                <input
                  type="number"
                  value={newDevice.pin}
                  onChange={(e) => {
                    setNewDevice({ ...newDevice, pin: e.target.value });
                    setPinError('');
                  }}
                  placeholder="e.g., 17"
                  min="1"
                  max="28"
                  className={`w-full px-4 py-3 bg-slate-800/50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                    pinError ? 'border-red-500' : 'border-slate-700'
                  }`}
                />
                {pinError && (
                  <p className="text-red-400 text-sm mt-2">{pinError}</p>
                )}
              </div>

              <button
                onClick={addDevice}
                className="w-full btn-primary py-3 rounded-xl font-semibold mt-6 shadow-lg"
              >
                Add Device
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedDevice && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass rounded-3xl p-8 max-w-md w-full slide-in shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold">{selectedDevice.name}</h3>
              <button
                onClick={() => setSelectedDevice(null)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <span className="text-slate-300">Status</span>
                <span className={`font-semibold ${
                  selectedDevice.status === 'on'
                    ? 'text-indigo-400'
                    : 'text-slate-500'
                }`}>
                  {selectedDevice.status.toUpperCase()}
                </span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <span className="text-slate-300">Room</span>
                <span className="font-semibold">{selectedDevice.room}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <span className="text-slate-300">Type</span>
                <span className="font-semibold capitalize">{selectedDevice.type}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <span className="text-slate-300">GPIO Pin</span>
                <span className="font-semibold">{selectedDevice.pin}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl">
                <span className="text-slate-300">Connection</span>
                <span className={`font-semibold ${selectedDevice.online ? 'text-green-400' : 'text-red-400'}`}>
                  {selectedDevice.online ? 'Online' : 'Offline'}
                </span>
              </div>

              {selectedDevice.type === 'ac' && (
                <div className="p-4 bg-slate-800/50 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-300">Temperature</span>
                    <span className="font-semibold text-orange-400">{selectedDevice.temperature}°C</span>
                  </div>
                  <input
                    type="range"
                    min="16"
                    max="30"
                    value={selectedDevice.temperature || 22}
                    onChange={(e) => handleDeviceTemperature(selectedDevice.id, parseInt(e.target.value))}
                    disabled={selectedDevice.status !== 'on'}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-2">
                    <span>16°C</span>
                    <span>30°C</span>
                  </div>
                </div>
              )}

              {selectedDevice.type === 'fan' && (
                <div className="p-4 bg-slate-800/50 rounded-xl">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-slate-300">Speed</span>
                    <span className="font-semibold text-cyan-400">{selectedDevice.speed}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={selectedDevice.speed || 0}
                    onChange={(e) => handleDeviceSpeed(selectedDevice.id, parseInt(e.target.value))}
                    disabled={selectedDevice.status !== 'on'}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-2">
                    <span>Off</span>
                    <span>Max</span>
                  </div>
                </div>
              )}

              <button
                onClick={() => deleteDevice(selectedDevice.id)}
                disabled={!mqttConnected}
                className="w-full py-3 rounded-xl font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-5 h-5" />
                Remove Device
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}