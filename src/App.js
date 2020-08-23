import React, { Component, cloneElement } from "react";
import device_connecting_svg from './device_connecting.svg';
import EepromFields from './EepromFields.js'
import ProgressBar from './ProgressBar'
import './App_AJ.css';
import crc from "crc-32"
import SecureDfu, { BluetoothLEScanFilterInit } from "web-bluetooth-dfu"
import fimware_zip from './ZioV8_1.2.7.zip'
import JSZip from "jszip"

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
    dfu_zipFile: null,
    dfu_manifest: null,
    dfu_mode_on: false,
    dfu_step_msg: 'Prepare Firmware File',
    dfu_step_state: 0,
    dfu_obj: null,
    dfu_app_image: null,
    dfu_base_image: null,

    
    dfu_mode_connecting: false,

  }

  componentDidMount(){
    console.log('Zio Setup Centre v0.16.2');
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

  // Load a file, return the bytes in that file as an array
  loadDfuFile = async (my_file) => {

    //get the local file
    console.log(my_file);
    const response = await fetch(my_file);
    if (!response.ok) {
        throw new Error("HTTP error " + response.status);
    }
    //convert to byte array
    const array = new Uint8Array(await response.arrayBuffer());

    //unzip the zip file
    JSZip.loadAsync(array)
    .then(zip_file => {
      console.log(zip_file);
      this.setState({
        dfu_zipFile: zip_file,
      }) 
      try{
          return this.state.dfu_zipFile.file("manifest.json").async("string");
      } catch(e) {
          throw new Error("Unable to find manifest, is this a proper DFU package?");
      }
    })
    .then(content => {
      this.setState({
        dfu_manifest: JSON.parse(content).manifest,
      }) 
      console.log(this.state.dfu_manifest);
    })
    .then(() => {
      return this.getBaseImage()
    })
    .then((base_image) => {
      this.setState({
        dfu_base_image: base_image,
      })
    })
    .then(() => {
      return this.getAppImage()
    })
    .then((app_image) => {
      this.setState({
        dfu_app_image: app_image,
      })
    })
  }

  // gets the images from the zip
  getImage = async (types) => {
    for (var type of types) {
      console.log('checking if the update contains a ' + type)
      if (this.state.dfu_manifest[type]) {
          console.log(type + ' exists')
          var entry = this.state.dfu_manifest[type];
          var res = {
              type: type,
              initFile: entry.dat_file,
              imageFile: entry.bin_file
          };

          return this.state.dfu_zipFile.file(res.initFile).async("arraybuffer")
          .then(data => {
              res.initData = data;
              return this.state.dfu_zipFile.file(res.imageFile).async("arraybuffer")
          })
          .then(data => {
              res.imageData = data;
              return res;
          });
      }
      else{
        console.log('update does not contain a ' + type)
      }
    }
  };  
  
  //gets base image
  getBaseImage = async (types) => {
    return this.getImage(["softdevice", "bootloader", "softdevice_bootloader"]);
  }

  //gets app image
  getAppImage = async (types) => {
    return this.getImage(["application"]);
  }

  // updates firmware image
  updateFirmware = async (dfu, device, image) => {
    try{
      console.log(device);
      console.log(image.initData);
      console.log(image.imageData);
      await dfu.update(device, image.initData, image.imageData);
    }
    catch(e){
      console.log('UPDATE ERROR ' + e)
    }
  }

  //dfu process
  doDfu = async () => {

      //dfu_step_state = 0; prepare firmware & dfu
      if(this.state.dfu_step_state === 0){
        
        //set dfu
        var dfu = await new SecureDfu(crc.buf, navigator.bluetooth);
        this.setState({
          dfu_obj: dfu,
        })

        // add event listener for un update progress
        this.setState({ dfu_progress: 0 })
        this.state.dfu_obj.addEventListener(SecureDfu.EVENT_PROGRESS, event => {
          if (event.object === "firmware") {
            var progress = event.currentBytes / event.totalBytes
            console.log(progress);
            this.setState({ dfu_progress: progress })
          }
        });

        //get the content and manifest from the zip file
        await this.loadDfuFile(fimware_zip)

        //set state
        this.setState({
          dfu_step_state: 1,
          dfu_step_msg: 'Save app image'
        })
      }

      //save the app image into state
      else if(this.state.dfu_step_state === 1){
        //save the app image into state
        // var app_image = await this.getAppImage();
        // this.setState({
        //   dfu_app_image: app_image,
        // })

        //set state
        this.setState({
          dfu_step_state: 2,
          dfu_step_msg: 'Select Zio Device'
        })
      }

      //dfu_step_state = 2; set to DFU mode
      else if(this.state.dfu_step_state === 2){

        //get the device
        this.state.dfu_obj.requestDevice(true)
        .then(device => {

          //device not selected
          if(device === null){         
            //set state
            this.setState({
              dfu_step_state: 3,
              dfu_step_msg: 'Select Dfu Device (1)'
            })
          }

          //device updating
          else{
            this.updateFirmware(this.state.dfu_obj, device, this.state.dfu_app_image);
            //set state
            this.setState({
              dfu_step_state: 0,
              dfu_step_msg: 'Updating First Go!'
            })
          }

        });

      }

      //dfu_step_state = 3; perform the update
      else if(this.state.dfu_step_state === 3){

        //get the device
        this.state.dfu_obj.requestDevice(true)
        .then(device => {

          //device not selected
          if(device === null){         
            //set state
            this.setState({
              dfu_step_state: 3,
              dfu_step_msg: 'Select Dfu Device (2)'
            })
          }

          //device updating
          else{
            this.updateFirmware(this.state.dfu_obj, device, this.state.dfu_app_image);
            //set state
            this.setState({
              dfu_step_state: 3,
              dfu_step_msg: 'Updating Second Go!'
            })
          }
          
        });

      }

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

  //set status message from child component
  updateStatusMsg = (msg) => {
    this.setState({statusMessage: msg})
  }

  render() {
    return (
      <div className="App">

        <header className="App-header">
          <h1>Welcome to the Zio Setup Centre</h1>
          <div>{this.state.statusMessage}</div><br/>
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
          <div>
            <h2>Firmware Version: {this.state.firmware_version}</h2>
            <p>For an online tool to update the firmware version please <a href="https://thegecko.github.io/web-bluetooth-dfu/examples/web.html" target="_blank" rel="noopener noreferrer">click here</a></p>
            <br/><br/>
          </div>
          )}
        </div>

        {/* Fields to be edited */}
        <div className="eeprom-fields">
          {/* Show/Hide Fields */}
          {this.state.device_connected && ( 
          <EepromFields device={this.state.pairedDevice} update_status_msg={this.updateStatusMsg} />
          )}
        </div>

        <br/>
        <br/>
        <p>If you have any problems, <a href="https://docs.google.com/forms/d/e/1FAIpQLSdo2MIEHSg9ZsYYtN0h7M2preLRf5cg_PhW9mownfdtNeCjAw/viewform?usp=sf_link" target="_blank" rel="noopener noreferrer"> click here</a> to report to Zio Health.</p>
        <br/>
        <p>Last Updated 23rd Aug 2020</p>
      </div>
    );
  }
}

export default App;
