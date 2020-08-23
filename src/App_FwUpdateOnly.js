//App.js
//CRA 'create-react-app' Buttonless DFU Firmware Updater
import React, { Component } from "react";
import crc from "crc-32"
import SecureDfu from "web-bluetooth-dfu"
import fimware_zip from './ZioV8_1.2.6.zip'
import JSZip from "jszip"

class App extends Component {
  
  state = {
    statusMessage: "Click to Begin",
    button_function: "Connect to your device",
    dfu_zipFile: null,
    dfu_manifest: null,
    dfu_app_image: null,
    dfu_base_image: null,
  }

  //get the Dfu Image info on mount
  componentDidMount(){
    this.loadDfuFile(fimware_zip)
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
      console.log(base_image)
      this.setState({
        dfu_base_image: base_image,
      })
    })
    .then(() => {
      return this.getAppImage()
    })
    .then((app_image) => {
      console.log(app_image)
      this.setState({
        dfu_app_image: app_image,
      })
    })
  }

  //gets base image
  getBaseImage = async () => {
    return this.getImage(["softdevice", "bootloader", "softdevice_bootloader"]);
  }

  //gets app image
  getAppImage = async () => {
    return this.getImage(["application"]);
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
  
  // updates firmware image
  updateFirmware = async (dfu, device, image) => {
    try{
      console.log(device);
      console.log(image.initData);
      console.log(image.imageData);
      dfu.update(device, image.initData, image.imageData);
    }
    catch(e){
      console.log('UPDATE ERROR ' + e)
    }
  }

  //dfu process
  doDfu = async () => {

    var dfu = new SecureDfu(crc.buf, navigator.bluetooth)
    var device = null;
    
    // add event listener for un update progress
    dfu.addEventListener(SecureDfu.EVENT_PROGRESS, event => {
      if (event.object === "firmware") {
        var progress = 100 * event.currentBytes / event.totalBytes
        var msg = 'sending image ' + progress + '% complete'
        this.setState({ statusMessage: msg })
      }
    });

    //select device
    dfu.requestDevice(true)

    //dfu.requestDevice(false)
    ////set to dfu mode
    // .then((selectedDevice) => {
    //   device = selectedDevice
    //   console.log('selectedDevice', selectedDevice)
    //   this.setState({ statusMessage: 'Setting DFU Mode' })
    //   return dfu.setDfuMode(selectedDevice);
    // })

    //save device
    .then((dfu_device) => {
      console.log('dfu_device', dfu_device)
      device = dfu_device;
    })    
    //send base image
    .then(() => {   
      console.log('this.state.dfu_base_image', this.state.dfu_base_image)
      if(this.state.dfu_base_image) return this.updateFirmware(dfu, device, this.state.dfu_base_image);
    })
    //send app image
    .then(() => {
      console.log('this.state.dfu_app_image', this.state.dfu_app_image)
      if(this.state.dfu_app_image) return this.updateFirmware(dfu, device, this.state.dfu_app_image);
    })    
    .then(() => {
      console.log("Update complete");
      this.setState({ statusMessage: 'Update Complete' })
    })
    .catch(error => {
      console.log(error);
      var msg = 'Error ' + error.message
      this.setState({ statusMessage: msg })
    });
  }

  render() {
    return (
      <div className="App">
        <h1>CRA 'create-react-app' Buttonless DFU Firmware Updater</h1>
        <br/>
        <div>{this.state.statusMessage}</div>
        <br/>
        <button className="button" onClick={this.doDfu}>{this.state.button_function}</button>
      </div>
    );
  }
}

export default App;
