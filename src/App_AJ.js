import React, { Component } from "react";
import './App.css';
import Loading from './loading.svg';
import { tryStatement, throwStatement } from "@babel/types";


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

  getFlashDataInt = async address => {
    let buffer = new ArrayBuffer(4);
    let dv = new DataView(buffer);
    dv.setUint32(0, address, false);
    let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
    await flashAddress.writeValue(dv.buffer);
    let dataAddressChar  = await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
    let dataVal = await dataAddressChar.readValue()
    return await dataVal.getUint32(0, true);
  }

  getFlashDataString = async (address, length) => {
    let numCharsDecoded = 0;
    let enc = new TextDecoder("utf-8");
    let allString = '';
    while (numCharsDecoded * 4 < length) {
      let buffer = new ArrayBuffer(4);
      let dv = new DataView(buffer);
      dv.setUint32(0, address, false);
      let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
      await flashAddress.writeValue(dv.buffer);
      let dataAddressChar  = await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
      let dataVal = await dataAddressChar.readValue()
      allString = allString + enc.decode(dataVal);
      numCharsDecoded ++;
    }
    return await allString.split("").reverse().join("");
  }

  flashEEPROM = async () => {
    console.log('flashing EEPROM');
    let buffer = new ArrayBuffer(1);
    let dv = new DataView(buffer);
    dv.setUint8(0, 5, false);
    try {
      let flashAddress = await this.state.currentService.getCharacteristic('16d30bc8-f148-49bd-b127-8042df63ded0');
      await flashAddress.writeValue(dv.buffer);
      await new Promise(r => setTimeout(r, 3000));
    } catch(e) {
      console.log("ERROR: ", e);
    }
  }

  readAllFlashData = async () => {
    console.log("Reading Flash Data..");
    //---- Bluetooth Advertising Length
    let bluetoothAdvertisingLength = await this.getFlashDataInt(0); // 0 = 0x00000
    bluetoothAdvertisingLength = bluetoothAdvertisingLength > 31 ? 31 : bluetoothAdvertisingLength;
    //---- Bluetooth Advertising Name
    let bluetoothAdvertisingName = await this.getFlashDataString(1, bluetoothAdvertisingLength);
    //---- Serial Number String Length
    let serialNumberLength = await this.getFlashDataInt(9);
    serialNumberLength = serialNumberLength > 16 ? 16 : serialNumberLength;
    // //---- Serial Number String
    let serialNumber = await this.getFlashDataString(10, bluetoothAdvertisingLength);
    // //---- Device Model String Length
    let deviceModelLength = await this.getFlashDataInt(14);
    deviceModelLength = deviceModelLength > 16 ? 16 : deviceModelLength;
    // //---- Device Model String
    let deviceModel = await this.getFlashDataString(15, bluetoothAdvertisingLength);
    console.log(deviceModel);
    // //---- Hardware revision
    let buffer = new ArrayBuffer(4);
    let dv = new DataView(buffer);
    dv.setUint32(0, 19, false);
    let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
    await flashAddress.writeValue(dv.buffer);
    let dataAddressChar  = await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
    let dataVal = await dataAddressChar.readValue();
    let hardwareRevisionHex = buf2Hex(await dataVal.buffer);
    let hardwareRevision= "v"+ parseInt(hardwareRevisionHex[0]+hardwareRevisionHex[1], 16)+'.'+ parseInt(hardwareRevisionHex[2]+hardwareRevisionHex[3], 16)+'.'+ parseInt(hardwareRevisionHex[4]+hardwareRevisionHex[5], 16);
    // //---- Manufacturer ID
    let manufacturerID = await this.getFlashDataInt(20);
    // //---- Organization ID
    let organizationID = await this.getFlashDataInt(21);
    // //---- ZiO Batch ID
    let batchID = await this.getFlashDataInt(22);
    // //---- First Tested Date
    let firstTestedDate = await this.getFlashDataInt(23);
    // //---- Last Tested Date
    let lastTestedDate = await this.getFlashDataInt(24);
    // //---- Battery Install Date
    let batteryInstallDate = await this.getFlashDataInt(25);
    // //---- NFC Advertising On
    let NFCOn = await this.getFlashDataInt(26);
    // //---- Cart Detection Bypass
    let cartDetection = await this.getFlashDataInt(26);
    // //---- SNR Off
    let SNR = await this.getFlashDataInt(27);
    // //---- Output Raw
    let outputRaw = await this.getFlashDataInt(28);
    // //---- Standby Timeout
    let standby = await this.getFlashDataInt(29);
    this.setState({
      loading: false, 
      bluetoothAdvertisingLength, 
      bluetoothAdvertisingName,
      serialNumberLength,
      serialNumber,
      deviceModelLength,
      deviceModel,
      hardwareRevision,
      manufacturerID,
      organizationID,
      batchID,
      firstTestedDate,
      lastTestedDate,
      batteryInstallDate,
      NFCOn,
      cartDetection,
      SNR,
      outputRaw,
      standby,
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

  //Handling Input Change
  handleChange = (e) => {
    let {name, value, type} = e.target
    this.setState({[name] : type === "number" ? parseInt(value, 10) : value});
  }

  writeFlashDataInt = async (address, value) => {
    try {
      console.log('writing: ', 'address', address, 'value', value);
      let buffer = new ArrayBuffer(4);
      let dv = new DataView(buffer);
      dv.setUint32(0, address, false);
      let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
      await flashAddress.writeValue(dv.buffer);
      await new Promise(r => setTimeout(r, 2000));

      buffer = new ArrayBuffer(4);
      dv = new DataView(buffer);
      dv.setUint32(0, value, false);
      let flashData = await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
      await flashData.writeValue(dv.buffer);
      await new Promise(r => setTimeout(r, 2000));

      await this.writeFlash();
    } catch(e) {
      console.error(e);
    } 
  }

  writeFlashDataString = async (address, value) => {
    try {
      let numCharsEncoded = 0;
      while (numCharsEncoded * 4 < this.state.bluetoothAdvertisingLength) {
        //---- Set address
        let buffer = new ArrayBuffer(4);
        let dv = new DataView(buffer);
        dv.setUint32(0, address+numCharsEncoded, false);
        console.log('address ting', address+numCharsEncoded, address, numCharsEncoded);
        let flashAddress = await this.state.currentService.getCharacteristic('16d30bcf-f148-49bd-b127-8042df63ded0');
        await flashAddress.writeValue(dv.buffer);
        //---- Get hex from string
        let stringBatch = value.substring(numCharsEncoded * 4, (numCharsEncoded * 4) + 4);
        const encoded = new Buffer.alloc(4,stringBatch).toString('hex');
        console.log(encoded, parseInt(encoded, 16));
        //---- Set value
        buffer = new ArrayBuffer(4);
        dv = new DataView(buffer);
        dv.setUint32(0, parseInt(encoded, 16), false);
        let flashData = await this.state.currentService.getCharacteristic('16d30bd0-f148-49bd-b127-8042df63ded0');
        await flashData.writeValue(dv.buffer);
        //---- Write Value
        await this.writeFlash();
        numCharsEncoded ++;
      }
    } catch(e) {
      console.error(e);
    } 
  }

  writeFlash = async () => {
    let buffer = new ArrayBuffer(1);
    let dv = new DataView(buffer);
    dv.setUint8(0, 6, false);
    let writeFlash = await this.state.currentService.getCharacteristic('16d30bc8-f148-49bd-b127-8042df63ded0');
    await writeFlash.writeValue(dv.buffer);
    await new Promise(r => setTimeout(r, 5000));
  }

  updateAllFlashData = async () =>  {
    // if (!this.isUpdateValid()) {
    //   return;
    // }
    this.setState({loading: true, statusMessage: 'Flashing EEPROM...'});
    await this.flashEEPROM();
    this.setState({statusMessage: 'EEPROM Flashed. Now writing new values...'});
    await this.writeFlashDataInt(0, 3);
    await this.writeFlashDataInt(1, 1512124416);
    await this.writeFlashDataInt(9, 4);
    await this.writeFlashDataInt(10, 1399747949);
    //await this.writeFlashDataString(1, this.state.bluetoothAdvertisingName);
    // await this.writeFlashDataInt(14, this.state.deviceModelLength);
    // await this.writeFlashDataInt(20, this.state.manufacturerID);
    // await this.writeFlashDataInt(21, this.state.organizationID);
    // await this.writeFlashDataInt(22, this.state.batchID);
    // await this.writeFlashDataInt(23, this.state.firstTestedDate);
    //TODO STRING GET
    this.setState({statusMessage: 'Finished Writing Values. Now reading all values...'});
    await this.readAllFlashData();
    this.setState({loading: false});
  }

  isUpdateValid = () => {
    console.log(this.state.bluetoothAdvertisingLength);
    if (this.state.bluetoothAdvertisingLength > 31 || this.state.bluetoothAdvertisingLength < 0) {
      alert('Bluetooth Advertising Name Length must be a positive number less than 32');
      return false;
    } 
    if (this.state.bluetoothAdvertisingName.length > this.state.bluetoothAdvertisingLength) {
      alert('Bluetooth Advertising Name cannot be longer than the Bluetooth Advertising Name Length');
      return false;
    }
    if (this.state.serialNumberLength > 16 || this.state.serialNumberLength < 0) {
      alert('Serial Number Length must be a positive number less than 16');
      return false;
    }
    return true;

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
          <div className="width-container">
            {this.state.pairedDevice ?
              <div className="container flex-center" style={{width: '100%', height: '100%'}}>
                <div className="flex-center">
                  <p style={{width: '100%', textAlign: 'center'}}> Update the fields below and press the 'Flash EEPROM' button to write values to device.</p>
                  <div onClick={this.updateAllFlashData} className="button" style={{fontSize: 27, margin: '30px 0'}}>
                    Flash EEPROM
                  </div>
                </div>
                <div className="form-container flex-center">
                  <div className="field">
                    <div className="label">
                      Bluetooth Advertising Name Length
                    </div>
                    <br/>
                    <input name="bluetoothAdvertisingLength" onChange={this.handleChange} type="number" value={this.state.bluetoothAdvertisingLength}/>
                  </div>


                  <div className="field">
                    <div className="label">
                      Bluetooth Advertising Name
                    </div>
                    <br/>
                    <input name="bluetoothAdvertisingName"  onChange={this.handleChange} type="text" value={this.state.bluetoothAdvertisingName}/>
                  </div>


                  <div className="field">
                    <div className="label">
                      Serial Number String Length
                    </div>
                    <br/>
                    <input  name="serialNumberLength" onChange={this.handleChange} type="number" value={this.state.serialNumberLength}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Serial Number
                    </div>
                    <br/>
                    <input name="serialNumber"  onChange={this.handleChange} type="text" value={this.state.serialNumber}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Device Model String Length
                    </div>
                    <br/>
                    <input name="deviceModelLength"  onChange={this.handleChange} type="number" value={this.state.deviceModelLength}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Device Model
                    </div>
                    <br/>
                    <input name="deviceModel"  onChange={this.handleChange} type="text" value={this.state.deviceModel}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Hardware Revision ({this.state.hardwareRevisionString})
                    </div>
                    <br/>
                    <input name="hardwareRevision"  onChange={this.handleChange} type="text" value={this.state.hardwareRevision}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Manufacturer ID
                    </div>
                    <br/>
                    <input name="manufacturerID"  onChange={this.handleChange} type="number" value={this.state.manufacturerID}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Organization ID
                    </div>
                    <br/>
                    <input name="organizationID"  onChange={this.handleChange} type="number" value={this.state.organizationID}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Zio Batch ID
                    </div>
                    <br/>
                    <input name="batchID"  onChange={this.handleChange} type="number" value={this.state.batchID}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      First Tested Date
                    </div>
                    <br/>
                    <input name="firstTestedDate"  onChange={this.handleChange} type="text" value={this.state.firstTestedDate}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Last Tested Date
                    </div>
                    <br/>
                    <input name="lastTestedDate"  onChange={this.handleChange} type="text" value={this.state.lastTestedDate}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Battery Install Date
                    </div>
                    <br/>
                    <input name="batteryInstallDate"  onChange={this.handleChange} type="text" value={this.state.batteryInstallDate}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      NFC Advertising On
                    </div>
                    <br/>
                    <input name="NFCOn"  onChange={this.handleChange} type="number" value={this.state.NFCOn}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Cart Detection Bypass
                    </div>
                    <br/>
                    <input name="cartDetection"  onChange={this.handleChange} type="number" value={this.state.cartDetection}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      SNR Off
                    </div>
                    <br/>
                    <input name="SNR"  onChange={this.handleChange} type="number" value={this.state.SNR}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Output Raw data
                    </div>
                    <br/>
                    <input onChange={this.handleChange} type="number" value={this.state.outputRaw}/>
                  </div>

                  <div className="field">
                    <div className="label">
                      Standby Timeout
                    </div>
                    <br/>
                    <input name="standby"  onChange={this.handleChange} type="number" value={this.state.standby}/>
                  </div>
                </div>

                <div onClick={this.updateAllFlashData} className="button" style={{fontSize: 27, margin: '30px 0'}}>
                  Flash EEPROM
                </div>
              </div>
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
