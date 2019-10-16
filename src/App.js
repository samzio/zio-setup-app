import React, { Component } from "react";
import './App.css';
import Loading from './loading.svg';


let buf2Hex = (buffer) => { // buffer is an ArrayBuffer
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

class App extends Component {
  
  //Constructor and window resizing template
  constructor(props) {
    super(props);
    this.state = {
      debug: false,
      statusMessage: '',
      loading: false,
      deviceName: '',
      pairedDevice: null,
      currentService: null,
    }
  }

  //---- Start window resize trigger ----
  componentDidMount = () => {
    console.log("ZiO Setup App (Build v0.01)");
  }

  getFlashData = async val => {
    let buffer = new ArrayBuffer(4);
    let dv = new DataView(buffer);
    dv.setUint32(0, val, false);
    let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
    await flashAddress.writeValue(dv.buffer);
    return await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
  }

  flashEEPROM = async () => {
    let buffer = new ArrayBuffer(1);
    let dv = new DataView(buffer);
    dv.setUint8(0, 5, false);
    try {
      let flashAddress = await this.state.currentService.getCharacteristic('16d30bc8-f148-49bd-b127-8042df63ded0');
      await flashAddress.writeValue(dv.buffer);
    } catch(e) {
      console.log("ERROR: ", e);
    }
  }



  readAllFlashData = async () => {
    await this.flashEEPROM();
    console.log("Reading Flash Data..");
    //---- Bluetooth Advertising Length
    let bluetoothAdvertisingLengthChar = await this.getFlashData(0); // 0 = 0x00000
    let bluetoothAdvertisingLength = await bluetoothAdvertisingLengthChar.readValue();
    //console.log("BLA LENGTH:", bluetoothAdvertisingLength);
    let bluetoothAdvertisingLengthVal = await bluetoothAdvertisingLength.getUint32();
    //console.log("BLA LENGTH (Uint32):", bluetoothAdvertisingLengthVal);
    bluetoothAdvertisingLengthVal = bluetoothAdvertisingLengthVal > 32 ? 32 : bluetoothAdvertisingLengthVal;
    //---- Bluetooth Advertising Name
    let numCharsDecoded = 0;
    let bluetoothAdvertisingName = '';
    var enc = new TextDecoder("utf-8");
    while (numCharsDecoded * 4 < bluetoothAdvertisingLengthVal) {
      let bluetoothAdvertisingNameChar = await this.getFlashData(numCharsDecoded + 1); // 1 = 0x00001
      bluetoothAdvertisingName = bluetoothAdvertisingName + enc.decode(await bluetoothAdvertisingNameChar.readValue());
      //console.log("BLA NAME:", bluetoothAdvertisingName);
      numCharsDecoded ++;
    }
    //---- Serial Number String Length
    let serialNumberLengthChar = await this.getFlashData(9);
    let serialNumberLength = await serialNumberLengthChar.readValue();
    let serialNumberLengthVal = await serialNumberLength.getUint32();
    serialNumberLengthVal = bluetoothAdvertisingLengthVal > 16 ? 16 : bluetoothAdvertisingLengthVal;
    //---- Serial Number String
    numCharsDecoded = 0;
    let serialNumber = '';
    while (numCharsDecoded * 4 < serialNumberLengthVal) {
      let serialNumberChar = await this.getFlashData(numCharsDecoded + 10); 
      serialNumber = serialNumber + enc.decode(await serialNumberChar.readValue());
      //console.log("BLA NAME:", bluetoothAdvertisingName);
      numCharsDecoded ++;
    }
    //---- Device Model String Length
    let deviceModelLengthChar = await this.getFlashData(14);
    let deviceModelLength = await deviceModelLengthChar.readValue();
    let deviceModelLengthVal = await deviceModelLength.getUint32();
    deviceModelLengthVal = deviceModelLengthVal > 16 ? 16 : deviceModelLengthVal;
    //---- Device Model String
    numCharsDecoded = 0;
    let deviceModel = '';
    while (numCharsDecoded * 4 < deviceModelLengthVal) {
      let deviceModelChar = await this.getFlashData(numCharsDecoded + 15); 
      deviceModel = deviceModel + enc.decode(await deviceModelChar.readValue());
      //console.log("BLA NAME:", bluetoothAdvertisingName);
      numCharsDecoded ++;
    }
    //---- Device Model String Length
    let hardwareRevisionChar = await this.getFlashData(19);
    let hardwareRevision = await hardwareRevisionChar.readValue();
    let hardwareRevisionVal = buf2Hex(await hardwareRevision.buffer);
    console.log("v"+ parseInt(hardwareRevisionVal[0]+hardwareRevisionVal[1], 16)+'.'+ parseInt(hardwareRevisionVal[2]+hardwareRevisionVal[3], 16)+'.'+ parseInt(hardwareRevisionVal[4]+hardwareRevisionVal[5], 16));
    //---- Manufacturer ID
    let manufacturerIDChar = await this.getFlashData(20);
    let manufacturerID = await manufacturerIDChar.readValue();
    let manufacturerIDVal = await manufacturerID.getUint32();
    //---- Organization ID
    let organizationIDChar = await this.getFlashData(21);
    let organizationID = await organizationIDChar.readValue();
    let organizationIDVal = await organizationID.getUint32();
    //---- ZiO Batch ID
    let batchIDChar = await this.getFlashData(22);
    let batchID = await batchIDChar.readValue();
    let batchIDVal = await batchID.getUint32();
    //---- First Tested Date
    let firstTestedDateChar = await this.getFlashData(23);
    let firstTestedDate = await firstTestedDateChar.readValue();
    let firstTestedDateVal = await firstTestedDate.getUint32();
    console.log(firstTestedDateVal);
    //---- Last Tested Date
    let lastTestedDateChar = await this.getFlashData(24);
    let lastTestedDate = await lastTestedDateChar.readValue();
    let lastTestedDateVal = await lastTestedDate.getUint32();
    console.log(lastTestedDateVal);
    //---- Battery Install Date
    let batteryInstallDateChar = await this.getFlashData(25);
    let batteryInstallDate = await batteryInstallDateChar.readValue();
    let batteryInstallDateVal = await batteryInstallDate.getUint32();
    console.log(batteryInstallDateVal);
    //---- NFC Advertising On
    let NFCOnChar = await this.getFlashData(26);
    let NFCOn = await NFCOnChar.readValue();
    let NFCOnVal = await NFCOn.getUint32();
    //---- Cart Detection Bypass
    let cartDetectionChar = await this.getFlashData(26);
    let cartDetection = await cartDetectionChar.readValue();
    let cartDetectionVal = await cartDetection.getUint32();
    //---- SNR Off
    let SNRChar = await this.getFlashData(27);
    let SNR = await SNRChar.readValue();
    let SNRVal = await SNR.getUint32();
    //---- Output Raw
    let outputRawChar = await this.getFlashData(28);
    let outputRaw = await outputRawChar.readValue();
    let outputRawVal = await outputRaw.getUint32();
    //---- Standby Timeout
    let standbyChar = await this.getFlashData(29);
    let standby = await standbyChar.readValue();
    let standbyVal = await standby.getUint32();
    this.setState({
      loading: false, 
      blutoothAdvertisingLength: bluetoothAdvertisingLengthVal, 
      bluetoothAdvertisingName,
      serialNumberLength: serialNumberLengthVal,
      serialNumber,
      deviceModelLength: deviceModelLengthVal,
      deviceModel,
      hardwareRevision: hardwareRevisionVal,
      manufacturerID: manufacturerIDVal,
      organizationID: organizationIDVal,
      batchID: batchIDVal,
      firstTestedDate: firstTestedDateVal,
      lastTestedDate: lastTestedDateVal,
      batteryInstallDate: batteryInstallDateVal,
      NFCOn: NFCOnVal,
      cartDetection: cartDetectionVal,
      SNR: SNRVal,
      outputRaw: outputRawVal,
      standby: standbyVal,
    });
  }

  pairDevice = () => {
    console.log("Trying to pair...");
    let pairedDevice  = null;
    this.setState({loading: true, statusMessage: 'Pairing...'});
    //Below is a request that uses a filter, so no irrelevant bluetooth devices are shown
    navigator.bluetooth.requestDevice({acceptAllDevices: true,optionalServices: ['16d30bc1-f148-49bd-b127-8042df63ded0']})
    .then(device => {
      // Human-readable name of the device.
      console.log("connected to: " + device.name);
      pairedDevice = device;
      pairedDevice.addEventListener('gattserverdisconnected', this.onDisconnected);
      if (this.state.debug)
        console.log("pairedDevice", JSON.stringify(pairedDevice), pairedDevice, device);
      // Attempts to connect to remote GATT Server.
      return device.gatt.connect();
    })
    .then(server => {
      console.log("server", JSON.stringify(server));
      return server.getPrimaryService('16d30bc1-f148-49bd-b127-8042df63ded0');
    })
    .then(async service => {
      console.log("service", JSON.stringify(service));
      await this.setState({statusMessage: 'Paired to device. Now reading all flash data.', deviceName: pairedDevice.name, pairedDevice: pairedDevice, currentService: service}, this.readAllFlashData);
    })
    .catch(error => { 
      console.error("Connection failed", error);
      this.setState({loading: false, deviceName: true, deviceName: null, pairedDevice: null, currentService: null});
      if (pairedDevice)
        pairedDevice.gatt.disconnect();
    });
  }

  render() {
    return (
      <div className="App">
        {this.state.loading ?
          <div className="container flex-center" style={{width: '100%', height: '100%', alignItems: 'center'}}>
            <div style={{width: '100%', textAlign: 'center'}}>
              <img alt="loading" src={Loading}/>
              <br/>
              {this.state.statusMessage}
            </div>
          </div>
        :
          <div>
            {this.state.pairedDevice ?
              "Ans"
              :
              <div className="container flex-center" style={{width: '100%', height: '100%'}}>
                <div style={{width: '100%', textAlign: 'center'}}>
                  <h1> ZiO Setup App </h1>
                  <p> Click on the 'Pair Device' button below to get started. </p>
                </div>
                <div onClick={this.pairDevice} className="button" style={{fontSize: 27}}>
                  Pair Device
                </div>
              </div>
            }
          </div>
        }
      </div>
    );
  }
}

export default App;
