import React, { Component } from "react";
import device_connecting_svg from './device_connecting.svg';
import EepromFields from './EepromFields.js'

//conversion
let enc = new TextDecoder("utf-8");

//expected characteristic UUIDs
const btZioServiceUUID = '16d30bc1-f148-49bd-b127-8042df63ded0'

class App extends Component {
  
  state = {
    statusMessage: "Click Connect to Begin",
    device_connected: false,
    device_connecting: false,
    firmware_version: "reading...",
    device_name: null,
  }

  componentDidMount(){
    console.log('Zio Setup Centre v0.12');
  }

  
  //process to begin pairing
  pairDevice = () => {
    
    this.setState({
      statusMessage: 'Pairing...',
      device_connecting: true,
      pairedDevice: null,
    })

    //connect to device then get firmware revision
    navigator.bluetooth.requestDevice({
      filters: [{
        services: ['device_information']
      }],
      optionalServices: [btZioServiceUUID]
    })
    .then(device => {
      device.addEventListener('gattserverdisconnected', this.disconnectDevice);
      console.log("pairedDevice", device);
      this.setState({ 
        device_name: device.name, 
        pairedDevice: device,
      })
      return device.gatt.connect();
    })
    .then(server => {
      return server.getPrimaryService('device_information');
    })
    .then(service => {
      return service.getCharacteristic('firmware_revision_string');
    })  
    .then(characteristic => {
      return characteristic.readValue();
    })
    .then(value => {
      this.setState({
        firmware_version: 'v' + enc.decode(value),
        statusMessage: 'Connected to ' + this.state.device_name,
      });
      this.deviceDidConnect();
    })
    .catch(error => { 
      console.error("Connection failed", error);
      
      this.disconnectDevice();
    });
  }

  //process after connection
  deviceDidConnect = async () => {
    this.setState({
      device_connecting: false,
      device_connected: true,
      reading_eeprom: true,
      reading_eeprom_progress: 0,
    })
  }

  //process to disconnect
  disconnectDevice = () => {
    if(this.state.pairedDevice != null){
      this.state.pairedDevice.gatt.disconnect();
      console.log('Device ' + this.state.device_name + ' is disconnected');      
    }
    this.setState({
      device_connected: false,
      device_connecting: false,
      statusMessage: 'Click Connect to Begin',
      device_name: null,
      pairedDevice: null,
    })
  }

  render() {
    return (
      <div className="App">

        <header className="App-header">
          <h1>Welcome to the Zio Setup Centre</h1>
          <div>{this.state.statusMessage}</div>
        </header>

        <div className="connect-options">

          {/* Show/Hide Connect Button */}
          {!this.state.device_connected && !this.state.device_connecting && ( 
          <button className="button" onClick={this.pairDevice}>Connect</button>
          )}

          {/* Show/Hide Connecting svg */}
          {!this.state.device_connected && this.state.device_connecting && ( 
          <img src={device_connecting_svg} alt="connecting" />
          )}       

          {/* Show/Hide Disconnect Button */}
          {this.state.device_connected && !this.state.device_connecting && ( 
          <button className="button" onClick={this.disconnectDevice}>Disconnect</button>
          )}

        </div>

        {/* Firmware updater */}
        <div className="firmware-updater">
          {/* Show/Hide Fields */}
          {this.state.device_connected && ( 
          <h2>Firmware Version: {this.state.firmware_version}</h2>
          )}
        </div>

        {/* Fields to be edited */}
        <div className="eeprom-fields">
          {/* Show/Hide Fields */}
          {this.state.device_connected && ( 
          <EepromFields device={this.state.pairedDevice}/>
          )}
        </div>
        
      </div>
    );
  }
}

export default App;
